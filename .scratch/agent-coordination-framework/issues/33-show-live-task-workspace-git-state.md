# 33 — Show Live Task-Workspace Git State

**What to build:** Extend the task-workspace section with a compact,
automatically updating Git summary so a user can understand the workspace at a
glance while an agent works, while leaving file-level inspection to the user's
existing Git tools.

**Blocked by:** 31 — Expose a Task's Workspace

**Status:** resolved

- [x] A provisioned task workspace shows a fixed-size live Git summary without
  filenames, diffs, commit lists, disk usage, or a repository browser.
- [x] The summary shows the current branch. A detached workspace instead shows
  `Detached at <short-hash>` with the short hash visually secondary and no
  dedicated commit-copy action.
- [x] The summary compares current `HEAD` with the task workspace's persisted
  starting commit. It shows the number of commits since task start when `HEAD`
  descends from that commit, and `History diverged from task start` otherwise.
- [x] One **Workspace changes** card shows net tracked-line additions and
  deletions relative to current `HEAD`, plus separate counts for staged,
  unstaged, and untracked files. Tracked-line totals exclude untracked files.
- [x] Staged and unstaged counts may overlap when one path has both kinds of
  change. Zero-count file rows are omitted, and a workspace with no staged,
  unstaged, or untracked changes says `No uncommitted changes`.
- [x] Git state is scanned immediately when a provisioned task page opens or
  regains visibility, every five seconds while an attempt is running, and every
  thirty seconds otherwise. No scan starts while another scan is still running,
  and no periodic scan runs while the page is hidden.
- [x] A slow scan leaves the previous successful result in place without a
  staleness notice. A failed scan also retains that result, adds a
  non-interactive `Git status unavailable` warning, retries automatically after
  thirty seconds, and clears the warning after the next successful scan.
- [x] Distinguish authoritative workspace consistency from ordinary Git working
  state: a dirty workspace can be healthy, while a missing registration is a
  startup consistency error owned by issue 23.
- [x] Preserve the basic path, Copy path, and Open workspace experience from
  issue 31 when Git status is slow or temporarily unavailable.
- [x] The implementation uses bounded, ordinary Git commands and introduces no
  filesystem watcher, background Git daemon, or persisted Git-status cache.
  Further performance machinery requires measured evidence that this design is
  insufficient.
- [x] Application and browser coverage exercises branch and detached states,
  committed progress and divergent history, clean and overlapping change
  categories, active and idle refresh cadence, page visibility, slow and failed
  scans, automatic recovery, and uninterrupted Copy/Open actions.

## Comments

- Keep this issue lower priority than basic workspace discovery. It deliberately
  captures the richer direction without bloating issue 31's first useful task
  workspace section.
- Run another focused grilling or prototype before marking this issue
  ready-for-agent; the desired refresh behavior and presentation have not yet
  been validated.
- Focused grilling on 2026-08-10 selected a fixed-size summary rather than an
  expandable file list. The user prefers opening the workspace in Visual Studio
  Code for filenames and diffs, so duplicating its source-control UI would add
  interaction and implementation cost without enough value. The agreed polling
  design favors seamless background freshness and graceful automatic recovery
  over exact age indicators or manual retry controls.

## Answer

Task details now show a fixed-size, automatically refreshed Git summary for a
provisioned task workspace. It presents branch or detached-HEAD identity,
progress or divergence from the persisted task-start commit, net tracked-line
changes, and separate staged, unstaged, and untracked file counts without
exposing filenames or duplicating repository-browser behavior.

The application reads this state through bounded ordinary Git commands. The
browser scans immediately, every five seconds during a running attempt, and
every thirty seconds otherwise; hidden pages pause polling and visibility
restoration triggers an immediate non-overlapping scan. Slow and failed scans
retain the last successful result, failures recover automatically, and Copy and
Open actions remain independent.

Verification passed both TypeScript typechecks, the production build, 121 local
tests with one intentional credentialed integration skip, all 31 browser
scenarios, and `git diff --check`. Independent Standards and Spec reviews report
no remaining findings after their two spec-review partials were resolved.
