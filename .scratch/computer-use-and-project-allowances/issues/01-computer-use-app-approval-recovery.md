# 01 — Investigate Computer Use app approval in framework-launched runs

**Type:** research
**Status:** resolved
**Blocked by:** None

## Problem

Framework-launched agents can enumerate desktop windows, but Computer Use
refuses activation or inspection. Continuing the permission-blocked activation
with explicit user authorization repeatedly produces the same refusal. Establish
a supported app-approval path, or explain an unsupported runtime integration,
rather than repeatedly asking for conversational consent that cannot resolve it.
Generalize the findings beyond the Balatro project and Autonomous process.

## Observed evidence — 2026-10-05

- Project `D:/Daten/Projekte/Software/CSharp/agent-devteam-balatro-videos`, task
  T-0005, Implementation participant, activation
  `8f2cc722-8b2b-448a-b84f-c21f2d6f3370`.
- Thread `01a10d45-6f05-7242-b188-daf4675eb6b7`, model `gpt-6.1-sol`, Computer
  Use skill `26.930.31730`, `node_repl` / `@oai/sky`.
- Actual API is `sky.activate_window`. Tool output says
  `Computer Use was not approved to use Visual Studio Code`. Equivalent errors
  occurred for Firefox activation and Balatro inspection.
- Resumed-thread user prompts contain `i allow it`,
  `i allow computer use for vs code, firefox and balatro`, and
  `i allow any sky tool use`. Delivery is established in the Codex rollout.
- Following named-app authorization, activation failed at 18:44:16 UTC;
  following broad Sky authorization, activation alone failed at 18:50:02 UTC.
- Attempt `b35c4899-ff71-469d-a359-3f0b814a6b56` records process reviewer
  allowances as `active`; these authorize implementation Git work.
- Separately, a VS Code editor-text request was rejected by Auto-review at
  18:49:07 UTC because it could expose unrelated private `process.yaml` contents.
  That rejection is distinct from the app-access refusal.

Read-only evidence locations; do not copy full private transcripts:

- `D:/Daten/Projekte/Software/CSharp/agent-devteam-balatro-videos-agent-coordination-state/coordination.sqlite3`
- `C:/Users/Paul/.codex/sessions/2026/10/05/rollout-2026-10-05T20-13-36-01a10d45-6f05-7242-b188-daf4675eb6b7.jsonl`

## Established boundary and unresolved question

[Auto-review documentation](https://learn.chatgpt.com/docs/sandboxing/auto-review)
states that Computer Use app approvals go directly to the user; Auto-review does
not replace them. [Computer Use documentation](https://learn.chatgpt.com/docs/computer-use)
describes Allow/Always allow and Windows persistent app decisions under
`computer_use.windows.always_allowed_app_ids` in Codex configuration.

Framework Continue delivers user text to the resumed prompt, not an app-grant
operation. Extra reviewer guidance cannot itself establish an app grant. The
incident does not establish why the grant/prompt is absent: SDK/headless support,
host routing, effective app policy and other runtime limitations remain unverified.
The affected agent's diagnosis is not proof of a framework defect.

## Investigation and completion criteria

- Build a controlled reproduction with a harmless target app using supported
  Computer Use APIs. Compare framework SDK and direct supported Codex runs under
  equivalent policy; capture actual approval events/responses and tool errors.
- Verify continuation delivery, returned app identity, inherited/managed policy,
  supported versions, and whether required app prompts are emitted, displayed
  and answerable through the SDK/host path.
- With explicit user authorization, test native app approval to separate app
  policy from reviewer guidance. Do not incidentally change persistent permissions.
- Establish a repeatable failure/pass signal before choosing a fix. Current
  evidence is historical trace inspection, not controlled live reproduction.
- Publish focused implementation work if support is possible; otherwise document
  the native approval prerequisite and expose an actionable limitation rather
  than implying Continue grants app access.
- Preserve managed restrictions and distinguish app grants from genuine
  Auto-review denials. No blanket approvals, indirect control or policy bypass.

## Relevant boundaries

`src/application/internal/activation-resolution-module.ts`,
`src/application/internal/automation-coordinator.ts`,
`src/application/activation-prompt.ts`, `src/runtime/codex-agent-runtime.ts` and
`src/runtime/codex-reviewer-allowances.ts`.

## Comments

- 2026-10-05: Claimed for read-only historical evidence, installed SDK/CLI and
  official documentation investigation. No live reproduction or app permission
  changes are authorized; outstanding live checks will be tracked separately.

- 2026-10-05: Created from read-only incident and source inspection. No desktop
  actions, policy changes or production retries were performed.

## Answer

The installed TypeScript Codex SDK 0.160.0 uses non-interactive `codex exec` and
provides no public native app-approval request/response interface. Continue text
reached the resumed thread, but cannot itself grant native app access. Reviewer
allowances were active; the editor-text Auto-review rejection was a separate
decision from the app activation refusals.

Primary evidence, exact trace locations, supported recovery guidance and limits
are in [incident findings](../evidence/01-incident-findings.md) and
[SDK/documentation findings](../evidence/01-sdk-docs.md). The conclusion is scoped
to this installed TypeScript SDK path, not all SDKs. Current persistent-grant
documentation differs from the installed CLI schema, and app-server migration
has not been demonstrated to solve native Windows app approval.

The supported native desktop host's actual Allow/Always allow flow is the
documented grant route; effective policy and inheritance must be verified before
claiming recovery for a framework run. No live reproduction, native app grants,
production retry, permission edits or implementation were performed. The original
live comparison criteria remain unfulfilled and are explicitly deferred under
the user's narrower investigation scope.

2026-10-05 follow-up: The user requested immediate follow-through in this chat
instead of additional tickets. Reopened this ticket; removed the two agent-created
follow-through tickets. Continue toward a supported, demonstrable solution here.

### Verified recovery after follow-through

The supported operational fix is to acquire a **saved native app grant** through
the desktop host's actual **Always allow** prompt for each required app, then
Continue the framework run. A temporary grant in another chat is insufficient
evidence of access for a separate SDK thread. Reviewer text cannot replace it.

Live tests reproduced the app refusal for Calculator through SDK0.160.0 after
temporary native approval. After the user chose Always allow for Paint, two
fresh SDK Paint activations passed, including one with parent-chat routing
identifiers removed while preserving all permission/sandbox settings. The SDK
can therefore use a saved native grant without implementing an interactive
approval broker or migrating runtime. Verified scope is Paint and this SDK
transport; original production apps remain untested.

The earlier sandbox-startup failures were a separate diagnostic artifact:
the sandbox could not update ACLs on the sandbox-owned disposable probe folder.
The existing user-owned repository root made the test reach actual app access
without changing ACLs or disabling the sandbox. The diagnostic now defaults to
that existing root.

[Computer Use setup](../../../docs/computer-use-setup.md) documents the tested
recovery and revocation route. [Evidence](../evidence/01-incident-findings.md)
records the differential results, exact traces and remaining limits. No
additional tickets, production retries, source-runtime changes or automated
permission edits were made. The user explicitly chose the persistent Paint grant.
