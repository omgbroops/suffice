//! Worker-local authority for live run slots. This crate has no filesystem,
//! process, network, credential or model capabilities.
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_ID_BYTES: usize = 4096;
const MAX_SLOTS: usize = 16_384;
const MAX_ALIASES: usize = 65_536;
const MAX_ALIAS_BYTES: usize = 8 * 1024 * 1024;
const BUSY: &str = "A task is already running in this thread";
const STOPPED: &str = "Harness is shutting down";
type Result<T> = std::result::Result<T, &'static str>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct State {
    pub slot: u32,
    pub generation: u32,
    pub thread_id: Option<Arc<str>>,
    pub client_id: Option<Arc<str>>,
    pub busy: bool,
    pub started: bool,
    pub retiring: bool,
    pub failed: bool,
}

struct Slot {
    state: State,
    aliases: HashSet<Arc<str>>,
    provisional: bool,
}

pub struct Admission {
    pub state: State,
    pub created: bool,
}
pub struct Settlement {
    pub state: State,
    pub forgotten: bool,
}

#[derive(Default)]
pub struct Registry {
    slots: HashMap<u32, Slot>,
    aliases: HashMap<Arc<str>, u32>,
    alias_bytes: usize,
    next_slot: u32,
    stopped: bool,
}

impl Registry {
    pub fn stopped(&self) -> bool {
        self.stopped
    }

    pub fn state(&self, slot: u32) -> Option<&State> {
        self.slots.get(&slot).map(|s| &s.state)
    }

    pub fn resolve(&self, id: &str) -> Result<Option<&State>> {
        validate_id(id)?;
        Ok(self.aliases.get(id).and_then(|slot| self.state(*slot)))
    }

    // All checks precede mutation. JS never needs to undo one alias after a
    // conflicting second alias or a host creation failure.
    pub fn admit(
        &mut self,
        resume: Option<&str>,
        client: Option<&str>,
        selected: Option<u32>,
    ) -> Result<Admission> {
        if self.stopped {
            return Err(STOPPED);
        }
        for id in [resume, client].into_iter().flatten() {
            validate_id(id)?;
        }
        if selected.is_some_and(|slot| !self.slots.contains_key(&slot)) {
            return Err("Unknown live run slot");
        }
        let existing = selected.or_else(|| resume.and_then(|id| self.aliases.get(id).copied()));
        let created = existing.is_none();
        let slot = match existing {
            Some(id) => id,
            None => self
                .next_slot
                .checked_add(1)
                .ok_or("Live run slot IDs exhausted")?,
        };
        if self.state(slot).is_some_and(|s| s.busy || s.retiring) {
            return Err(BUSY);
        }
        for id in [resume, client].into_iter().flatten() {
            if self.resolve(id)?.is_some_and(|s| s.busy || s.retiring) {
                return Err(BUSY);
            }
        }
        if created && self.slots.len() >= MAX_SLOTS {
            return Err("Live run slot limit reached");
        }
        let generation = self
            .state(slot)
            .map_or(Some(1), |s| s.generation.checked_add(1))
            .ok_or("Live run generation exhausted")?;
        // A client alias can be reused by a later UI draft once its former
        // run is idle. It must never take over another host's canonical ID.
        let initial = if created { resume } else { None };
        self.check_claims(slot, initial, client)?;

        if created {
            self.next_slot = slot;
            self.slots.insert(
                slot,
                Slot {
                    state: State {
                        slot,
                        generation,
                        thread_id: None,
                        client_id: None,
                        busy: false,
                        started: false,
                        retiring: false,
                        failed: false,
                    },
                    aliases: HashSet::new(),
                    provisional: false,
                },
            );
        }
        let thread_id = initial.map(|id| self.claim(slot, id));
        let client_id = client.map(|id| self.claim(slot, id));
        let record = self.slots.get_mut(&slot).expect("admitted slot exists");
        if created {
            record.state.thread_id = thread_id;
        }
        record.state.client_id = client_id;
        record.state.generation = generation;
        record.state.busy = true;
        record.state.failed = false;
        record.provisional = created;
        Ok(Admission {
            state: record.state.clone(),
            created,
        })
    }

    pub fn bind(&mut self, slot: u32, generation: u32, id: &str) -> Result<Option<State>> {
        if !self.current_turn(slot, generation) {
            return Ok(None);
        }
        validate_id(id)?;
        self.check_claims(slot, Some(id), None)?;
        let canonical = self.claim(slot, id);
        let record = self.slots.get_mut(&slot).expect("current turn exists");
        record.state.started = true;
        record.state.thread_id = Some(canonical);
        Ok(Some(record.state.clone()))
    }

    pub fn settle(&mut self, slot: u32, generation: u32, failed: bool) -> Option<Settlement> {
        if !self.current_turn(slot, generation) {
            return None;
        }
        let record = self.slots.get_mut(&slot).expect("current turn exists");
        record.state.busy = false;
        record.state.failed = failed;
        let forgotten = failed && record.provisional && !record.state.started;
        record.provisional = false;
        let state = record.state.clone();
        if forgotten {
            self.remove(slot);
        }
        Some(Settlement { state, forgotten })
    }

    pub fn begin_release(&mut self, slot: u32, generation: u32) -> Result<Option<u32>> {
        let Some(record) = self.slots.get_mut(&slot) else {
            return Ok(None);
        };
        let state = &mut record.state;
        if state.generation != generation {
            return Ok(None);
        }
        if state.busy || state.retiring {
            return Err("Stop this thread before deleting it");
        }
        state.generation = generation
            .checked_add(1)
            .ok_or("Live run generation exhausted")?;
        state.retiring = true;
        Ok(Some(state.generation))
    }

    pub fn end_release(&mut self, slot: u32, generation: u32, disposed: bool) -> bool {
        let Some(record) = self.slots.get_mut(&slot) else {
            return false;
        };
        if !record.state.retiring || record.state.generation != generation {
            return false;
        }
        if disposed {
            self.remove(slot);
        } else {
            record.state.retiring = false;
        }
        true
    }

    pub fn forget(&mut self, slot: u32, generation: u32) -> Result<bool> {
        let Some(state) = self.state(slot) else {
            return Ok(false);
        };
        if state.generation != generation {
            return Ok(false);
        }
        if state.busy || state.retiring {
            return Err("Stop this thread before deleting it");
        }
        self.remove(slot);
        Ok(true)
    }

    pub fn shutdown(&mut self) {
        self.stopped = true;
        self.slots.clear();
        self.aliases.clear();
        self.alias_bytes = 0;
    }

    fn current_turn(&self, slot: u32, generation: u32) -> bool {
        self.state(slot)
            .is_some_and(|s| s.busy && s.generation == generation)
    }

    fn check_claims(&self, slot: u32, first: Option<&str>, second: Option<&str>) -> Result<()> {
        let mut count = self.aliases.len();
        let mut bytes = self.alias_bytes;
        for id in [first, second.filter(|id| Some(*id) != first)]
            .into_iter()
            .flatten()
        {
            if let Some(owner) = self.aliases.get(id) {
                if *owner != slot {
                    let previous = &self.slots[owner].state;
                    if previous.busy || previous.retiring {
                        return Err(BUSY);
                    }
                    if previous.thread_id.as_deref() == Some(id) {
                        return Err("Thread ID belongs to another live host");
                    }
                }
            } else {
                count += 1;
                bytes += id.len();
            }
        }
        if count > MAX_ALIASES || bytes > MAX_ALIAS_BYTES {
            return Err("Live run alias limit reached");
        }
        Ok(())
    }

    fn claim(&mut self, slot: u32, id: &str) -> Arc<str> {
        let key = if let Some((key, owner)) = self.aliases.get_key_value(id) {
            let key = key.clone();
            let owner = *owner;
            if owner == slot {
                return key;
            }
            self.slots
                .get_mut(&owner)
                .expect("alias owner exists")
                .aliases
                .remove(id);
            key
        } else {
            self.alias_bytes += id.len();
            Arc::from(id)
        };
        self.aliases.insert(key.clone(), slot);
        self.slots
            .get_mut(&slot)
            .expect("admitted slot exists")
            .aliases
            .insert(key.clone());
        key
    }

    fn remove(&mut self, slot: u32) {
        if let Some(record) = self.slots.remove(&slot) {
            for alias in record.aliases {
                self.alias_bytes -= alias.len();
                self.aliases.remove(&alias);
            }
        }
    }
}

fn validate_id(id: &str) -> Result<()> {
    if id.is_empty() || id.len() > MAX_ID_BYTES {
        return Err("Invalid live run ID");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exhausted_generation_cannot_wrap_and_bind_an_old_ticket() {
        let mut r = Registry::default();
        let state = r.admit(Some("saved"), None, None).unwrap().state;
        r.settle(state.slot, state.generation, false);
        r.slots.get_mut(&state.slot).unwrap().state.generation = u32::MAX;
        assert_eq!(
            r.admit(Some("saved"), Some("new"), None).err(),
            Some("Live run generation exhausted")
        );
        assert!(r.resolve("new").unwrap().is_none());
        assert!(!r.state(state.slot).unwrap().busy);
        assert!(r.bind(state.slot, 1, "late").unwrap().is_none());
    }

    #[test]
    fn slot_ids_do_not_reappear_after_exhaustion() {
        let mut r = Registry {
            next_slot: u32::MAX - 1,
            ..Registry::default()
        };
        let state = r.admit(Some("last"), None, None).unwrap().state;
        assert_eq!(state.slot, u32::MAX);
        assert!(
            r.settle(state.slot, state.generation, true)
                .unwrap()
                .forgotten
        );
        assert_eq!(
            r.admit(Some("next"), None, None).err(),
            Some("Live run slot IDs exhausted")
        );
        assert!(r.state(state.slot).is_none());
    }
}
