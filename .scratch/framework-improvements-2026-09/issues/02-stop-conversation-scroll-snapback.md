# 02 — Stop agent conversation scrolling from snapping back to the bottom

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Report and reproduction

In a long agent conversation dialog, the user tries to scroll upward to read
earlier messages. The view repeatedly resets to the bottom. The only reliable
workaround reported is clicking and dragging the scrollbar upward manually.
The auto-follow behavior is too sticky and prevents ordinary history reading.

1. Open a conversation with enough history to require substantial scrolling.
2. Try scrolling upward using the ordinary wheel/trackpad interaction.
3. Observe whether the view returns to the bottom despite that input.
4. Compare with manually dragging the scrollbar, which reportedly defeats it.

The report does not establish whether the agent must be running. Test both live
and settled conversations and isolate refresh/render triggers before choosing a fix.

## Desired behavior and acceptance criteria

- [x] Wheel, trackpad, keyboard, and scrollbar navigation can reach and read older
  messages without an unsolicited jump to the bottom.
- [x] New messages, polling, and transcript layout changes preserve a user's
  reading position while they are browsing history.
- [x] Intentional live following still works when the reader is at the bottom;
  define how leaving and returning to that position disables/resumes following.
- [x] Add browser regression coverage for the reproduced snapback and intended
  live-follow behavior, including long content.

## Scope and related work

This is a reported behavior defect, not a confirmed diagnosis of a particular
scroll handler. Coordinate with [08](08-use-full-height-conversation-dialog.md)
if layout changes affect the scroll container; full-height layout is not required
to fix the bug. Do not conflate this with board navigation restoration in issue 03.

## Comments

- 2026-09-20: User-described GitHub bug; not independently reproduced during intake.

## Answer

The snapback came from deferring wheel and keyboard intent until an animation
frame. A trailing event could replace the movement baseline, while pending
layout or polling work restored the bottom before cancellation became durable.

Upward wheel/trackpad and history-navigation keys now cancel following
immediately without treating text editing or downward-at-bottom input as leaving
the live edge. Scrollbar movement cancels through the existing pointer path.
Cancellation also clears pending bottom restoration, and following resumes only
after the reader returns within one pixel of the true bottom; the broader 32px
tolerance remains limited to deciding whether a newly submitted follow-up should
start in follow mode.

Browser coverage now exercises long-content wheel and incremental trackpad
gestures, genuine Page Up navigation, scrollbar dragging, polling and layout
races, preserved history reading, deliberate bottom return, and continued live
following at the bottom.
