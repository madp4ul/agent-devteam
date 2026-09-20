# 05 — Open actual local files from Markdown task comments

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Reproduce link handling and clarify the desired file-opening behavior.

## Report and reproduction

An agent posts a Markdown comment on task details with a link to a file, often
inside the task workspace. Hovering over the rendered link appears to target the
current page. Clicking it opens another task details page instead of the file.

Capture an actual failing Markdown link and inspect how its destination is
parsed, rendered, and routed. Exact link syntax was not supplied during intake;
do not assume whether the failure originates in sanitization or URL resolution.

## Desired behavior and acceptance criteria

- [ ] A supported local file link in a comment resolves to the intended file,
  including files in the task's Git worktree, instead of the current task route.
- [ ] Define “open”: browser preview, download, or opening a local application;
  select a useful experience that works in the supported deployment.
- [ ] Define handling for native absolute paths, relative paths, spaces, and line
  references based on actual agent-authored links and supported platform formats.
- [ ] Missing files and removed/archived task workspaces produce a clear result
  rather than silently opening a duplicate task page.
- [ ] Ordinary web links keep working, with browser regression coverage for the
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
