# 107 — Reject agent self-mentions when posting comments

**Type:** task

**Status:** resolved

**Blocked by:** None

**Reported:** 2026-11-10

**Parent:** [Agent Coordination Framework](../map.md)

## Problem

Agents can post comments mentioning their own task-local participant. These
comments create additional activations for the same agent, allowing continuation
notes to accumulate into a queue of obsolete instructions rather than ordinary
progress records. Guidance alone has not prevented this behavior.

Read-only inspection of Idle Game V2 on 2026-11-10 found the running T-0026
implementation activation `698ca43f-bed1-460c-a048-8143c21ff0a4` originated from
the implementation agent on that same task. Its source comment begins
`@implementation-agent Continue from clean pushed…`. At inspection, the project
contained 29 unfinished same-task self-mention activations (queued or running).
These are observed counts, not an assertion about later live state.

## Requested behavior

- Reject an agent-authored comment containing an executable mention of its own
  participant on the destination task. Fail the entire comment-post operation;
  do not silently strip the mention or accept the comment while ignoring it.
- Identify self by both originating task and authenticated agent identity.
  The same agent role on another task is a different participant: cross-task
  consultation of that role remains allowed.
- Return an actionable rejection explaining that self-mentions are not allowed
  and that the agent can post a plain progress note without mentioning itself.
- Rejection must not persist the comment, create activations for any mentioned
  participant, create user attention, or partially apply other comment effects.
- Use existing executable-mention parsing. Plain names and literal examples in
  code spans remain ordinary text; they are not rejected as self-mentions.
- Preserve user-authored agent requests and legitimate mentions of other agents.
  This issue concerns agent self-activation, not a new user-comment restriction.
- Enforce at the authoritative comment mutation boundary, using trusted caller
  provenance rather than caller-supplied author fields or prompt instructions.

## Validation

Cover same-task rejection, mixed self/other/user mentions with no partial side
effects, cross-task same-role consultation, code-span examples, plain text and
normal user requests. Check normal retry/idempotency behavior: rejection should
not prevent a corrected submission under the established command contract.

## Scope limits

Do not automatically dismiss previously queued activations, rewrite historical
comments, or interrupt running tasks. Any live queue cleanup is a separate,
explicit operation. No implementation or runtime changes were made when filing.

## Comments

- 2026-11-10: User explicitly requested a framework issue requiring self-mention
  comments to fail at posting time, following the observed activation buildup.

## Answer

Implemented 2026-11-10. The authoritative comment command rejects executable
self-mentions before writing comments, pins, attention, activations or promoting
provisional attempts. Returns `self-mention` with corrective guidance. Caller
identity comes from existing validated provenance; another task with the same
agent role remains addressable. Rejected requests leave the idempotency key
available for corrected submissions; successful historical replays remain intact.

Updated MCP tool guidance, reference and domain terminology. Regression coverage
includes atomic mixed-mention rejection, literal examples, corrected retries,
cross-task same-role requests, running-attempt identity and spoofed HTTP fields.
The 22 related application/MCP tests pass; TypeScript checks pass. Changes remain
unstaged. Running hosts and pre-existing queues were not modified; restart the
host through its normal lifecycle to load the change.
