# Retry transient runtime failures with provisional probes

Status: accepted

## Decision

Classify each failed runtime outcome before counting ordinary failures. Explicit
connection/service codes and Codex message-budget codes take precedence over
tested diagnostic recognition. Authentication, permission, billing and ambiguous
failures stay on the existing finite recovery path. Ordinary cycles retain three
technical attempts; recognized transient failures do not consume that budget.
No model call is needed to classify an unavailable runtime.

Keep one durable waiting episode for the same activation and its original cause,
queue position and conversation lineage. Persist classification, first/latest
failure, at most three distinct diagnostic samples, failure count, dispatched
retry count and next eligibility. A usable future provider deadline takes
precedence; absent one, wait at least 60 seconds after rejection. Reclassify each
rejection, respecting changed deadlines and following ordinary attention policy
when the outcome changes. Only episode transitions append activity.

Use the existing dispatch claim as the publication boundary. The first failure
cannot be known before dispatch and keeps its ordinary attempt. During a known
episode, create a provisional probe with the same authenticated attempt scope,
but retain the dispatch claim until meaningful evidence arrives. Streamed output,
accepted coordination effects, thread identity/continuity changes, usage or
context evidence, success, ordinary failure or explicit interruption publishes
the attempt before retaining its effects. A no-progress transient rejection
deletes only its still-provisional row and updates the episode. Published attempt
history is never deleted or rewritten to reduce retry noise.

Compare reported usage using existing cumulative checkpoint isolation. A
trustworthy unchanged checkpoint adds no cost evidence; positive or uncertain
usage is retained with its normal attribution. Release native in-memory
transcript/usage caches only after durable settlement, keeping failed settlement
evidence available for diagnosis.

Waiting releases execution capacity. Dispatch uses normal eligibility checks,
including a second check after workspace preparation. Pause blocks dispatch;
restart begins paused with durable deadlines and counters. An abandoned
provisional probe returns to waiting, at least one minute after restart, without
an ordinary host-stop history pair. Explicit interruption publishes user intent
and ends waiting, leaving the existing suspension/continue/dismiss controls in
charge. Queued waiting can be dismissed through the existing command.

## Consequences

- Redundant outages have bounded storage and browser summaries, while meaningful
  partial work continues to accumulate retained evidence.
- Task and conversation queries expose current waiting independently of paged
  history. It does not create failure attention or repeated notifications.
- Migration 0012 adds episodes/probe metadata and widens journal event types,
  preserving the released ledger, triggers, views and existing authored history.
- Technical retries occupy the original activation and do not consume extra
  stall-recovery slots; ADR 0023's separate three-recovery policy is unchanged.
- Automatic purchasing, model switching and process-configurable retry policies
  remain outside this decision.
