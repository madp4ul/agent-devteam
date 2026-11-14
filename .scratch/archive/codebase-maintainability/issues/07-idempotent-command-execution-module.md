# 07 — Idempotent command execution module

**What to build:** Encapsulate the common read, execute, retain, and replay lifecycle for transactional commands whose idempotency semantics are equivalent.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Compatible commands use one internal idempotent execution interface.
- [x] Accepted and rejected results replay exactly as before.
- [x] Command-specific validation and behavior remain inside their owning workflow modules.
- [x] Archived conversation bodies cannot become recoverable through retained command responses.
- [x] Concurrency and replay tests pass through the application and adapter seams.

## Comments

Implemented one internal idempotent command executor for the common transactional
replay, execution, and conditional-retention lifecycle. Workflows that cross
external operations use its neutral replay and retention primitives across their
phases, while validation, command-key conventions, and archival privacy policy
remain in their owning workflow modules. Added application-seam characterization
for intentionally retained and non-retained rejections. Typechecking, the
production build, the complete 191-test non-browser suite (189 passed and 2
intentional skips), and final Standards and Spec reviews passed with no findings.
