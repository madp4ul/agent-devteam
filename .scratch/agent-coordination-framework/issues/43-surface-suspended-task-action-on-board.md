# 43 — Surface Suspended Task Action on the Board

**What to fix:** After a user interrupts a task, its preserved activation is
correctly queued but task automation is durably suspended until Continue. The
board card must show that user action is required instead of presenting the task
as ordinary queued work.

**Blocked by:** 25 — Interrupt Tasks and Pause the Process

**Status:** resolved

- [x] Board task projections expose durable task automation suspension without
  inferring it from queued activations or attempt outcomes.
- [x] A suspended task card has a prominent action-required signal that says
  automation is suspended and Continue is required; an ordinary queued task
  remains labeled only as queued.
- [x] The suspension signal coexists predictably with blocking, unresolved
  attention, failed activation, and queued-count signals without implying that
  process Pause caused a task suspension.
- [x] Opening the signaled card leads to the existing task-details Continue
  control and suspension explanation; continuation clears the board signal when
  the authoritative projection refreshes.
- [x] Accessible text conveys the action requirement without relying on badge
  color alone.
- [x] Application projection and browser tests cover interruption through the
  suspended board state, navigation to Continue, continuation, and signal
  removal while preserving the activation's queue position.

## Comments

- Live testing after issue 25 reproduced the defect: task inspection reported
  `automationSuspended: true`, while the board overview omitted that state and
  the card rendered only `Queued · 1`. Queue state is accurate but insufficient
  because no attempt can start until the user explicitly continues the task.

## Answer

Task overviews now project the authoritative task automation suspension flag.
Suspended board cards show the explicit, accessible signal `Automation suspended
· Continue required` alongside the still-truthful queued count. Opening the task
continues to lead to the existing suspension explanation and Continue control;
after continuation, the refreshed overview clears the signal without changing
activation identity or queue semantics.

Application and browser regression coverage exercises interruption, suspended
projection, board navigation, continuation, and signal removal. Verification
passed both TypeScript typechecks, 87 local tests with one intentional
credentialed integration skip, the production build, all 14 browser scenarios,
visual browser inspection, `git diff --check`, and independent Standards and
Spec reviews with no findings.
