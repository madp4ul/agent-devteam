# 43 — Surface Suspended Task Action on the Board

**What to fix:** After a user interrupts a task, its preserved activation is
correctly queued but task automation is durably suspended until Continue. The
board card must show that user action is required instead of presenting the task
as ordinary queued work.

**Blocked by:** 25 — Interrupt Tasks and Pause the Process

**Status:** resolved

- [x] Board task projections expose durable task automation suspension without
  inferring it from queued activations or attempt outcomes.
- [x] A suspended task card uses the standard Needs attention signal derived
  from its suspension reason; it does not add a redundant automation-specific
  card signal, and an ordinary queued task remains labeled only as queued.
- [x] A suspended task appears in the board's Needs attention area with an
  explicit Continue-required reason derived from the authoritative suspension;
  continuation removes the entry without a separate acknowledgement action.
- [x] Each later interruption creates a distinct attention-reason occurrence
  linked to its suspension event, so notification deduplication does not hide a
  new suspension after an earlier one was continued.
- [x] The Needs attention signal coexists predictably with blocking, other
  unresolved attention, failed activation, and queued-count signals without
  implying that process Pause caused a task suspension.
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
- Follow-up live testing found that the card signal alone left the board's
  Needs attention area claiming no action was required. Suspension is projected
  there as a reason rather than stored as a duplicate attention record, so the
  task flag remains authoritative and Continue resolves both presentations.
- Once suspension became a real attention reason, the separate `Automation
  suspended · Continue required` card signal duplicated `Needs attention · 1`.
  The card now uses only the standard attention signal; the attention area and
  task details retain the specific explanation and Continue action.

## Answer

Task overviews now project the authoritative task automation suspension flag,
and the same flag produces a Needs attention reason without duplicating durable
state. Suspended board cards show the standard, accessible `Needs attention`
signal alongside the still-truthful queued count, without a redundant
automation-specific tag. The Needs attention area explains that automation is
suspended and Continue is required. Opening the task continues to lead to the
existing suspension explanation and Continue control; after continuation, the
refreshed overview clears the attention signal without changing activation
identity or queue semantics.

Application and browser regression coverage exercises interruption, suspended
projection, Needs attention visibility, board navigation, continuation, and
authoritative removal of both signals. Verification
passed both TypeScript typechecks, 88 local tests with one intentional
credentialed integration skip, the production build, all 14 browser scenarios,
visual browser inspection, `git diff --check`, and independent Standards and
Spec reviews with no findings.
