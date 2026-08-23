# Store conversation attachments in bound project state

Status: accepted

Keep an uploaded follow-up file as an immutable conversation-owned original in
a framework content store under the bound project state root. SQLite owns its
authoritative task, conversation, and authored-message association, while the
file bytes remain outside SQLite. Client filenames are metadata only; storage
paths are derived from framework identities.

Deliver attachments to Codex through disposable attempt-scoped projections
outside the Git task workspace. Every surviving file in the addressed
conversation is named in the activation context, and a supported image on the
current follow-up is also supplied as native image input. Do not expose these
files to another conversation or aggregate them into task attachments.

## Consequences

- The complete project state root, including the content store, is the backup
  and relocation unit; backing up SQLite alone is incomplete.
- Follow-up submission binds attachment metadata in the existing continuation
  transaction, without making the browser or filesystem a second authority.
- Originals survive restart, thread replacement, and conversation retirement.
  Task archival removes them with authored conversation detail.
- Pending uploads and runtime projections are disposable and recovered or
  removed independently of immutable originals.
- Arbitrary user-selected file types remain inert until a later Codex action;
  attachment storage never executes uploaded content.
