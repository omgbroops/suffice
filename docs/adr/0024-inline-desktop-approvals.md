# 0024: Inline desktop approvals

Agent tool approval requests travel over the existing thread-scoped event stream and an explicit approval-answer IPC handler. Render them inside the active conversation composer using its existing material. Preserve the draft and other conversations; do not show a native modal, change permissions globally, or accept a request through ordinary composer submission.

Pending requests are keyed by their owning thread and request ID, because IDs may repeat across workers. Only explicit Allow sends true; Deny or Escape in the approval surface sends false. Resolved or stopped requests are dismissed. The code/command preview is text, never executable HTML, with a bounded scroll area. The worker remains the authority for pending decisions, and background workers receive answers through their existing router.
