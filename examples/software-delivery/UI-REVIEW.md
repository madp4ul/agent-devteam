# Feedback and lifecycle menu review

From the repository root, run:

```powershell
node --experimental-strip-types examples/software-delivery/ui-review.mjs
```

Open http://127.0.0.1:3010. This uses the supplied software-delivery process and
the real browser, application, SQLite and Git paths. Agent execution is scripted,
clearly identified in task descriptions and outcomes, and incurs no model usage.
It does not launch the normal example against the framework checkout. Its project,
worktrees, database and browser build live in the ignored
`.scratch/operation-feedback-menus/environment/` and `assets/` directories.
The regular `dist/web` build and existing running projects are untouched.

The first launch creates two clean Completion workspaces, one dirty Completion
workspace, and a failed run. Keep the terminal open. Commands are:

- `seed` adds another batch and records real preparation/run outcomes.
- `run` starts a two-minute scripted run, which can also be interrupted in the UI.
- `prepare` holds a preparation open for visual inspection. `release` lets its
  normal Git preparation finish and starts an inspectable scripted run.
- `slow` adds an intentional five-second pause before each workspace archival so
  individual tasks can be watched moving from the queue into history. `fast`
  removes that review-only pacing. This is not an archival performance benchmark.
- `quit` shuts down safely. Start the same command again to inspect retained history.

Manually created tasks stay in their selected column. Their scripted runs wait
until interrupted, allowing review without tasks immediately moving to Completion.

Review these cases in both Appearance themes:

1. Open a task and post a comment. Its draft clears and the timeline updates,
   with a timed floating confirmation. To exercise a transport error, switch the browser
   developer tools Network panel to Offline before posting a new draft. The error
   floats independently, retains the draft, and closes with X. Restore Online.
2. Use `seed` while watching Preparing and Running. Open either menu, close
   it with Escape or an outside click, then reopen. Prepared results remain below
   active work. Dismiss history and check active work stays visible.
3. Expand Delivery and archive its Completion tasks. Archiving counts queued and
   running tasks. Each task moves independently into history when it settles,
   including failures with a link to the dirty workspace.
   Follow that link and use the existing individual confirmation if you want to
   discard the intentionally uncommitted review note.
4. Start another batch or individual archival while a request is active. Navigate
   between board/task/resource pages, reload, then reopen Archiving. Closing the
   menu neither dismisses results nor cancels work. Dismiss history after results
   settle; the toolbar entry disappears only when no entries remain.
5. Enter `run`, inspect its active entry, then interrupt it. Finished runs appear
   in History, capped at thirty. Dismiss history, restart the review host, and
   verify dismissed entries stay gone. New results can still appear.
6. Try a narrow browser viewport and a long history. Menu contents scroll within
   the viewport; active entries come before the quieter History section.

Archival can finish quickly in this small repository. Browser regressions hold
the request and Git boundaries to exercise queued/running states deterministically;
the review host does not artificially delay production archival code.

## Review existing success messages

The [success-message inventory](../../.scratch/operation-feedback-menus/success-feedback-inventory.md)
lists every remaining floating success family and distinguishes progress messages
and local confirmations. Notification policy is unchanged; keep/remove decisions
are open for review.

With the review host running, prepare the passive examples once:

```powershell
node .scratch/operation-feedback-menus/seed-success-review.mjs
```

The seed verifies the isolated project and preserves existing examples on rerun.
Its task links are printed and saved in the ignored `environment/success-review.json`.
For the current review, open [T-0011](http://127.0.0.1:3010/tasks/T-0011), click
**Edit task → Save task**, and see the floating success message. No text change
is required. Close it with X before repeating. The inventory links additional
relationship and unarchive examples that do not activate agents.

Success cards now disappear after five seconds; hover or keyboard focus pauses
the draining left edge. Errors remain until closed. To compare both, open
[T-0012](http://127.0.0.1:3010/tasks/T-0012) and try adding T-0011 as a dependency
with Architecture Designer as resume agent. This circular relationship is safely
rejected and shows a real error. Cancel the dialog, then Edit task → Save task
to display a success alongside it. The inventory contains the full steps.
