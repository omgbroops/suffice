use napi::{Error, JsString, Result};
use napi_derive::napi;
use std::panic::{catch_unwind, AssertUnwindSafe};
use suffice_live::{Registry, State, MAX_ID_BYTES, PROTOCOL_VERSION};

#[napi]
pub fn live_run_protocol_version() -> u32 {
    PROTOCOL_VERSION
}

#[napi(object)]
pub struct LiveRunState {
    pub slot: u32,
    pub generation: u32,
    pub busy: bool,
    pub started: bool,
    pub retiring: Option<bool>,
    pub failed: bool,
    pub thread_id: Option<String>,
    pub client_id: Option<String>,
    pub created: Option<bool>,
}

impl From<&State> for LiveRunState {
    fn from(state: &State) -> Self {
        Self {
            slot: state.slot,
            generation: state.generation,
            busy: state.busy,
            started: state.started,
            retiring: state.retiring.then_some(true),
            failed: state.failed,
            thread_id: state.thread_id.as_deref().map(str::to_owned),
            client_id: state.client_id.as_deref().map(str::to_owned),
            created: None,
        }
    }
}

#[napi(object)]
pub struct LiveRunSettlement {
    pub state: LiveRunState,
    pub forgotten: bool,
}

// N-API's u32 conversion truncates fractions and wraps out-of-range numbers.
// Reject them before they can select an unrelated slot or generation.
fn ticket(value: f64) -> Result<u32> {
    if value.fract() != 0.0 || !(1.0..=f64::from(u32::MAX)).contains(&value) {
        return Err(Error::from_reason("Invalid live run slot or generation"));
    }
    Ok(value as u32)
}

fn read_id(value: JsString) -> Result<String> {
    let size = value.utf8_len()?;
    if size == 0 || size > MAX_ID_BYTES {
        return Err(Error::from_reason("Invalid live run ID"));
    }
    // The host escapes exceptional UTF-16 units before passing IDs. Reject
    // direct callers' unmappable units; silently replacing them would alias
    // the different JavaScript ID that literally contains U+FFFD.
    value.into_utf16()?.as_str()
}

#[napi]
#[derive(Default)]
pub struct LiveRunRegistry {
    core: Registry,
}

impl LiveRunRegistry {
    fn guarded<T>(&mut self, action: impl FnOnce(&mut Registry) -> Result<T>) -> Result<T> {
        match catch_unwind(AssertUnwindSafe(|| action(&mut self.core))) {
            Ok(result) => result,
            Err(_) => {
                self.core.shutdown();
                Err(Error::from_reason(
                    "Live run registry failed and was shut down",
                ))
            }
        }
    }
}

#[napi]
impl LiveRunRegistry {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    #[napi(getter)]
    pub fn version(&self) -> u32 {
        live_run_protocol_version()
    }

    #[napi(getter)]
    pub fn stopped(&self) -> bool {
        self.core.stopped()
    }

    #[napi]
    pub fn admit(
        &mut self,
        resume_id: Option<JsString>,
        client_id: Option<JsString>,
        selected_slot: Option<f64>,
    ) -> Result<LiveRunState> {
        self.guarded(|core| {
            let resume = resume_id.map(read_id).transpose()?;
            let client = client_id.map(read_id).transpose()?;
            let admission = core
                .admit(
                    resume.as_deref(),
                    client.as_deref(),
                    selected_slot.map(ticket).transpose()?,
                )
                .map_err(Error::from_reason)?;
            let mut state = LiveRunState::from(&admission.state);
            state.created = Some(admission.created);
            Ok(state)
        })
    }

    #[napi]
    pub fn resolve(&mut self, id: JsString) -> Result<Option<LiveRunState>> {
        self.guarded(|core| {
            Ok(core
                .resolve(&read_id(id)?)
                .map_err(Error::from_reason)?
                .map(LiveRunState::from))
        })
    }

    #[napi]
    pub fn state(&mut self, slot: f64) -> Result<Option<LiveRunState>> {
        self.guarded(|core| Ok(core.state(ticket(slot)?).map(LiveRunState::from)))
    }

    #[napi]
    pub fn bind(
        &mut self,
        slot: f64,
        generation: f64,
        id: JsString,
    ) -> Result<Option<LiveRunState>> {
        self.guarded(|core| {
            Ok(core
                .bind(ticket(slot)?, ticket(generation)?, &read_id(id)?)
                .map_err(Error::from_reason)?
                .as_ref()
                .map(LiveRunState::from))
        })
    }

    #[napi]
    pub fn settle(
        &mut self,
        slot: f64,
        generation: f64,
        failed: bool,
    ) -> Result<Option<LiveRunSettlement>> {
        self.guarded(|core| {
            Ok(core
                .settle(ticket(slot)?, ticket(generation)?, failed)
                .map(|result| LiveRunSettlement {
                    state: LiveRunState::from(&result.state),
                    forgotten: result.forgotten,
                }))
        })
    }

    #[napi]
    pub fn begin_release(&mut self, slot: f64, generation: f64) -> Result<Option<u32>> {
        self.guarded(|core| {
            core.begin_release(ticket(slot)?, ticket(generation)?)
                .map_err(Error::from_reason)
        })
    }
    #[napi]
    pub fn end_release(&mut self, slot: f64, generation: f64, disposed: bool) -> Result<bool> {
        self.guarded(|core| Ok(core.end_release(ticket(slot)?, ticket(generation)?, disposed)))
    }

    #[napi]
    pub fn forget(&mut self, slot: f64, generation: f64) -> Result<bool> {
        self.guarded(|core| {
            core.forget(ticket(slot)?, ticket(generation)?)
                .map_err(Error::from_reason)
        })
    }

    #[napi]
    pub fn shutdown(&mut self) -> Result<()> {
        self.guarded(|core| {
            core.shutdown();
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn panic_discards_routes_and_refuses_replay() {
        let mut registry = LiveRunRegistry::new();
        registry
            .core
            .admit(Some("saved"), Some("draft"), None)
            .unwrap();
        let failed = registry.guarded::<()>(|_| panic!("injected registry failure"));
        assert!(failed.is_err());
        assert!(registry.stopped());
        assert!(registry.core.resolve("saved").unwrap().is_none());
        assert!(registry
            .core
            .admit(Some("saved"), Some("draft"), None)
            .is_err());
    }
}
