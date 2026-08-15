# Persist compact conversation index identity

Status: accepted

Store each conversation's generated originating-request label and a monotonic
durable activity-order key with the conversation, rather than deriving the
compact index from mutable task titles or loading attempt transcripts. This
keeps labels stable as tasks evolve and makes recent-activity ordering
deterministic when durable events share a timestamp.

## Consequences

- Compact task projections can list conversations without reading transcript
  evidence or duplicating attempt-owned content.
- Durable conversation activity must advance both its display timestamp and
  ordering key.
- The pre-release schema compatibility check treats databases without these
  fields as incompatible under the existing replacement policy.
