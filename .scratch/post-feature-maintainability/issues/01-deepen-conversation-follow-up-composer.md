# 01 — Deepen conversation follow-up composer

**What to build:** Put the complete text-and-attachment follow-up draft workflow behind one focused browser module so composition changes remain local while conversation loading, polling, history, retirement, and modal behavior stay unchanged.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] One deep follow-up composer module owns text draft state, attachment selection, upload progress, retry, removal, aborts, submission, idempotency, pending-upload cleanup, eligible window-drop routing, and composer rendering.
- [x] The composer's interface accepts the addressed task and conversation identities and reports an accepted authored message and activation through one narrow callback.
- [x] The conversation dialog remains the owner of remote conversation loading, refresh ordering, polling, optimistic history integration, reader-position preservation, retirement, modal lifecycle, and dialog-level focus.
- [x] Closing or unmounting the composer cancels in-flight transfers and requests cleanup of successful pending uploads without deleting sent attachments.
- [x] Text-only, attachment-only, and combined follow-ups retain their current submission, failure-recovery, and optimistic-refresh behavior.
- [x] Upload progress, validation feedback, retry, removal, disabled submission, file chips, file-drop safety, and foreground-dialog routing remain unchanged.
- [x] The fixed attachment count and total-byte policy is defined once in a transport-safe application module and consumed by browser guidance, HTTP early rejection, and durable validation.
- [x] Attachment and removal controls retain shared centered SVG icons, explicit accessible names, keyboard operation, and dark/light readability.
- [x] Tests continue through rendered browser, HTTP, and application interfaces rather than importing the composer state implementation.
- [x] Typechecking, focused conversation and attachment coverage, the full non-browser suite, the production build, and the complete browser suite pass.

## Answer

Implemented a focused `ConversationFollowUpComposer` that owns the complete text-and-attachment draft lifecycle and reports accepted authored-message and activation facts through one callback. The conversation dialog retains conversation loading, polling, optimistic history, reader position, retirement, modal, and focus ownership. Added one transport-safe conversation attachment policy consumed by the browser, HTTP early rejection, and durable attachment validation. Composer disposal now aborts transfers and removes successful pending uploads, including uploads completing after disposal, while accepted attachments are removed from disposable state before unmount cleanup.

Verification completed on 2026-08-25:

- `pnpm typecheck` — passed.
- Focused application and HTTP coverage (`agent-conversation.test.ts`, `web-server.test.ts`) — 20 passed.
- `pnpm test:browser:conversation-lifecycle` — 17 passed.
- `playwright test test/browser/appearance.browser.spec.ts` — 12 passed.
- `pnpm test` — 222 passed, 3 skipped, 0 failed.
- `pnpm build` — passed.
- `pnpm test:browser` — 105 passed, 0 failed.
- Final targeted post-review browser verification — 3 passed.
- `git diff --check` — passed.
- Required two-axis code review — Standards: 0 findings; Spec: 0 findings.

All implementation and ticket-resolution changes remain unstaged. Existing user-staged specification content was preserved as the immutable baseline.
