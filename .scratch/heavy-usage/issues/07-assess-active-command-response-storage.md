# 07 — Independently assess active command-response storage

**Type:** research
**Status:** resolved — assessment complete; follow-up implementation authorized on 2026-11-02
**Created:** 2026-11-01
**Blocked by:** None
**Specification:** User requests an independent assessment following repository
development/process guidance before deciding how to reduce active-task response
storage. Prior observations and completed archival cleanup are in [ticket 06](06-expire-archived-task-command-response-caches.md).

## Decision question

What proportionate storage/retry strategy reduces active-task command-response
growth while preserving duplicate protection, legitimate replay behavior and
safe upgrade of existing databases?

Compact operation receipts are a hypothesis to challenge, not an accepted design.
Compare them with exact-response compression and other proportionate alternatives.

## Required evidence

- Trace command ownership, request matching, retry replay, and all relevant
  response consumers against repository source and existing regression tests.
- Distinguish active model context and conversation lifecycle from durable retry
  identity; identify any reliable expiry boundary instead of assuming compaction
  or retirement makes old commands safe to forget.
- Explain growth order under explicit assumptions; use isolated synthetic
  measurements rather than inferring exponential growth from file sizes.
- Identify observable compatibility, migration, archival and safety tradeoffs.
- Recommend a next step with explicit limits and useful acceptance criteria.
- If delivery is warranted, publish a specification and dependency-aware
  follow-up tickets before marking this decision effort complete.

## Boundaries

Assessment only. Production code, live coordination state, backup databases and
the running idle-game host are outside this task. Experiments may use repository
source and isolated synthetic fixtures. Do not stage, commit, push or start the
coordination framework. Process role guidance informs judgment; its Git/network
allowances do not expand this task's authorization.

## Comments

2026-11-01: Created before delegation. A separate agent will assess the proposal
using the research skill and the Autonomous Delivery Technical Designer guidance.
The parent retains responsibility for the decision record and delivery handoff.

## Answer

The independent agent recommends compact durable command results as a
proportionate contract redesign, not as a transparent replacement for today's
full historical application response objects. Its source audit found that the
browser normally discards rich mutation snapshots and refreshes authoritative
queries; creation uses the task ID. Existing agent responses are already compact.

Receipts must retain the original compact facts, including historical task
summary fields, revisions, transitions and relationship data where returned.
Rehydrating today's task from an old ID/revision is not equivalent: comments can
change without a revision increment, and titles, pin state and other projections
can change later. Preserve current request matching, command ownership and alias
keys. Compaction, retirement, elapsed time and cache size do not establish safe
expiry of active retry identities.

The [assessment](../active-command-response-storage-assessment.md) records source
and test citations, alternatives, unknown/failure-record handling and migration
risks. Existing application tests were inspected, not run for this assessment.
The separate agent used the research skill, deep-module design guidance and
Autonomous Delivery Technical Designer/Code Reviewer role responsibilities.
It was not launched through the running coordination framework.

### Isolated evidence

The [deterministic experiment](../response-storage-synthetic.mjs) was executed
independently by the assessing agent and reproduced by the parent with identical
results. It uses Node built-ins and synthetic in-memory objects only. It asserts
lossless gzip/Brotli round trips and demonstrates the same-revision replay
counterexample.

| Commands | Full response + request | Gzip + request | Brotli + request | Receipt + request |
| ---: | ---: | ---: | ---: | ---: |
| 200 | 12,692,185 bytes | 5,959,721 bytes | 5,687,932 bytes | 122,890 bytes |
| 400 | 50,139,485 bytes | 23,484,157 bytes | 22,463,107 bytes | 245,890 bytes |
| 800 | 199,314,085 bytes | 93,226,547 bytes | 89,771,963 bytes | 491,890 bytes |

Under bounded per-command history growth the repeated-snapshot mechanism is
approximately quadratic, not intrinsically exponential. Fixed-size receipts plus
bounded requests grow approximately linearly. Compression reduces bytes while
retaining the repeated-history multiplier in this fixture. These measurements
exclude SQLite allocation, indexes, keys, backups and CPU/latency and do not
predict production savings.

### Proposed delivery handoff

A [draft specification](../active-command-response-storage-spec.md) and separate
dependency-aware tickets are published:

1. [08 — Use compact durable command results](08-use-compact-durable-command-results.md):
   change application/browser result contracts coherently while preserving agent
   wire fields and historical compact retries; support existing snapshot replay
   and establish explicit storage-version compatibility.
2. [09 — Convert historical command-response snapshots safely](09-convert-historical-command-response-snapshots.md):
   depends on 08; implement verified-backup, atomic conversion and migration
   evidence, then document separately authorized offline compaction.

The user subsequently authorized creation of both issues only, explicitly
holding implementation while the project runs. Both are recorded and unclaimed;
starting work requires a later explicit user instruction. If full old
application/browser response objects must remain a
requirement, use a versioned lossless codec instead; it is an alternative rather
than a mandatory prerequisite to compact receipts. No implementation or actual
project maintenance has been performed under this assessment.

2026-11-01: Source/fixture-only assessment completed. The running idle-game host,
live database and recovery backups were not accessed. Research artifacts and
planning changes remain unstaged. Documentation whitespace checks pass.
