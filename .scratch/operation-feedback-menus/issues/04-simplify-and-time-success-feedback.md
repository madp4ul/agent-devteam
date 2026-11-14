# 04 — Simplify feedback cards and time success messages

**Type:** feature

**Status:** resolved

**Blocked by:** None

## Request

Show the message directly on a colored floating card, removing the target title,
timestamp and nested message box. Success messages expire after five seconds;
the left edge drains downward and pauses on hover. Errors remain until closed.
Stack cards down the screen without an internal scrollbar. Preserve individual
success producers pending the user's inventory decisions. Provide actual success
and error examples in the isolated review project.

## Result and validation

Implemented in OperationFeedback and its styles. Keyboard focus also pauses
countdown, so keyboard users can read and close cards without a deadline.
Each card owns its remaining time; updates to other feedback do not reset it.
Removed the old five-success eviction rule in favor of timed expiry.

Typechecking, isolated browser build, and all thirteen lifecycle/feedback browser
checks passed. Dark/light checks verify message contrast, simplified content,
hover and focus beyond five seconds, subsequent expiry, persistent errors,
dismissal, and absence of internal list scrolling. Existing centered-X and
retained-comment-draft checks pass.

Exercised the real controls on T-0012: a proposed dependency on T-0011 is safely
rejected as circular; Edit task → Save task then displays success alongside the
error. Added repeatable instructions to the inventory and example review guide.
The isolated example assets are refreshed; no running project state or shared
browser build was changed. Git staging remains owned by the user.

## Presentation correction after user review

Raised message text to 1rem and centered it vertically against the X. The missing
countdown was reproduced in both themes with reduced motion: a global rule set
all animation durations to .01ms, collapsing the edge before it could be seen.
The functional countdown now retains its five-second duration under that setting.
A new browser regression failed with zero edge height before the fix, then passed
in both themes, checking visibility, draining, pause, text size and center alignment.
The user's notification-policy decisions are recorded in the inventory for the
next pass; interruption and local-confirmation producers are unchanged here.
All fifteen lifecycle/feedback browser checks passed after the correction; the
isolated example build is refreshed for reload.
