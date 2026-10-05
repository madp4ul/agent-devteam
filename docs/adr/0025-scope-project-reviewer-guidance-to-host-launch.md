# Scope project reviewer guidance to the host launch

Status: accepted

Implemented on 2026-10-05 for
[ticket 02](../../.scratch/computer-use-and-project-allowances/issues/02-launch-time-project-allowances.md).

## Decision

Extend [ADR 0024](0024-treat-reviewer-allowances-as-an-optional-runtime-add-on.md)
with an optional `start --additional-allowances <text>` source. The launching
user supplies project-wide authorization independently of reusable process
definitions. Each automation instance holds its exact nonblank text and
launch/project identity in memory. Every claim snapshots that source alongside
the selected agent's process allowances and definition version; dispatch uses
that claim rather than rereading configuration.

The Codex adapter preserves inherited native guidance first, appends labeled
process guidance, then labeled project text. Project-only text uses the same
optional compatibility path even when the selected role has no process entries.
Fresh, resumed and replacement threads receive configuration for that attempt.
All native policy restrictions, narrow template repair and safe baseline retry
rules remain unchanged. Reviewer guidance grants no app access or capability.

Historical attempt JSON retains exact framework sources and ordered native
configuration selections. Successful preparation records the exact composed
additional policy, inherited text, native version, workspace and policy/template
hashes through the application lifecycle boundary. Baseline fallback retains
the rejected optional selection and unavailable reason. Selection does not
prove reviewer consumption. Unknown composition remains unknown, and legacy
evidence is never reconstructed from current configuration. This extends the
existing JSON column without changing released migrations.

## Consequences

Restart with changed text, blank text or omission controls future attempts,
including already queued work, automatic retries and explicit continuations.
Historical sources never become active configuration. Launch-only changes
preserve the semantic process fingerprint and do not create stale activations;
existing process changes still use the stale-work approval flow. Startup is
always paused, providing the user checkpoint before dispatch.

Running attempts retain submitted guidance. Existing pause drains runs, and
interruption is the mechanism for immediate revocation before relaunch. There
is no hot editor, per-agent override, configuration-file discovery or new policy
manager. Separate application instances remain isolated even with a shared
runtime. Launch text is private local evidence and is not printed at startup;
only its presence is reported.
