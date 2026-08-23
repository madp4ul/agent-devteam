# 68 — Add Files to Conversation Follow-Ups

**What to build:** Let a user attach durable files to a follow-up in one agent
conversation, deliver those files to that conversation's Codex runs, and keep
the browser safe from accidental file-drop navigation.

**Blocked by:** None

**Status:** ready-for-agent

## Problem Statement

A user continuing an agent conversation can currently send only text. When the
work depends on a screenshot, spreadsheet, document, archive, executable, or
other local file, the user has no supported way to preserve that file with the
follow-up or make it available to the agent. Dragging a file onto the wrong part
of the page is also dangerous because the browser may navigate to the local
file and discard the user's draft, scroll position, and current application
state.

## Solution

Add file selection and window-wide file dropping to the existing conversation
follow-up composer. A selected or dropped file uploads immediately and appears
as a file chip above the textarea inside the composer. The user may retry or
remove a file before sending. A successfully submitted file becomes an
immutable attachment of that authored follow-up and remains visible,
downloadable, and available to later runs in that same agent conversation until
the task is archived.

Supported images are delivered to Codex as native image input. Every accepted
file is also made available to the conversation through scoped local file
access so Codex can use its normal tools for formats such as spreadsheets. The
files remain in framework-owned project state and never enter the Git task
workspace.

## User Stories

1. As a user, I want to select one or more files beside the Send follow-up
   action, so that I can give an agent evidence that does not fit in text.
2. As a user, I want to drop files anywhere in the browser window while a
   conversation dialog is open, so that imprecise dropping still attaches them
   to the current draft.
3. As a user, I want every file drop in the application to suppress native
   browser navigation, so that a misplaced file cannot replace the page and
   destroy unsaved interface state.
4. As a user, I want file drops to do nothing when no attachment-capable
   conversation is open, so that the browser remains safe without inventing an
   attachment destination.
5. As a user, I want selected files shown as chips above the textarea within the
   floating composer, so that the draft's text and files read as one follow-up.
6. As a user, I want a chip to show the file's base name and size without a
   client path, so that I can identify the file without leaking irrelevant
   local path information.
7. As a user, I want each chip to show upload progress and a clear success or
   failure state, so that I know whether the follow-up is ready to send.
8. As a user, I want to retry a failed upload or remove any selected file, so
   that one bad transfer does not force me to recreate the whole draft.
9. As a keyboard or assistive-technology user, I want the upload, retry, and
   remove actions labelled and operable without a pointer, so that attachments
   do not make conversation continuation inaccessible.
10. As a user, I want to send text with files, text alone, or files alone, so
    that the message shape matches what I need to communicate.
11. As a user, I want Send disabled while any selected file is uploading or has
    failed, so that a follow-up never silently omits part of my selection.
12. As a user, I want a submission failure to preserve my text and file chips,
    so that retrying does not require reconstructing the follow-up.
13. As a user, I want retrying an uncertain submission to create at most one
    authored message and one activation, so that an interrupted response cannot
    duplicate agent work.
14. As a user, I want sent attachment chips shown on their authored follow-up,
    so that the conversation preserves which message introduced each file.
15. As a user, I want to download the original attachment later, so that the
    durable conversation remains inspectable without adding a document preview.
16. As a user, I want an earlier attachment to remain available during later
    follow-ups in the same conversation, so that continued work can refer back
    to the same evidence.
17. As a user, I want conversation attachments isolated from other agent
    conversations, including conversations for the same task, so that this
    increment does not invent an unapproved sharing model.
18. As a user, I want image attachments delivered as visual model input, so
    that Codex can inspect screenshots and pictures directly.
19. As a user, I want non-image files available through Codex's local tools, so
    that the agent can inspect formats such as Excel without pretending their
    contents were inserted into the prompt.
20. As a user, I want attachments to survive application restart for as long as
    their conversation detail survives, so that continuing the conversation
    does not depend on one host process.
21. As a user, I want attachment content removed when its task is archived, so
    that files follow the existing lifecycle of authored conversation detail.
22. As a user, I want ordinary local file types accepted without an extension
    allowlist, so that the framework does not second-guess files I deliberately
    provide.
23. As a user, I want merely uploading a file never to execute it, so that
    execution happens only through a later agent action governed by my request
    and the normal Codex permission policy.
24. As a user, I want clear limits and validation failures before submission,
    so that oversized or excessive selections do not damage the draft or fill
    framework storage unexpectedly.
25. As a user, I want the complete attachment workflow readable in both dark
    and light appearances, so that progress and errors are never theme-specific.

## Implementation Decisions

- The first increment adds attachments only to authored follow-ups in an
  existing agent conversation. Task creation and timeline comments keep their
  current text-only contracts.
- A conversation attachment belongs to one authored conversation message and
  one agent conversation. It is not a task attachment and must not appear in a
  task-wide attachment query or become accessible to a different conversation,
  even when that conversation belongs to the same task.
- Attachment placement is message-level. There is no inline marker, ordering
  position, or attachment syntax inside the message body.
- The upload control appears beside Send follow-up. File chips appear above the
  textarea inside the existing composer surface rather than inside the
  textarea. Upload and remove controls use the shared, geometrically centered
  SVG icon pattern with explicit accessible labels; font glyphs are not icons.
- Window-level drag handlers always prevent default navigation for file drags
  and drops. While one eligible conversation dialog is foregrounded, dropped
  files route to its draft regardless of the drop point. Without such a dialog,
  the application consumes and ignores the files without changing page state.
  Ordinary non-file drag interactions retain their current behavior.
- Selection or drop starts a streamed upload immediately. Each pending upload
  has an opaque identity and reports progress, success, or a concise validation
  or transfer failure. Removing a chip cancels an in-flight upload when
  possible and removes its temporary content. A failed upload can be retried or
  removed.
- Pending uploads are not conversation evidence. Closing or refreshing the
  dialog does not restore its text or files. Unbound upload content is removed
  on explicit removal, after expiry, and during startup cleanup so interrupted
  uploads cannot accumulate indefinitely.
- A follow-up is valid with a nonblank body, at least one successful pending
  upload, or both. Send is disabled if neither exists or if any displayed
  upload is incomplete or failed.
- Follow-up submission accepts the body and ordered pending-upload identities.
  One application-owned transaction validates that every upload is complete,
  belongs to the submitting draft/conversation scope, and has not expired;
  converts them to immutable conversation attachments; records the authored
  message and exact attachment associations; creates its `user-follow-up`
  activation; appends continuation activity; advances conversation ordering;
  and retains one idempotent response.
- A rejected or uncertain submission leaves the browser draft and successful
  upload identities available for retry. Reusing the submission idempotency key
  replays the original result rather than binding the same upload twice or
  creating another message or activation.
- A sent attachment cannot be removed or replaced independently. Its base
  filename, reported media type, exact byte size, opaque storage identity,
  message association, and conversation association remain durable. The
  reported media type is metadata rather than an authorization or trust
  boundary.
- Original content is stored outside SQLite in a framework-owned content store
  under the bound project state root; SQLite retains its authoritative
  conversation and message associations. Paths are derived only from
  framework-generated identities. The client filename is reduced to a base
  name and can never select a storage path, escape the store, or overwrite
  another attachment.
- One follow-up accepts at most 20 ordinary files and at most 512 MiB in total.
  There is no separate per-file limit below that total. Directory entries and
  non-file drag items are rejected. Upload and download paths stream content
  rather than buffering a complete large file in browser or host memory.
- There is no file-extension allowlist. Uploading content never executes it.
  Any later inspection or execution is an explicit Codex action subject to the
  runtime's existing sandbox and permission policy.
- On dispatch of the attachment's follow-up activation, supported image files
  are included in the Codex SDK's structured input as native local-image items.
  Every attachment is also exposed through a conversation-scoped local file
  contract and identified in the activation prompt with its base filename,
  media type, size, authored message, and usable scoped reference.
- Retries of the same activation receive the same attachments. Later
  activations in that conversation can discover and read all of its surviving
  attachments on demand, including after application restart or Codex thread
  replacement. No attachment capability accepts a task, conversation, or file
  scope supplied by the model; the running attempt supplies its authoritative
  conversation scope.
- Runtime-accessible paths are projections of the durable originals. They do
  not enter or modify the Git task workspace, cannot overwrite project files,
  and cannot change the immutable stored content. Any disposable runtime copy
  is an adapter detail and is cleaned independently of the original.
- The existing task-level attachment metadata and `list_task_attachments`
  contract remain distinct. They do not aggregate conversation attachments.
  Conversation attachment discovery uses a conversation-scoped contract.
- Sent file chips remain on their authored message and expose a labelled
  download action. Downloads revalidate the task, conversation, message, and
  attachment association and use safe response headers. The product does not
  render document previews; inline image previews and lightboxes are also not
  part of this increment.
- Attachment originals and detailed metadata survive ordinary restart,
  conversation retirement, and explicit continuation of a retired
  conversation. Task archival deletes them alongside authored conversation
  messages and attempt transcripts. A cleanup failure must not report archival
  success or leave an archived task pointing at retained attachment content.
  Unarchiving does not restore deleted files.
- The feature fits the existing architecture: the conversation command remains
  the authoritative mutation boundary; browser HTTP is a streaming adapter;
  conversation projections own authored-message presentation; and the Codex
  runtime adapter owns native image and scoped-file delivery. No adapter writes
  coordination state independently.

## Testing Decisions

- Test observable behavior rather than private tables, directory layouts,
  React component structure, filesystem-call counts, or prompt string
  formatting.
- The primary acceptance seam is the assembled browser application. Cover
  keyboard selection; file drops on the composer and elsewhere in the window;
  suppression of native navigation with and without a conversation dialog;
  per-file progress, failure, retry, and removal; file-only follow-ups; disabled
  Send during incomplete work; retained drafts after submission failure; sent
  chips; download; and narrow responsive layout.
- Browser coverage verifies upload and remove icon/button center alignment and
  explicit accessible names. Appearance coverage exercises the complete chip,
  progress, error, focus, hover, disabled, and drag-target states in both dark
  and light modes without allowing this supporting UI to dominate the
  conversation.
- Application-level behavior covers the highest authoritative seam for bounds,
  filename containment, pending-upload ownership and expiry, atomic binding,
  attachment-only messages, idempotent replay, activation ordering, restart
  durability, same-conversation later access, cross-conversation denial, and
  archive cleanup failure and success.
- Focused browser HTTP tests cover streamed bodies, early limit rejection,
  interrupted uploads, scoped downloads, safe headers, and error mapping. They
  do not duplicate the full application behavior suite.
- Focused Codex adapter tests prove that the current activation receives native
  image input plus scoped references, non-image files remain tool-readable,
  retries preserve the same set, later conversation activations can rediscover
  earlier files, and another conversation cannot access them. A controlled
  runtime remains the default; one narrow real-SDK contract test may verify the
  installed SDK's structured image-input shape without depending on model
  judgment.
- Restart tests use a real temporary project state root and real file content.
  They verify committed attachment recovery and cleanup of unbound uploads
  without relying on production user data.
- Existing conversation-lifecycle, web-server, archival, Codex-runtime, and
  appearance suites are the prior art. Extend those seams instead of creating a
  second attachment-specific application authority.

## Out of Scope

- Attachments on task creation, task descriptions, timeline comments, agent
  comments, or interruption and recovery messages.
- Sharing, copying, or automatically exposing an attachment to another agent
  conversation, even on the same task.
- Task-wide attachment aggregation or redefining the existing task attachment
  metadata contract.
- Inline attachment placement between words or paragraphs, attachment markup
  in authored text, or semantic inference about which sentence refers to which
  file.
- Durable unsent drafts or restoration of pending uploads after dialog close,
  page refresh, or host restart.
- Editing, replacing, or deleting a sent attachment before task archival.
- Document previews, generated thumbnails, inline image display, annotation,
  lightboxes, format conversion, hosted file search, or framework-owned content
  extraction.
- Format-specific parsing rules. Codex and its available tools decide how to
  inspect an accepted file under the existing permission policy.
- Uploading attachment content to the OpenAI Files API or promising ChatGPT's
  hosted file-processing implementation. The user-visible goal is equivalent
  access through the local Codex runtime.
- Configurable per-process limits, quotas, deduplication, compression, malware
  scanning, content trust classification, or permanent deletion outside the
  existing task-archival lifecycle.

## Further Notes

- The installed Codex SDK accepts a turn as text or as structured text and
  local-image inputs. It does not provide a general hosted file-upload contract;
  other formats therefore remain local files available to Codex tools.
- The 512 MiB total is an operational safeguard for the local framework, not a
  claim that the Codex SDK or every model can natively parse a file of that
  size. A tool may still report that a particular file cannot be usefully
  inspected.
- This spec deliberately chooses conversation ownership over the broader
  task-level attachment model anticipated by the original product design.
  Cross-conversation sharing must return as a separate product decision rather
  than emerging from an implementation shortcut.
