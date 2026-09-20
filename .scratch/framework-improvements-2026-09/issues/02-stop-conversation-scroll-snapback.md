# 02 — Stop agent conversation scrolling from snapping back to the bottom

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Reproduce the bug and diagnose the follow-to-bottom behavior.

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

- [ ] Wheel, trackpad, keyboard, and scrollbar navigation can reach and read older
  messages without an unsolicited jump to the bottom.
- [ ] New messages, polling, and transcript layout changes preserve a user's
  reading position while they are browsing history.
- [ ] Intentional live following still works when the reader is at the bottom;
  define how leaving and returning to that position disables/resumes following.
- [ ] Add browser regression coverage for the reproduced snapback and intended
  live-follow behavior, including long content.

## Scope and related work

This is a reported behavior defect, not a confirmed diagnosis of a particular
scroll handler. Coordinate with [08](08-use-full-height-conversation-dialog.md)
if layout changes affect the scroll container; full-height layout is not required
to fix the bug. Do not conflate this with board navigation restoration in issue 03.

## Comments

- 2026-09-20: User-described GitHub bug; not independently reproduced during intake.
