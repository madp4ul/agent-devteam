# Ticket 01 — SDK, CLI and official documentation evidence

Investigated 2026-10-05. No agent run, desktop action, permission change or live
recovery test. This establishes transport contracts, not historical host policy.

## Installed TypeScript SDK 0.160.0

`node_modules/@openai/codex-sdk/package.json:3` identifies version `0.160.0`.
Source references below are relative to this repository.

| Source | Evidence |
| --- | --- |
| `node_modules/@openai/codex-sdk/dist/index.js:177` | Starts `exec --experimental-json`, not app-server. |
| Same file, lines 263–274 | Spawns CLI, writes prompt to stdin, then closes stdin. No ongoing JSON-RPC response transport. |
| Same file, lines 79–91 | Parses stdout JSONL and yields objects without an unknown-event filter; this does not establish an approval contract. |
| `node_modules/@openai/codex-sdk/dist/index.d.ts:167` | ThreadEvent includes lifecycle/error events, no approval request. |
| Same declarations, lines 169–174, 200–212 | Turn options: output schema and cancellation. Public thread operations: run/runStreamed. No approval callback or response operation. |
| Same declarations, lines 242–258 | approvalPolicy selects CLI policy, not an approval response or native app grant. |
| Same implementation, lines 58–76 | Input becomes a prompt passed to exec. Continue cannot answer a native app request through this contract. |

The user's recollection is verified narrowly: this installed TypeScript SDK has
no public native app-approval request/response contract. Do not generalize to
all SDKs, versions or possible host side channels.

## Official documentation

The [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk), opened
2026-10-05 (body lines 924, 930, 952–969), directs coding automation to the SDK
and approval-aware custom clients to app-server. It documents TypeScript prompt
continuation/resumption. The current Python SDK uses app-server JSON-RPC, so
“the Codex SDK cannot surface approvals” conflates distinct implementations.

The [app-server documentation](https://learn.chatgpt.com/docs/app-server)
(body lines 980–983, 1992–2048) describes server requests for command/file
approvals, network/filesystem permissions, MCP elicitation, dynamic tool calls
and connector approvals. “Apps” in its MCP section means connectors. This does
not document a native Windows app-grant operation. An app-server migration may
enable supported approval flows; this source does not establish it as the fix
for the native refusal. Schemas should be generated from the exact CLI version.

## Offline installed CLI contract

PATH resolves to
`C:/Users/Paul/AppData/Local/OpenAI/Codex/bin/8aaf1547b825b104/codex.exe`;
`codex --version` returns `codex-cli 0.160.0`. Only help/version and offline
`codex app-server generate-ts --experimental --out <temporary-directory>`
were run. PATH-alias warnings about a missing home directory were emitted;
generation completed. Temporary output:
`C:/Users/Paul/AppData/Local/Temp/agent-devteam-ticket01-app-server-0160`.

The SDK's bundled binary is
`node_modules/.pnpm/@openai+codex@0.160.0-win32-x64/node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/bin/codex.exe`.
Binary SHA256 differs: PATH
`37762753B554982EEF1C109303D1BE652B6397F1479E844794353A85650199C6`,
bundled `FDDA5FA3CF3FB3D000B876720742857676293E4315E4B045FAE6F8BD7E866D1D`.
Offline experimental schema generation was repeated with the bundled binary
in a separate temporary directory. All six contract files cited below are
byte-identical between the two generated outputs. Same version string does
not imply identical executable contents; the relevant contract agrees.

- `ServerRequest.ts:20` lists command/file approvals, user input, MCP
  elicitation, permission approval, dynamic tool call, auth refresh,
  attestation, clock, and legacy command/file approvals. No dedicated native
  app-approval method exists, even including experimental fields. Generic
  tool/user-input/elicitation routes neither prove native app support nor rule
  out a host side channel.
- `v2/PermissionsRequestApprovalParams.ts:7–11` carries RequestPermissionProfile;
  `v2/RequestPermissionProfile.ts:7` contains only network/filesystem fields.
- `v2/ComputerUseConfig.ts:8` contains default_app_access, macos and windows.
  `v2/ComputerUseWindowsConfig.ts:7` contains aumids/exes;
  `v2/ComputerUseWindowsExeConfig.ts:6` contains publisher/product/binary names
  and access. `v2/ComputerUseRequirements.ts:8` exposes managed restrictions
  including persistent approval and default app access. Policy shapes do not
  establish an approval-response channel.

## Native app approval boundary and recovery

[Auto-review documentation](https://learn.chatgpt.com/docs/sandboxing/auto-review)
(body lines 920–937) distinguishes reviewer routing from permission grants.
Computer Use app prompts still go directly to the user. Reviewer guidance and
native app access therefore require separate treatment.

[Computer Use documentation](https://learn.chatgpt.com/docs/computer-use)
(body lines 1027–1043) describes user Allow/Always allow prompts and revocation
through desktop Settings. Current Windows docs name
computer_use.windows.always_allowed_app_ids for persistent decisions, using
reported app IDs, separately from administrator restrictions. **Version limit:**
that field is absent from 0.160.0's typed Windows configuration above. A later
read-only strict-load check with the bundled CLI and
`-c computer_use.windows.always_allowed_app_ids=[]` returned exit1 and
`Error: unknown configuration field computer_use.windows.always_allowed_app_ids
in -c/--config override` (the field was backtick-quoted in stderr). The empty
list granted nothing and no config file was written. This now confirms that
the current saved-app recipe is rejected by the installed CLI's strict parser,
not merely missing from its generated schema. No non-strict effective grant
behavior has been established.

Supported direction, untested here: obtain the actual app grant through a
supported desktop host's user prompt/settings, respecting installed-version
behavior and managed restrictions; verify the grant before framework retry.
If the host cannot expose/answer the prompt, report the runtime limitation
instead of asking for another conversational Continue or widening reviewer
allowances. An isolated, separately authorized test must establish app identity,
host routing, emitted request/response and grant reuse before choosing a fix.
No configuration mutation or recovery attempt was performed.
