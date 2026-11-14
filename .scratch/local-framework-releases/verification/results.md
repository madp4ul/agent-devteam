# Verification and local deployment

Date: 14 November 2026.

## Implemented behavior

- Explicit `pnpm release:local` builds an independent, complete installation,
  verifies it on disposable state, and atomically selects latest.
- Project startup resolves latest once. Existing hosts and their later browser,
  worker and MCP activity keep their concrete installation until normal restart.
- Installed Node.js is used. Published installations retain readable source,
  package/source provenance and the usual diagnostic and recovery evidence.
- The Autonomous V2 batch file remains unchanged in its existing checkout
  location. Its process-repository launcher now selects a release before
  validation and starts that same installation.
- The original idle-game batch file also uses the release launcher and preserves
  its project/process arguments, default port and extra option forwarding.

## Checks

- `pnpm typecheck`: passed during installation development and after integration.
- Full `pnpm test`: 548 tests, 540 passed, 7 skipped, 1 failed; 133.6 seconds.
  Real-model opt-in environment switches were unset.
- All three release tests passed in that full run: independent installation,
  retained-database migration/recovery, and publication/restart lifetime.
- Independent installation proves no package links into the development tree,
  source-unavailable host and browser operation, packaged Codex executable
  `--version`, authenticated MCP transport, and worker loading without a model.
- Retained-database proof covers upgrade from the initial released schema,
  retained task/attempt/conversation/transcript/thread correlation, independently
  inspected recovery copies, and deliberately rejected migration rollback with
  configuration-error reporting. Matching source remains readable.
- Publication proof covers host A while B is published, actual later controlled
  runtime dispatch from A, restart selecting B, competing complete publications,
  failed/incomplete candidates, and invalid selection without source fallback.
- V2 launcher tests: 5 passed. A controlled application's validation publishes B
  between validation and startup; startup still uses selected A and forwards
  project, process, port, allowances and exit status.
- Local consumer smoke: a disposable independently prepared clone launched the
  real V2 process through the installed release, reached paused startup, served
  browser HTTP 200 and bound state only inside the temporary fixture. A controlled
  application boundary also verified original batch argument forwarding.
- Standards review: two test-isolation findings fixed (checked fixture
  substitutions and explicit temporary release-root environment). Final result:
  zero remaining findings.
- Spec review: zero findings. Initial narrow diagnostic verification was extended
  to retained attempts, transcripts and native thread identities.

HTTP checks required scoped execution outside the sandbox because its loopback
connections returned EACCES. No checks were weakened to accommodate that limit.

## Existing suite failure

The sole full-suite failure is `a self-authored activation source stays available
through retained conversation history` in the application conversation tests,
asserting `false !== true` at line 154. The focused command also reproduces it:

```powershell
node --experimental-strip-types --test --test-name-pattern='a self-authored activation source stays available' test/application/agent-conversation.test.ts
```

`git diff HEAD -- src test/application/agent-conversation.test.ts` is empty: this
feature changes neither the application code nor that test. The same failure was
already recorded in the earlier workspace-permission implementation evidence.
It remains outside the release-isolation scope. The full suite is not green.

## Local installation

The sibling release root is `agent-devteam-releases`, with first selected identity
`2026-11-14T15-35-44-974Z-7c4c3091`. It is a local deployment artifact outside the
source repositories. Existing hosts were not stopped, restarted or migrated.
Live adoption happens on the user's next normal project-host restart.

All source changes remain unstaged. The previously staged framework diff's
SHA-256 stayed `492A6F37D14369C566A1EAEFFDB8F01FE23F27291032E6DF03B16D30E0334A3A`.
No repository commits, pushes or global Git trust changes were made.
