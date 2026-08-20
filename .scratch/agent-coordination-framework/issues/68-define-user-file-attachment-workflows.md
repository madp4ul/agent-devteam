# 68 — Define User File Attachment Workflows

**What to build:** Define the smallest safe and useful workflow for a user to
upload files for an agent, with user follow-ups in a continuing conversation as
the minimum candidate and task- or comment-level attachments evaluated before
implementation scope is fixed.

**Blocked by:** None

**Status:** open

- [ ] Start with the concrete need to attach one or more files while sending a
  user follow-up in an existing agent conversation.
- [ ] Decide whether an uploaded file belongs to a conversation message, the
  broader task, or both, and whether task creation and timeline comments should
  expose the same attachment control in the first increment.
- [ ] Define how an agent discovers and reads attachment content. Reconcile the
  existing task-level attachment metadata and on-demand discovery contract with
  message-specific provenance and runtime file access.
- [ ] Define durable content storage, task archival behavior, restart behavior,
  deletion or replacement rules, and cleanup of an upload that never reaches a
  submitted message.
- [ ] Bound accepted file sizes, counts, names, media types, and paths. Uploaded
  content must not escape framework-owned storage, overwrite project files, or
  be treated as trusted executable content.
- [ ] Decide how binary, image, and text attachments are represented to Codex,
  including what the current SDK can deliver directly and what must instead be
  made available through a scoped file or coordination-tool reference.
- [ ] Preserve the user's authored association between message and files,
  idempotent submission, activation ordering, conversation continuity, and
  attribution after application restart.
- [ ] Define compact upload progress, validation, failure, retry, removal, and
  attachment presentation that remains keyboard-accessible and readable in
  dark and light modes.
- [ ] Turn the selected minimum workflow into explicit application, storage,
  runtime-adapter, HTTP, and browser acceptance criteria before implementation.

## Context

The product specification and coordination database already anticipate
task-level attachment metadata, and agents can query that metadata on demand.
There is currently no user upload command, durable content store, message-level
association, content-serving boundary, or agent file-delivery path.

The request came from real use of continuing conversations. Conversation
follow-ups are therefore the required starting point; adding attachment
controls to task creation or general comments should depend on whether one
coherent ownership and delivery model serves those surfaces without inflating
the first increment.

