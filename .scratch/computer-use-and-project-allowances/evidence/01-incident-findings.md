# Computer Use app approval investigation — 2026-10-05

## Finding and confidence

The user's recollection is correct for the framework's **installed TypeScript
Codex SDK 0.160.0 / `codex exec` transport**: it has no public native-app
approval request event, approval callback, or response method. The framework
cannot turn Continue text into a native app grant through that interface.
This is a verified integration limitation, not proof that every Codex SDK or
every host transport lacks app approvals. Nor does it prove the exact internal
reason that Sky rejected this incident's calls.

Official [SDK documentation](https://learn.chatgpt.com/docs/codex-sdk) directs
custom approval clients toward app-server. Its Python SDK uses app-server;
that is a different interface from this repository's TypeScript dependency.
The installed app-server schema and its limits are recorded in
[SDK and documentation evidence](01-sdk-docs.md). A migration is not yet a
demonstrated fix for Windows native app grants.

## Read-only incident evidence

Primary rollout: `C:/Users/Paul/.codex/sessions/2026/10/05/rollout-2026-10-05T20-13-36-01a10d45-6f05-7242-b188-daf4675eb6b7.jsonl`.
Line numbers are one-based; UTC timestamps retain the trace's clock. Only
selected metadata and short error phrases are retained here, not transcripts.

| Evidence | Rollout location | Observation |
| --- | --- | --- |
| Runtime identity | line 1 | `cli_version: 0.160.0`, `originator: codex_sdk_ts`, `source: exec` |
| Returned window identities | line 125 | VS Code window `67400`, app `Microsoft.VisualStudioCode`; Firefox window `590454`, app `308046B0AF4A39CB`; Balatro window `6096836`, app identified by its executable path |
| Initial native refusals | lines 130, 137, 144 | Tool results reject VS Code activation, Firefox activation and Balatro inspection respectively |
| First Continue arrives | line 521, 18:41:24.940 | User prompt includes `i allow it` |
| Activation still rejected | call line 538; output 541, 18:42:04.383 | VS Code app-access refusal |
| Named-app authorization arrives | line 570, 18:43:37.581 | User prompt includes `i allow computer use for vs code, firefox and balatro` |
| Activation still rejected | call 580; output 583, 18:44:16.287 | `Computer Use was not approved to use Visual Studio Code` |
| Broad authorization arrives | line 614, 18:48:12.997 | User prompt includes `i allow any sky tool use` |
| Separate review rejection | output 630, 18:49:07.330 | Reviewer objects to editor text potentially disclosing unrelated private `process.yaml` contents |
| Activation alone still rejected | call 657; output 660, 18:50:02.693 | Same native VS Code refusal after `sky.activate_window({window:otherWindow})` |

All activation calls above use `sky.activate_window`; documentation or agent
commentary must not rename that API. Display labels and returned app identities
are different facts: do not guess a persistent grant key from the error label.

The coordination database was opened using Node `DatabaseSync` with
`{readOnly:true}` at
`D:/Daten/Projekte/Software/CSharp/agent-devteam-balatro-videos-agent-coordination-state/coordination.sqlite3`.
A targeted query on activation `8f2cc722-8b2b-448a-b84f-c21f2d6f3370`
confirmed task T-0005 and four permission-failed attempts on the same thread:

| Attempt | Started UTC | Reviewer allowance delivery |
| --- | --- | --- |
| `c4842623-ef15-46a8-8680-e847e83f5b6d` | 18:13:36.144 | active |
| `5564405f-b957-4f12-a94b-a65b1d769e90` | 18:41:22.792 | active |
| `cbbac276-93d3-4412-ac9b-fd73a1813442` | 18:43:35.722 | active |
| `b35c4899-ff71-469d-a359-3f0b814a6b56` | 18:48:11.076 | active |

These are allowance-delivery statuses, not app grants or proof of reviewer
approval for every requested action. The activation was still permission-failed
when inspected. No database mutation or production retry was performed.

## Framework transport evidence

Installed primary sources, relative to the repository root:

- `node_modules/@openai/codex-sdk/package.json`: version 0.160.0 and pinned
  dependency `@openai/codex: 0.160.0`.
- `node_modules/@openai/codex-sdk/dist/index.d.ts:167`: `ThreadEvent` is
  thread/turn/item lifecycle plus errors, without an approval request variant;
  `Thread` public methods at lines 200–212 are run and runStreamed.
- `node_modules/@openai/codex-sdk/dist/index.js:177`: launches
  `exec --experimental-json`; lines 263–274 spawn the child, write prompt stdin,
  then close stdin. Lines 296–298 yield stdout lines. Configuration options
  configure approval policy; they do not implement an approval response loop.
- `src/runtime/codex-agent-runtime.ts:140`: starts/resumes a thread; line 157
  sends `codexInput(effectiveRequest)` through runStreamed. `codexInput` composes
  activation text and optional images; it does not send a native grant.
- `src/application/internal/activation-resolution-module.ts:197`: Continue
  requires a message and passes it to recovery; line 333 stores
  `continuation_message`. `src/application/activation-prompt.ts:26` composes
  continuation text. The rollout independently verifies delivery.
- SDK-resolved native executable:
  `node_modules/.pnpm/@openai+codex@0.160.0-win32-x64/node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/bin/codex.exe`.
  Its offline `--version` returned `codex-cli 0.160.0`; `exec --help` identifies
  exec as non-interactive. PATH also resolves CLI 0.160.0, but SDK resolution
  follows its package dependency rather than selecting PATH by assumption.

Node was v24.18.1. No model run was needed to establish these contracts.

## App grants, reviewer decisions and recovery

[Computer Use docs](https://learn.chatgpt.com/docs/computer-use) describe native
Allow/Always allow prompts in the desktop app, saved Windows app decisions in
Codex configuration, and separate administrator restrictions. A grant must match
the app identity and effective host policy. A saved local choice cannot defeat a
managed restriction. Current documentation's persistent configuration syntax
is not automatically a compatible recipe for CLI 0.160.0; see the schema evidence.

[Auto-review docs](https://learn.chatgpt.com/docs/sandboxing/auto-review) describe
a reviewer for eligible approval requests and explicitly keep native Computer
Use app prompts with the user. The 18:49 editor-text denial and the native
activation refusal therefore need different recovery. Broader reviewer guidance
may clarify authorized action scope; it cannot grant app access or override a
specific rejection without new authorized evidence.

Supported operational route: a user performs a scoped Computer Use task through
the supported desktop host, answers its actual app prompt, and chooses a saved
grant only if desired. After verifying host identity, policy compatibility and
actual grant effectiveness, a separately authorized harmless-target check can
test whether the framework inherits that grant. If no native prompt appears,
report an unavailable approval route and keep desktop validation blocked or use
an explicitly accepted manual validation handoff. Repeating Continue is not a
repair. This investigation does not claim a pre-grant will make SDK runs work.

The framework should explain that Continue resumes agent work after an external
permission prerequisite has been addressed. It should not describe conversational
consent, process allowances, launch-time reviewer text or active reviewer delivery
as native app approval. These implications generalize across processes/projects.

## Evidence limits and next work

A narrow present-day read of `C:/Users/Paul/.codex/config.toml` found no explicit
`computer_use` table or feature assignment. User and ProgramData requirements
files at the inspected conventional paths were absent. This is not an effective
policy dump, historical snapshot, or proof that policy permits access: remote or
managed sources, other config locations, inherited environment, legacy decisions,
and plugin-host state were not exhaustively reconstructed.

No direct-host versus framework controlled comparison was authorized. There is
no captured native prompt request/response pair, no successful app grant test,
and no verified version-specific native grant response API. App enumeration
alone proves neither grant effectiveness nor approval availability. The trace
shows tool refusals, not whether a hidden host emitted a prompt that was lost.
Host routing, identity mapping, effective policy and runtime support remain
possible contributing causes; none is established as the unique root cause.

- Explain native app approval prerequisites and validate native app approval
  transport as immediate follow-through in ticket01, per the user's request.

The initial read-only findings are complete. Ticket01 was reopened on the user's
request to continue toward a solution without publishing more tickets.

## Immediate follow-through — 2026-10-05

The user asked to perform follow-through in this chat rather than publish more
tickets. The agent-created tickets03/04 were deleted and their work folded into
ticket01. Other chats' ticket02 implementation files remain independently owned.

### Direct native-host probe

Initialized the supported `@oai/sky` through `node_repl`. No Calculator/Paint app
was returned by the initial harmless-target filter. Called
`sky.launch_app({app:"C:\\Windows\\System32\\calc.exe"})` through the supported
API. The user confirmed that the native Calculator prompt appeared and that
they allowed it. `sky.list_windows()` subsequently returned exactly one target:
`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`, title `Rechner`, window264950.
Rehydrated that returned identity with `sky.get_window` and activated it with
`sky.activate_window`; the actual tool call succeeded and emitted
`DIRECT_HOST_CALCULATOR_ACTIVATION_PASS`. No Calculator input or content capture
was performed. This proves a working native prompt and grant in the direct host,
not a saved cross-thread grant or successful SDK inheritance.

### SDK diagnostic and prerequisite failure

[probe-sdk-computer-use.mjs](probe-sdk-computer-use.mjs) runs a bounded SDK
thread in a disposable directory under this evidence folder. It loads ordinary
native configuration and Auto-review, selects only Calculator, attempts only
activation, and prints a verdict. It neither dispatches a production coordination
activation nor writes an app grant. Optional binary override permits comparison
of the SDK-bundled and desktop-distributed CLI. The routing-isolation option
retains every inherited security/permission/sandbox variable.

Initial execution inside the current shell first failed to locate Codex home;
after explicitly supplying the existing user's Codex home it was blocked from
creating Codex state files. An approved host-side execution then started a
thread, but both shell and node tools failed Windows sandbox initialization.

| Variant | Thread | Verdict |
| --- | --- | --- |
| Bundled CLI, inherited environment | `01a10d88-c6d2-7053-9ce4-3ca03a0e8252` | `SDK_PROBE_UNAVAILABLE` |
| Desktop-distributed CLI, otherwise same probe | `01a10d8a-57f9-76b0-9783-b7c8a42532e3` | `SDK_PROBE_UNAVAILABLE` |
| Bundled CLI, parent-chat routing identifiers removed, all permission/sandbox variables retained | `01a10d8c-4a04-7310-8f86-e0eb699c9826` | `SDK_PROBE_UNAVAILABLE` |

All three failed before desktop actions with
`windows sandbox failed: helper_unknown_error: setup refresh had errors`.
The first thread's local rollout, at
`C:/Users/Paul/.codex/sessions/2026/10/05/rollout-2026-10-05T21-27-10-01a10d88-c6d2-7053-9ce4-3ca03a0e8252.jsonl`,
line16 records a shell initialization error and line27 records node-kernel
initialization failure. This is not the historical native-app refusal. Changing
the binary and only chat-routing identifiers did not make that prerequisite pass.

Automatic approval review rejected a proposed broader environment cleanup that
removed permission/sandbox variables, reasoning that this could bypass the active
boundary. It did not run. That mode was removed from the diagnostic; the accepted
routing-only variant preserved the security variables and still failed. No sandbox
disable, helper-protocol client or indirect UI workaround was used.

The user was asked to run the same bounded diagnostic in the ordinary PowerShell
environment used to launch the framework and provide its final line. This is
needed to obtain a pass/fail signal at the actual app-access boundary without
weakening this chat's sandbox. A correct regression seam or framework patch
cannot yet be selected from these unavailable probes.

### Additional verified compatibility facts

The framework's existing read-only native configuration inspector completed with
CLI0.160.0 and the repository working directory. Its projected `computer_use`,
`default_permissions` and `sandbox_mode` fields were null. This is present-day
configuration evidence at that directory; it does not reconstruct production
or direct-host session policy.

An independent strict-load probe with an **empty** saved-app list returned
`Error: unknown configuration field computer_use.windows.always_allowed_app_ids
in -c/--config override`. Thus the installed CLI rejects the current docs' field
under strict parsing. Platform app-policy allow entries (`aumids`/signed executable
rules) only let normal approval checks proceed; they are not replacement grants.
See the [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

No native permission configuration was changed. The outstanding solution must
establish either a compatible saved native-grant route or a supported answerable
approval transport; neither is proven by current source/schema evidence. Simply
adding reviewer guidance, swapping binary builds of the same version, or claiming
generic app-server approvals cover native app access is not a demonstrated fix.

## Recovery verified — 2026-10-05

### Remove the probe's unrelated ACL failure

The user ran the provided diagnostic from normal PowerShell. Thread
`01a10d8f-7f55-79c3-acca-82df1ce1f856` also returned SDK_PROBE_UNAVAILABLE.
Its rollout at
`C:/Users/Paul/.codex/sessions/2026/10/05/rollout-2026-10-05T21-34-30-01a10d8f-7f55-79c3-acca-82df1ce1f856.jsonl`
records shell initialization failure at line16 and node-kernel failure at line27.
That disproves attributing this prerequisite failure only to nested execution.

The exact cause was in
`C:/Users/Paul/.codex/.sandbox/sandbox.2026-10-05.log:2814`:
`write ACE grant failed` on the disposable `probe-workspace`, with
`open ACL target for update`. Lines2817–2819 connect that failure to
`setup refresh had errors`. Read-only Get-Acl showed that directory's owner
was `DESKTOP-TDGHSTK\CodexSandboxOffline`, while the existing repository root
was owned by `DESKTOP-TDGHSTK\Paul`. Other workspace setup refreshes in the log
completed without errors. No ACL/ownership repair was performed.

Using the existing repository root with the same bounded activation-only prompt
made the SDK reach actual app access. The diagnostic now defaults to that root,
instead of creating a sandbox-owned directory. It still forbids source writes,
coordination mutations and other desktop actions. This corrects the diagnostic,
not an established production-framework workspace defect.

### Native saved-grant comparison

| Probe | Native approval | SDK activation result |
| --- | --- | --- |
| Calculator, thread `01a10d91-16c1-7de3-bbb6-3cab9c808574` | Earlier temporary Allow in direct host | `Computer Use was not approved to use Rechner` |
| Paint, thread `01a10d94-5d92-77f0-aa51-534cb7334658` | User explicitly chose Always allow in native Paint prompt | `SDK_PAINT_ACTIVATION_PASS` |
| Paint, fresh thread `01a10d95-752c-7122-bdc2-339ed8e62c7b` | Same saved native grant | `SDK_PAINT_ACTIVATION_PASS` with parent-chat routing identifiers removed and all permission/sandbox variables retained |

Authoritative tool-call/output locations, under the same sessions directory:

- `rollout-2026-10-05T21-36-14-01a10d91-16c1-7de3-bbb6-3cab9c808574.jsonl`:
  activation call line38; actual refusal output line41 at19:37:05.635UTC.
- `rollout-2026-10-05T21-39-49-01a10d94-5d92-77f0-aa51-534cb7334658.jsonl`:
  activation call line35; success output line38 at19:40:25.637UTC.
- `rollout-2026-10-05T21-41-01-01a10d95-752c-7122-bdc2-339ed8e62c7b.jsonl`:
  activation call line38; success output line41 at19:41:50.294UTC.

Paint was launched using supported `sky.launch_app` for its pre-existing
Windows executable. Selection returned exactly one window, app
`Microsoft.Paint_8wekyb3d8bbwe!App`, id68532, title `Unbenannt - Paint`.
The user explicitly authorized this persistent-grant test and confirmed choosing
Always allow. Direct-host activation also succeeded. A user-input guard first
required a fresh supported state observation: a bounded screenshot of the blank
Paint canvas was observed without accessibility text, then activation succeeded.
No typing, drawing, app closing or save operation occurred.

One Calculator retry overlapped the Paint request and returned
`Computer Use helper already has an active request` in thread
`01a10d92-e226-7e20-b81f-897db3b00660`. It is excluded from the approval comparison:
requests must be serialized. All subsequent successful probes were serialized.

### Implemented recovery guidance and limits

The supported operational solution is to use the desktop host's native
**Always allow** flow for each required app, then Continue the framework
activation. A saved grant was demonstrated usable through this SDK0.160.0
transport in separate threads without implementing a grant API, changing
permission configuration by script, widening sandbox policy or migrating SDK.
The user owns persistence and can revoke saved access in native settings.

[Computer Use setup](../../../docs/computer-use-setup.md) and the start-a-process
tutorial now explain this route and separate it from Auto-review/allowance text.
No additional tickets were published. Existing staged content was preserved;
these documentation and diagnostic changes remain unstaged.

The successful target was Paint; original VS Code/Firefox/Balatro production
actions were not retried and their app-specific policies may differ. This is a
working supported recovery path, not proof that all apps or skills become
available. Internal saved-grant storage/routing was not reconstructed. The strict
CLI parser still rejects the documented TOML field; native UI approval worked
despite that configuration-schema mismatch, so no manual TOML recipe is required.
