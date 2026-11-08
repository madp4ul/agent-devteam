# Separate Autonomous V2 candidate created

## Update: 8 November 2026 — origin ownership authorized

The user explicitly rejected the local-only trial restriction and authorized V2
as the forthcoming delivery process with ownership of the established origin.
That supersedes all earlier local-only/conditional-origin notes below.

Configured V2's origin as `https://github.com/madp4ul/idle-games.git`, matching the
original project's inspected fetch/push destination. Read connectivity verified
with ls-remote; origin/main was `b370c7d7fa353f7aabaaf3e971a9909a0da92caf`.
No commits were pushed, no local branch or working files were reset, and V1's
configuration, live host and database were not changed.

All eight V2 roles now have standing authorization for routine origin fetch,
integration and non-force task-branch backup, including unfinished work. Product
owns local main and origin/main publication and corresponding pull requests with
no per-operation approval requirement. Effective destination checks, protections
and explicit user holds remain. Team/task-specific branch names and synchronization
with remote advances preserve work while V1 and V2 coexist. This does not authorize
taking over V1's local worktrees or force-updating its remote refs.

README and Product/Integrator guidance were aligned. Validation and allowance
coverage checks passed. Fingerprint:
`91f3b63550442ffbd8bc654564337eefae7edfe5aea043c19d1ebb5551694d03`.
No host restart or new agent activation was performed. Source instructions and
allowances still require adoption through the normal V2 process-loading path.

## Update: 7 November 2026 — adaptable guidance and routine allowances

User reaffirmed that the process should guide pragmatic cooperation and learning,
not prescribe every move, and authorized more permissive routine allowances.
V2 shared guidance now explicitly permits adaptations to tactics, stage order,
delegation and evidence within the agreed outcome without additional approval.
Roles describe normal routes, reuse valid reviews and retain focused perspectives.
Stewardship records the situation, adaptation, result and lesson before proposing
durable improvements. User decisions/holds, independent review, honest acceptance
and shared-work ownership remain boundaries; local adaptation does not silently
rewrite standing permissions or process configuration.

All eight roles now receive shared routine engineering allowances: task-owned
edits, builds/tests/analysis, evidence, bounded benchmarks, declared dependencies
from established registries and normal caches, public reference research, local
game/study/server validation, and task-owned Git including shared metadata.
Conditional origin synchronization/backup and Product publication require an
already user-designated destination. V2 remains a local-only clone; no remote was
added or V1 publication authority inferred. Permissions do not bypass native
auto-review, sandbox, app grants or explicit holds. Effectiveness requires actual
adoption and observed attempts, not just validated YAML.

Definition and structural checks passed; all reviewers, board order and watched
stages preserved. Fingerprint:
`9cb49c7cde7a3f8a853bc637c503d5c19a0525a31e12e1c459b141bf28af2647`.
No live host was restarted, no agents activated and nothing staged or committed.

## Update: 7 November 2026 — explicit attention in watched stages

Following the user's observation of passive user-wait columns, V2 source now
removes all five User Review/User Decision columns. All ten declared workflow
columns are watched; framework Completion remains implicit and unwatched. Tasks
request genuine user decisions or checkpoint review through explicit @user
comments while retaining their current responsible stage. Pending user decisions
remain binding even if an explicit activation arrives. Unresolved attention
already suppresses the framework's automatic stall recovery; it is not a universal
dispatch lock. No framework behavior was changed.

V2 retains no task backlog. Adopted blocked work stays watched with a finite
prerequisite and completion consumer; uncommitted ideas remain documented
deferrals. Placeholder dependencies must not be manufactured to silence recovery.
The reported V1 Backlog behavior was not independently inspected in this turn.

Validation passed with fingerprint
`c517a6be815e0796bb7783c07e61b783b1902bda4cc04af23829ca85ec39a785`.
README and scenario review include this behavior and adoption guidance for any
existing tasks in removed columns. No running host was restarted and no live task
was moved or activated. Old sequence diagrams' final User Review column is now
historical: the endpoint is an explicit user request on the watched Product task.

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
