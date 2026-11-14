# 08 — Finish activity contract migration

**What to build:** Complete the activity contract migration so ordinary new
activity must satisfy its event-specific payload and historical flexibility is
confined to the intentional compatibility seam.

**Blocked by:** 06 — Migrate task and resource activity; 07 — Migrate execution
and conversation activity.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Remove the permissive new-activity authoring path after checking every
  event producer has migrated, including fixtures that author valid activity.
- [ ] Remove stale event-kind assertions and transitional conversions from
  ordinary readers; preserve explicit decoding of retained historical shapes.
- [ ] All supported event kinds have checked payloads and deliberate consumer
  handling. Invalid new payloads cannot bypass checking through general bags.
- [ ] Existing released fixtures and serialized browser/agent contracts remain
  compatible; released migration code and retained records remain unchanged.
- [ ] Run complete typechecking and the affected activity/context, recovery,
  migration, runtime and browser regression checks. Report baseline failures
  explicitly rather than relaxing checks to finish the migration.
- [ ] Update architecture guidance and durable reasoning for the resulting
  contract seam; remove obsolete migration guidance and leave changes unstaged.
