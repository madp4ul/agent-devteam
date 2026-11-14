# Feedback placement and lifecycle menus

Agreed with the user on 2026-11-14.

Ordinary operation messages belong to an independent viewport-fixed surface,
outside composers and page flow, with an accessible X close control per item.
Posting a comment uses its pending button, cleared draft and timeline entry, plus
a timed floating success message. Submission errors retain the draft and appear
in independent floating feedback. Workspace copy/open and Markdown local-file
confirmations also use this shared floating surface, including failures; their
inline confirmation tags are removed. Copy Markdown and attachment indicators
retain their local presentation.

Feedback cards show the message and X directly, without a target heading,
timestamp or nested message box. The whole card uses the appropriate green/red
surface. Success/status feedback expires after five seconds of unpaused time;
its left edge drains from top to bottom. Hover or keyboard focus within the card
pauses both countdown and indicator. Error/alert feedback persists until closed.
Cards stack naturally down the viewport without a separate scrolling list.
Retain the approved success producers. Interruption produces one success notice
only after the requested attempt is confirmed interrupted, with no progress overlays.

All page toolbars share three lifecycle menus in this order: Preparing, Running,
Archiving. Labels use count-first wording without dot separators. Run
counts represent actual running executions; archival counts include queued and
running tasks. Preparing and Archiving exist only while they contain entries,
including retained finished entries, and may show zero current activity.

Menus open on request rather than floating persistently over the page. Closing
a menu never dismisses records or cancels work. Active entries precede a visually
quiet History section whose separator contains Dismiss history. Dismissal removes
only entries finished at the host command boundary. Queued/running entries remain.
Successful preparation results remain until dismissed. Run history retains
the latest 30 finished runs, including failed/interrupted results, without
limiting active runs. Dismissal must not cause older runs to reappear.

History and dismissals are project-wide durable state and survive navigation,
browser reload and framework restart. History has no authority over scheduling,
execution permissions, archival consent or task state. Preserve archival safety
confirmations and actionable task-specific failure links.

Demonstrate through the supplied software-delivery example using an isolated
disposable project, real application/HTTP/SQLite/Git paths, and a clearly labelled
scripted runtime rather than paid agents. Include comment success/error, queued
and active work, retained preparation/run results, successful and mixed archival,
dismissal, navigation/reload/restart, and dark/light/small viewport coverage.
Do not alter the user's running project or shared browser build during review.

## Visual review refinement

Successful preparation history shows only the linked task identity/title and
date. It omits agent identity and redundant Prepared / Workspace ready text.
Actual failed/interrupted preparation still shows its diagnostic. All preparation
content belongs inside the hovered task link. Top-level task creation uses its
visible board update instead of a floating success confirmation. Comment posting
additionally has timed success feedback following the later review decision.

Run history retains task, agent name, timestamp and a right-aligned shared status
chip. Success prose is omitted; failure explanations stay inside the task link.
Archiving lists individual tasks, including those submitted together. Each task
moves into history immediately when it settles, independently of its batch.
Terminal archival cards show status chips and any failure reason inside the link.
History dismissal applies to finished task results even while the batch runs.
Live preparation titles are supplied by the live view itself.

All three menus use consistent quiet “No active …” placeholders above history
when no work is active. A separator appears only above History, with whitespace
between individual active/history cards.
