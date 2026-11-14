# 02 — Remove local installations only when proved unused

Status: resolved — implemented, verified and reviewed; changes unstaged.

Type: task

Blocked by: none.

Parent: [Specification](../spec.md).

- [x] Protect selected/latest and all active or uncertain users before cleanup can race launcher startup.
- [x] Serialize install/select/pin/prune through cache-local deployment bookkeeping, separate from coordination state.
- [x] Remove managed unused versions on later startup housekeeping while preserving lingering worker paths, uncertain legacy versions and unsafe/unknown directories.
- [x] Verify process exit, concurrent starts, stale leases and path containment through disposable cache/host boundaries.
- [x] Install finalized bootstrap support without restarting live hosts or deleting untracked legacy installations.

## Completion

See [verification and deployment](../verification/results.md). The full suite passed with 550 passed, 7 skipped and no failures. Existing staged content is preserved; no real remote deletion or live-host restart was performed.
