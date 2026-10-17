# 0031 — Canonicalize human attribution in released state

Human attribution uses the actor kind `user`, ID `user`, and mention token
`@user`. Comment IDs remain unique record identifiers; process agent IDs remain
unchanged.

Released browser versions stored a different human ID. Migration 0013 upgrades
that attribution in comments, activity, conversation messages, pending archival
ownership, conversation retirement, movement metadata, retained activation
contexts, and cached command responses. It changes only identity metadata,
including historical movement actor labels. Record IDs, references, sequence,
timestamps, authored text, runtime transcripts and agent identities survive.
Consequently, historical authored prose may still contain the obsolete spelling;
it remains evidence, not current attribution or operating guidance.

This is a released data migration under [ADR 0018](0018-make-released-migrations-the-coordination-schema-authority.md),
with the normal verified pre-upgrade backup and atomic rollback contract. The
schema is unchanged. Startup completes the migration before queries or dispatch
can expose old attribution. Existing activation snapshots also need conversion:
retries intentionally reuse their retained context rather than recomposing it.

Caller-scoped retry keys gain canonical aliases while retaining their historical
keys. An existing canonical response wins if both spellings already exist for
the same key; no successful response is deleted or command re-executed. Old
spellings occur in executable code only in this migration's compatibility logic
and in regression evidence.
