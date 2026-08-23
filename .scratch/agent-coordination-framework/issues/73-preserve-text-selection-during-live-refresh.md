# 73 — Preserve Text Selection During Live Refresh

**What to fix:** Automatic task-detail and agent-conversation refreshes must
not clear or collapse text the user has selected while reading. Authoritative
content updates must still appear without requiring the user to reopen the
surface.

**Priority:** High — polling currently interrupts basic reading and copying.

**Status:** resolved

- [x] Selecting rendered text on the task details page survives an
  authoritative polling refresh.
- [x] Selecting rendered text in the agent conversation overlay survives an
  authoritative polling refresh.
- [x] Polling continues to render changed task and conversation content.
- [x] Selection preservation does not steal focus or recreate a selection when
  the user has cleared it or selected outside the refreshed surface.
- [x] Deterministic browser regressions cover both affected surfaces.

## Comments

- Reported from live use: selected text is reset roughly every two seconds on
  task details and in the agent conversation overlay, matching their polling
  cadence.
- The agreed public test seam is the rendered browser UI under authoritative
  polling: create a DOM text selection, force a changed projection, and assert
  that the browser selection still contains the same text.
- The deterministic repro failed on both surfaces because refreshed rendered
  content replaced the DOM nodes containing the browser selection. The task
  page's poll also rerenders an open portal conversation before the
  conversation's own poll runs.

## Answer

Task-detail refreshes now capture selections only within the task content or
an open conversation transcript, and conversation refreshes capture their own
transcript selection. Each refreshed surface restores the same selected text
at the nearest prior position after React commits the authoritative update; if
the text disappeared or the user cleared the selection before the refresh, no
selection is recreated. Restoration leaves keyboard focus and existing scroll
preservation intact.

Browser regressions prove task-description and conversation-transcript
selection survives changed polling data, remains cleared after a later poll,
and does not move transcript focus. Type-checking, the production build, all
225 non-browser tests (222 passed, 3 intentionally skipped), and all 104
browser tests pass. The final Standards and Spec reviews report no findings.
