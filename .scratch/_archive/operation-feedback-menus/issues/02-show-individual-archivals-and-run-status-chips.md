# 02 — Show individual archival tasks and compact run status chips

**Type:** task

**Status:** resolved

**Blocked by:** 01

User visual review requires one menu entry for each archival task, including
tasks submitted together from Completion. Move each settled task into history
immediately while the remaining tasks continue. Display shared green/red status
chips, per-task dates and actionable failure reasons. Finished-only dismissal
must work during a batch and survive restart without hiding active tasks.
Preserve the shared archival safety/cleanup path and individual confirmation.

Run history shows task, agent name, date/time and a right-aligned status chip.
Remove redundant successful outcome prose and keep any failure explanation
inside the linked card. Live preparations carry their own task title so title
display does not depend on separately fetched or dismissed history.

Exercise mixed per-task progress and individual safety recovery in the isolated
software-delivery review environment, keeping the real running project untouched.

## Answer

Implemented one linked archival card per operation-task result. Each task moves
into history immediately on settlement, with its own durable outcome timestamp,
history order and dismissal state. Clearing history during an active batch hides
only finished task rows. Migration 0020 preserves existing outcomes and transfers
prior dismissal without modifying queue identities or deletion authorization.

Current-run history now uses agent names and shared right-aligned status chips.
Successful outcome prose is omitted; failure reasons remain inside linked cards.
Preparation views now supply their own task titles independently of history.
Bulk and individual archival already share their safety/cleanup path; individual
review supplies the explicit consent that bulk requests deliberately lack.

Validation: the task-level history regression failed before the change and passes
after it. Core/migration/safety checks passed, and all 24 affected browser cases
were verified, including dark/light chip contrast, per-task progress, partial
dismissal, refresh/reload, actionable failure links and title display while
history is unavailable. Full Node suite: 537 passed, seven skipped, one previously
known self-authored conversation-source failure. Typechecking, isolated build,
syntax checks and both review axes passed. Changes remain unstaged.

The isolated review host retains its existing data, has five Completion tasks
ready for mixed archival, and uses explicitly enabled five-second review pacing.
The held live preparation includes its title. The real project was untouched.

## Final visual refinement

The toolbar now reads Preparing, Running, Archiving. Empty active sections use
consistent quiet placeholders, and only the boundary above History has a divider.
The review-only preparation hold was released; T-0006 is now an inspectable
scripted run. Typechecking and 36 focused browser checks passed, including both
themes, empty states, history-only borders and existing toolbar/navigation flows.
Both review axes found no material blockers. User staging remains untouched.

Follow-up visual feedback: lifecycle cards now separate task IDs and titles with
a middle dot. Active runs match history's identity order: task ID and title on
the first line, agent on the next. The isolated example build was refreshed;
typechecking and all 14 lifecycle/live-run browser checks passed, including dark
and light appearances. User staging remains untouched.
