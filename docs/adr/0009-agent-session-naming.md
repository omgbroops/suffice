# ADR 0009: Let the active agent name Automatic sessions

Status: proposed
Date: 2026-11-14

Automatic uses a validated set_session_title metadata tool exposed through the
existing codemode tools. The first turn instructs the active agent to choose a
short descriptive title. The first-message title remains provisional until the
agent calls the tool. No separate model request, extra credentials, or hidden
naming turn is added. Explicit First message and Untitled modes stay deterministic.
Persist the title in the existing session journal and notify the sidebar/header.
Validate with an actual Pi session tool invocation without network or paid calls.
