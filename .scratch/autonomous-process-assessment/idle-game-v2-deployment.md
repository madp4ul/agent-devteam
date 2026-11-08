# Idle Game V2 deployment notes

Project-specific deployment record, separated from the reusable process README
on 8 November 2026. This describes the existing setup, not process requirements.

## Idle Game launcher and isolation

Run `start-agent-devteam-v2.bat` **inside the prepared
`idle-games-autonomous-v2` checkout**. It calls `launch.mjs` here and starts that
checkout directly. It never clones, fetches, switches branches or resets files.
The original `idle-games` directory keeps only its original team launcher.
The inherited `start-agent-devteam.bat` in the V2 checkout is also left unchanged
at the user's request. Use the explicitly named `start-agent-devteam-v2.bat` for
this team; the inherited launcher still selects the original process definition.

The independent clone was prepared separately on 7 November 2026, with copied
objects (no hardlinks), a detached primary checkout and local main at the captured
baseline. Setup selected the original clone's locally recorded `origin/main`,
falling back to local main, without fetching. The exact initial revision is retained
in `autonomousv2.baseline` in the V2 clone's local Git config. Uncommitted changes
and unmerged source-task work were not included in the selected working tree.

V2 is authorized to use the established project origin for normal synchronization,
backup and delivery. Configure the checkout's origin to the project's designated
destination; the process definition and role instructions contain no repository URL.
Every role may fetch and back up its own task branches;
Product owns local main and origin/main publication, including pull requests.
No per-push approval is required. The checkout and coordination database remain
separate from V1; both clones can refer to the same remote repository.

Use distinct team/task branch names. Fetch remote main before establishing a new
checkpoint baseline or publishing, and reconcile intervening commits through
ordinary integration. A rejected non-fast-forward push calls for synchronization,
not a force push or an invented blanket approval gate. Existing user publication
holds and branch protections still apply. V1's running host and local files are
not altered by configuring V2. The launcher still requires the prepared V2 clone;
it does not reuse V1's state binding.

The framework creates separate durable state on first startup in
`idle-games-autonomous-v2-agent-coordination-state`, with task worktrees under
`task-worktrees`. A second state root cannot simply be assigned to the original
clone: its existing state binding is unique. V2 uses port **3001**, leaving V1's
usual 3000 alone. Override with `--port 3101`.

Automation starts paused. Create a task in **Direction / Product** describing
the delivery goal and relevant context, then resume when ready. This is a fresh team,
not a copy of V1's tasks or conversations.

The launcher uses existing framework dependencies and built browser assets. It
does not reinstall or rebuild shared framework files while V1 is running. If
these are missing, prepare them in agent-devteam with `pnpm install
--frozen-lockfile` and `pnpm build` before launch. Both hosts use the same installed
framework code, Codex account and physical computer. Git/database isolation does
not isolate desktop sessions, game windows, game ports, GPU or native test
resources. Coordinate those resources explicitly before concurrent checks.

Supported batch options: `--port <number>` and
`--additional-allowances "project guidance"`. Clone setup options have been
removed. The batch supplies its own directory as the fixed project; duplicate
project arguments are rejected, and process/state-root overrides are unsupported.
As with ordinary batch launchers, shell metacharacters need appropriate quoting.


## Deployment locations

- Checkout: `D:/Daten/Projekte/Software/Codex/idle-games-autonomous-v2`
- Launcher: `start-agent-devteam-v2.bat` in that checkout.
- Established origin: `https://github.com/madp4ul/idle-games.git`.
- Existing source team and its launcher remain unchanged.

## First task workspace failure and repair (2026-11-08)

T-0001 failed before agent execution while creating its detached worktree from
the process default `main`, resolved to `b370c7d7fa353f7aabaaf3e971a9909a0da92caf`.
The retained startup diagnostic contains 20 `Filename too long` errors for
deeply nested tracked evidence files before the final `Could not reset index
file to revision 'HEAD'` message. Reaching 100% meant Git had attempted all
23,215 files, not that checkout had succeeded.

Set `core.longpaths=true` in the V2 clone's local Git config only. No global
configuration, V1 state, branches, remote refs, framework code, or task database
was changed. Git had already removed the failed directory and registration;
there was no partial task workspace to repair or adopt. User Retry remains the
next action; no activation was triggered during repair, and no restart is needed.

Validation: a small real Git worktree fixture reproduced both error messages
with long paths disabled and succeeded with them enabled. A disposable index
and checkout then successfully materialized all 20 actual failing files from
V2's `main`, using its repaired repository config, at paths up to 268 characters.
This verifies the observed blocker; the full task retry has not yet been observed.
Probe artifacts are under ignored `.scratch/local-evidence/git-longpaths-c1d2x8s3`
and `.scratch/local-evidence/v2-path-check-uxcikrw9`.

The default is local `main`, not an automatic fetch of `origin/main`. Once V1
has published its remaining work, Product Lead should fetch and reconcile main
in its own task worktree before establishing the next checkpoint baseline.
Pushed feature branches do not themselves advance main. The primary V2 checkout
is detached, so it does not reserve the local main branch against Product Lead.
