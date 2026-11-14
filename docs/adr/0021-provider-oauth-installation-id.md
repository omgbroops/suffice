# 0021: Share the OAuth installation identity

Status: Accepted

Pi's ChatGPT subscription OAuth login requires a stable installation UUID through LoginOptions.getDeviceId. The desktop omitted it while the CLI already supplied it, so sign-in failed before opening the browser. A generic IPC/UI error hid the missing prerequisite.

Use host-id under the existing Suffice home for both CLI and desktop. Publish a complete UUID file atomically, reuse existing valid IDs, and report corrupt identity files rather than silently changing them. This identity is not an account credential; account credentials remain owned by Pi's credential store. Only OAuth attempts initialize it.

Pass agentName Suffice and the persisted UUID to Pi. Keep the provider-neutral prompt, browser notification and cancellation flow. Forward static, actionable classifications for callback-port conflicts, network errors and token-exchange status; never forward raw provider response bodies, tokens, authorization URLs or supplied keys as error messages.

Validate concurrent identity creation, existing-ID preservation, actual Pi OAuth startup with browser/token steps intercepted, cancellation and the native error-to-modal path. Completing a real account login remains a user browser action.
