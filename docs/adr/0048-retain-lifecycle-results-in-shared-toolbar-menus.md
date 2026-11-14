# Retain lifecycle results in shared toolbar menus

Status: accepted

[ADR 0049](0049-project-archival-menu-history-per-task.md) refines archival menu
entries and history paging to individual task outcomes instead of batch operations.

The user wants ordinary operation errors visible independently of page scroll or
the control that initiated them. Such messages use viewport-fixed feedback with
an accessible SVG X close control. Following the timed-feedback review, comment
success also uses this surface alongside its pending button, cleared draft and
timeline update. Success expires after five unpaused seconds; errors persist.
Workspace copy/open actions and task Markdown file links publish to that same
page-owned queue, replacing their inline confirmations.

Archival progress has a different lifetime. A persistent floating job panel covers
content, and dismissal previously made results inaccessible. Replace that panel
with a separate Archiving toolbar menu, using the existing Current runs disclosure
pattern. Separate Preparing from Current runs as well. All three controls share
the same component on board, task and resource pages, ordered by lifecycle.
Labels are count-first without dot separators. Archiving counts both queued and
running tasks; finished history contributes no active count. Preparing and
Archiving are absent only when their menus have no entries.

Menus are opened explicitly. Closing a disclosure does not change durable state.
Active entries appear first; a quieter History section contains Dismiss history,
which applies only to entries finished at the host command boundary.
The host rejects dismissal of active archival/preparation records. Failures and interruptions are retained alongside
successes, with task links and original deletion-confirmation flows.

Migration 0019 adds compact preparation outcomes and run summaries owned by the
coordination core. Run summaries are captured in the existing attempt settlement,
interruption and startup recovery transactions before task archival can remove
the source attempt. The latest thirty results are retained including dismissed
entries, so dismissing history never exposes older runs. Preparation outcomes
remain until dismissed; unfinished preparations become Interrupted when the host
next opens retained state. These presentation records never authorize execution,
retry, deletion or state repair. Existing archival operation records remain
authoritative for archival results; their dismissal is persisted, with finished
successes available until dismissed rather than silently capped at fifteen.

History and dismissal are project-wide and survive navigation, browser reloads
and host restarts. The browser reads history through a focused application query
and command, without loading task timelines or transcripts. Closed menus poll
only compact indexed counts and a revision. Opening a menu loads bounded pages
of fifty preparation results or twenty archival operations, with explicit older
history controls; run history is capped at thirty. Page-level archival polling
reads only active operations. Menu summaries retain at most 2,000 characters per
run/preparation outcome. The shared toolbar
uses existing authoritative active execution/preparation projections for live
details. Compact menu summaries remain inspectable after task archival, while
full detailed task history keeps its existing archival lifecycle.

The software-delivery example provides a separate disposable review host on port
3010, with its own repository, database, worktrees and browser build. It uses real
application/HTTP/Git behavior and an explicitly scripted runtime. UI review does
not modify the user's running project, invoke models or rebuild its shared assets.
