# Separate Autonomous V2 candidate created

## Update: 7 November 2026 — setup separated from startup

At the user's request, the independent checkout has now been created explicitly
at `D:/Daten/Projekte/Software/Codex/idle-games-autonomous-v2`. It starts detached
at `b370c7d7fa353f7aabaaf3e971a9909a0da92caf`, with local main at that revision,
no remote and no object alternates. The baseline came from the original clone's
locally recorded origin/main; no network fetch was performed. The full copy and
checkout completed successfully.

`start-agent-devteam-v2.bat` now lives in that new checkout. Its helper only
validates and starts an already prepared project; all cloning/setup options and
code were removed. The obsolete V2 setup launcher was removed from the original
Idle Game folder after checking that it still matched our generated version.
The original `start-agent-devteam.bat` in BOTH checkouts was left unchanged,
explicitly requested by the user; hashes were checked around installation.

Three startup-only tests passed: preserve files/config/refs, reject unprepared
or missing checkouts without creating them, and reject the source/linked
worktrees. Process validation still passes with the fingerprint below. The actual
new checkout passed launcher inspection, and its only working-tree change is the
new untracked V2 batch file. Documentation was updated. No host or agents were
started, no state database was copied, and no changes were staged or committed.
The framework will initialize V2's separate state on its first normal startup.

The original 5 November record below is historical; its statements that the
launcher creates the clone and that no clone exists are superseded by this update.

## Original creation record

5 November 2026. User authorized a new process beside Autonomous and a second
batch launcher in the Idle Game root. Implemented without changing existing
Autonomous files, live task state, source-clone Git configuration or the old launcher.
Earlier unstaged Autonomous revisions remain untouched.

Process: `D:/Daten/Projekte/Software/Codex/agent-devteam-processes/Autonomous-v2/process.yaml`.
Documentation and lifecycle scenario review live alongside it. Seven independent
role files are referenced; no mutable instruction files are shared with V1.

Installed launcher:
`D:/Daten/Projekte/Software/Codex/idle-games/start-agent-devteam-v2.bat`.
Canonical copy and Node helper are in the V2 process directory. The installed
copy uses Windows CRLF and was compared with the canonical text.

Important implementation choices:

- Separate clone is required by one-state-root-per-clone framework binding.
  First start creates sibling `idle-games-autonomous-v2`; its state root is
  `idle-games-autonomous-v2-agent-coordination-state`, usual port 3001.
- Local-only trial removes the clone-created origin pointing at V1 before any
  agents run. No claim that two teams are sole contributors to the same origin.
  Remote publication requires explicit destination/policy authorization.
- Initial baseline is locally recorded origin/main, falling back to local main;
  no network fetch. First-use --baseline can select another committed revision.
  Source uncommitted/unmerged work is not the selected working tree.
- Main primary checkout stays detached; continuing Product claims main. Unique
  checkpoint branches survive completion without branch-checkout conflicts.
- Ready features merge promptly into checkpoint integration. Product consumes
  main at checkpoint completion in this first version. Incremental main
  publication was explicitly deferred, not claimed as implemented.
- Finite feature/correction/assessment handoffs and watched active stages replace
  Ready/Waiting parking. Corrections have Repair -> Review -> Completion.
- Launch uses existing framework dependencies/browser build and does not rebuild
  or reinstall shared files while another host runs. Physical desktop/GPU and
  Codex account remain shared; Git/database isolation is not resource isolation.

Validation passed, semantic version:
`f5df7c8d7e77a8e442655f01f42752b27f6319e9c8a7e6b2bfd5eb69b93b887f`.
Three disposable-repository launcher tests passed: independent config/state and
detached main; recorded/explicit/fallback baselines; reuse preservation and refusal
of an unrelated existing directory. Node syntax check passed. Existing tracked
diff whitespace check passed. No staged changes or commits were made.

The real V2 clone and host have NOT been started. No live process was nudged,
restarted or migrated. First launch remains the user's action; automation starts
paused and a fresh Direction/Product task supplies the new team's goal.
Behavioral delivery success remains to be evaluated in ordinary trial work.
