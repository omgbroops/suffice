use suffice_live::{Registry, MAX_ID_BYTES};

#[test]
fn two_alias_admission_is_atomic_and_independent_slots_can_run() {
    let mut registry = Registry::default();
    let a = registry.admit(Some("saved"), Some("draft"), None).unwrap();
    assert!(a.created && a.state.busy);
    assert_eq!(
        registry.admit(Some("second"), Some("draft"), None).err(),
        Some("A task is already running in this thread")
    );
    assert!(registry.resolve("second").unwrap().is_none());
    let b = registry.admit(Some("other"), None, None).unwrap();
    assert_ne!(a.state.slot, b.state.slot);
    assert!(registry.bind(b.state.slot, 1, "saved").is_err());
    assert_eq!(
        registry.state(b.state.slot).unwrap().thread_id.as_deref(),
        Some("other")
    );
    assert!(!registry.state(b.state.slot).unwrap().started);
    assert!(registry
        .bind(a.state.slot, 1, "canonical")
        .unwrap()
        .is_some());
    for id in ["saved", "draft", "canonical"] {
        assert_eq!(registry.resolve(id).unwrap().unwrap().slot, a.state.slot);
    }
    assert_eq!(
        registry.forget(a.state.slot, 1).err(),
        Some("Stop this thread before deleting it")
    );
}

#[test]
fn old_generation_has_no_authority_over_new_work() {
    let mut r = Registry::default();
    let first = r.admit(None, Some("draft"), None).unwrap().state;
    r.bind(first.slot, first.generation, "canonical").unwrap();
    assert!(
        !r.settle(first.slot, first.generation, false)
            .unwrap()
            .forgotten
    );
    let second = r.admit(Some("draft"), None, None).unwrap();
    assert!(!second.created);
    assert_eq!(second.state.slot, first.slot);
    assert_eq!(second.state.generation, first.generation + 1);
    assert!(second.state.client_id.is_none());
    assert!(r.settle(first.slot, first.generation, true).is_none());
    assert!(r
        .bind(first.slot, first.generation, "late")
        .unwrap()
        .is_none());
    assert!(!r.forget(first.slot, first.generation).unwrap());
    assert_eq!(r.state(first.slot), Some(&second.state));
    assert!(r.resolve("late").unwrap().is_none());
    assert!(
        !r.settle(second.state.slot, second.state.generation, true)
            .unwrap()
            .forgotten
    );
    assert!(r.resolve("canonical").unwrap().unwrap().failed);
    assert!(r.forget(first.slot, second.state.generation).unwrap());
    for id in ["canonical", "draft"] {
        assert!(r.resolve(id).unwrap().is_none());
    }
}

#[test]
fn failed_fresh_before_start_is_forgotten_but_existing_or_started_is_retained() {
    let mut r = Registry::default();
    let a = r.admit(Some("s"), Some("c"), None).unwrap().state;
    let failed = r.settle(a.slot, a.generation, true).unwrap();
    assert!(failed.forgotten && failed.state.failed && !failed.state.busy);
    assert!(r.resolve("s").unwrap().is_none() && r.resolve("c").unwrap().is_none());
    let b = r.admit(Some("s"), Some("c"), None).unwrap().state;
    assert_ne!(a.slot, b.slot);
    assert!(!r.settle(b.slot, b.generation, false).unwrap().forgotten); // host succeeded before a canonical name was reported
    let c = r.admit(None, None, Some(b.slot)).unwrap().state;
    assert!(!r.settle(c.slot, c.generation, true).unwrap().forgotten);
    let d = r.admit(None, Some("pending"), None).unwrap().state;
    r.bind(d.slot, d.generation, "announced").unwrap();
    assert!(!r.settle(d.slot, d.generation, true).unwrap().forgotten);
    assert_eq!(r.resolve("announced").unwrap().unwrap().slot, d.slot);
}

#[test]
fn reuse_of_an_idle_draft_transfers_ownership_without_removing_it_on_old_host_cleanup() {
    let mut r = Registry::default();
    let a = r
        .admit(Some("canonical-A"), Some("draft"), None)
        .unwrap()
        .state;
    r.settle(a.slot, 1, false);
    assert!(r.admit(Some("free"), Some("canonical-A"), None).is_err());
    assert!(r.resolve("free").unwrap().is_none());
    let b = r
        .admit(Some("canonical-B"), Some("draft"), None)
        .unwrap()
        .state;
    assert_eq!(r.resolve("draft").unwrap().unwrap().slot, b.slot);
    r.forget(a.slot, 1).unwrap();
    assert_eq!(r.resolve("draft").unwrap().unwrap().slot, b.slot);
    assert!(r.resolve("canonical-A").unwrap().is_none());
}

#[test]
fn shutdown_is_terminal_and_removes_all_routes() {
    let mut r = Registry::default();
    let a = r.admit(Some("saved"), Some("pending"), None).unwrap().state;
    r.shutdown();
    r.shutdown();
    assert!(r.stopped());
    assert!(r.resolve("saved").unwrap().is_none());
    assert!(r.state(a.slot).is_none());
    assert!(r.bind(a.slot, 1, "late").unwrap().is_none());
    assert!(r.settle(a.slot, 1, false).is_none());
    assert!(!r.forget(a.slot, 1).unwrap());
    assert_eq!(
        r.admit(None, None, None).err(),
        Some("Harness is shutting down")
    );
}

#[test]
fn invalid_inputs_never_reserve_a_slot_or_an_alias() {
    let mut r = Registry::default();
    assert!(r.admit(Some("new"), Some(""), None).is_err());
    assert!(r
        .admit(Some("new"), Some(&"x".repeat(MAX_ID_BYTES + 1)), None)
        .is_err());
    assert!(r.admit(Some("new"), None, Some(88)).is_err());
    assert!(r.resolve("new").unwrap().is_none());
    assert_eq!(
        r.admit(Some("new"), Some("new"), None).unwrap().state.slot,
        1
    );
}

#[test]
fn alias_byte_budget_is_atomic_and_reclaims_space_on_forget() {
    let mut r = Registry::default();
    let padding = "z".repeat(MAX_ID_BYTES - 4);
    let mut slot = None;
    for i in 0..2048 {
        let id = format!("{i:04x}{padding}");
        let state = r.admit(None, Some(&id), slot).unwrap().state;
        slot = Some(state.slot);
        r.settle(state.slot, state.generation, false);
    }
    assert!(r.admit(Some("unclaimed"), Some("another"), None).is_err());
    assert!(r.resolve("unclaimed").unwrap().is_none());
    let slot = slot.unwrap();
    assert!(r.forget(slot, 2048).unwrap());
    assert!(r.admit(Some("unclaimed"), Some("another"), None).is_ok());
}

#[test]
fn capacity_rejections_leave_previous_routes_intact() {
    let mut r = Registry::default();
    for i in 0..16_384 {
        let a = r
            .admit(Some(&format!("host-{i}")), None, None)
            .unwrap()
            .state;
        r.settle(a.slot, a.generation, false);
    }
    assert_eq!(
        r.admit(Some("one-more"), None, None).err(),
        Some("Live run slot limit reached")
    );
    let first = r.resolve("host-0").unwrap().unwrap().clone();
    r.forget(first.slot, first.generation).unwrap();
    assert!(r.admit(Some("one-more"), None, None).is_ok());
}
