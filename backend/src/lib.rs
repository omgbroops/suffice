//! suffice backend: one background program that owns every agent run.
//!
//! Flow: a client submits a Task (HTTP, server.rs) -> queue.rs stores it durably -> orchestrator.rs
//! picks ready tasks (deps done, session free, gate passed) -> pool.rs spawns the agent CLI built by
//! adapter.rs -> each stdout line is parsed by the adapter into Events -> events go to the log, the
//! session store (native session id for resume), the gate (risky tool calls) and subscribers.

pub mod adapter;
pub mod browser;
pub mod computer;
pub mod gate;
pub mod json;
pub mod orchestrator;
pub mod pool;
pub mod queue;
pub mod server;
pub mod session;
pub mod triggers;
pub mod types;
