# Expand contracts by capability before migrating callers

Status: accepted

Expose task, conversation, automation, process, notification, runtime, and
browser-transport contract modules before migrating existing callers. Each
module explicitly groups the facts a caller needs for that capability. The
broad coordination contract remains the declaration source and compatibility
interface during the expansion, so existing imports remain valid while callers
move independently.

Keep the expansion type-only. Capability modules re-export declarations rather
than copying them, and the browser transport contract composes only the payload
facts shared by the local host and browser adapters. After production and test
callers have migrated, the compatibility cleanup can relocate declarations and
remove the obsolete broad organization without an intermediate broken state.
The compatibility interface is therefore a bounded migration scaffold, not an
acceptable steady state. A compatibility layer may be introduced only when its
removal is already assigned to a concrete follow-up; here that removal is issue
14, after the caller migrations in issues 12 and 13.

## Consequences

- Callers can adopt a smaller capability interface without coordinated migration.
- Serialized shapes and runtime behavior cannot change during the expansion.
- The new module graph adds no emitted imports or circular runtime dependencies.
- Declaration ownership remains transitional until compatibility cleanup; types
  are not duplicated while that migration is in progress.
- Finishing the contract reorganization requires removing the obsolete broad
  compatibility structure rather than preserving it as indefinite technical debt.
