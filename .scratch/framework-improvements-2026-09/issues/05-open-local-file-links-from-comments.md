# 05 — Open actual local files from Markdown task comments

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Report and reproduction

An agent posts a Markdown comment on task details with a link to a file, often
inside the task workspace. Hovering over the rendered link appears to target the
current page. Clicking it opens another task details page instead of the file.

Capture an actual failing Markdown link and inspect how its destination is
parsed, rendered, and routed. Exact link syntax was not supplied during intake;
do not assume whether the failure originates in sanitization or URL resolution.

## Desired behavior and acceptance criteria

- [x] A supported local file link in a comment resolves to the intended file,
  including files in the task's Git worktree, instead of the current task route.
- [x] Define “open”: browser preview, download, or opening a local application;
  select a useful experience that works in the supported deployment.
- [x] Define handling for native absolute paths, relative paths, spaces, and line
  references based on actual agent-authored links and supported platform formats.
- [x] Missing files and removed/archived task workspaces produce a clear result
  rather than silently opening a duplicate task page.
- [x] Ordinary web links keep working, with browser regression coverage for the
  reported local-file case.

## Candidate approach and questions

The user recognizes that browser restrictions may prevent direct local-file
opening. A custom server endpoint translating supported links into file access
is an acceptable fallback, not a selected implementation. If chosen, define the
allowed file scope and path resolution so a link cannot expose arbitrary host
files. Clarify which task workspace relative links reference and how links from
other tasks should behave.

This is independent of [06](06-attach-files-to-tasks-and-comments.md): existing
workspace links should be usable even without a new attachment feature.

## Comments

- 2026-09-20: User-described GitHub bug; exact sample links still need collection.
- 2026-09-22: User review found that the first implementation worked in comments
  but not outcomes. The cause was caller-specific task context. Replaced that
  opt-in prop with one task-route Markdown provider and expanded the regression
  across description, comment, outcome, activity-message, and conversation
  rendering.

## Answer

Implemented host-native opening for local file links across every Markdown
surface in task details, including descriptions, comments, outcomes, activity
messages, and conversations. The task page supplies the workspace-link context
once so individual renderers cannot opt out accidentally. The browser
intercepts conventional agent-authored relative paths, native absolute paths
such as `C:/workspace/file.ts:12`, and `file:` URLs, then asks a localhost
endpoint to open the file in the host's default application. Encoded spaces,
`#L12C3`, and `:12:3` references resolve to the underlying file; exact cursor
positioning remains controlled by the selected desktop application.

The host resolves relative paths against the linked task's authoritative Git
worktree, canonicalizes both sides, and rejects traversal and symlink escapes.
Only existing regular files inside that workspace can open. Missing files,
removed or archived workspaces, unsupported host integration, and launcher
failures return visible feedback beside the link. HTTPS, task-route, and
protocol-relative browser links retain their existing navigation behavior.

Coverage exercises rendered comment links, Windows-native absolute and encoded
relative paths, line and column suffixes, missing and archived workspaces,
outside-workspace rejection, host unavailability, ordinary web links, and
light/dark feedback appearance.
