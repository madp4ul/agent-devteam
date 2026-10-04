# Treat reviewer allowances as an optional runtime add-on

Status: accepted

Accepted and implemented on 2026-10-04 for
[framework ticket 04](../../.scratch/framework-improvements-2026-09/issues/04-reduce-routine-permission-interruptions.md).

## Decision

User-authored process agent allowances provide standing authorization guidance
to native Auto-review. They supplement shared runtime permission policy and
cannot guarantee approval, expand capabilities or fabricate a user continuation.
The applied process is the trusted source, independent of agent-edited task files.
Process fingerprints and existing stale-work rules govern changes; each attempt
retains its source version, exact guidance and runtime compatibility evidence.

Keep the integration in the Codex runtime adapter and make it optional. Unsupported
configuration, unverified delivery or unsafe composition use the existing baseline
approval behavior. Real review denials use explicit user continuation. Retry without
optional config only for a recognized config rejection before any runtime event;
never blindly replay work that may have executed.

The verified SDK/CLI baseline is pinned to 0.160.0. Native `extra_policy` is
documented, but the account's supplied reviewer template silently omitted it.
Live fresh/resumed probes proved delivery and application after restoring its
missing slot using identical public policy. Permit that repair only when complete
current policy matches verified public text; never freeze a changed server policy
to an old template. Prefer corrected native delivery and retire the repair when
the slot exists. Preserve inherited local guidance. Managed requirements, unknown
providers/catalogs or versions default to baseline rather than guessing precedence.

## Consequences

SDK pinning cannot freeze server model catalogs. Experimental template configuration
may change or disappear, so controlled native delivery checks accompany adapter
maintenance. Removal is possible, not predicted. Compatibility fallback is visible
in attempt evidence and does not itself create formal user attention.

Running turns retain submitted guidance. Pause drains active work; immediate
revocation uses existing interruption before restarting under a changed definition.
The framework retains the original shared-capability decision and avoids an
independent approval service or command matching engine.
