# SDK Capability Parity and Automatic Approvals

## Question

What is the smallest supported TypeScript Codex SDK configuration that keeps
the user's normal Codex capabilities while allowing framework-launched agents
to complete ordinary repository work, including Git operations in linked
worktrees, through automatic approval review? What approval behavior can the
framework observe and control without moving to App Server?

## Sources and version boundary

The repository currently resolves `@openai/codex-sdk` and its bundled Codex CLI
to **0.146.0** ([package manifest](../../../package.json),
[lockfile](../../../pnpm-lock.yaml)). I inspected that installed package's
published declarations, README, and compiled `exec` wrapper, then checked the
current official Codex documentation and the official `openai/codex` source.
The installed package remains the authority for what this repository can call;
the current docs identify supported configuration behavior and one small
forward difference noted under web search.

## Recommendation

Keep the TypeScript SDK. Let normal user, profile, trusted-project, and system
configuration load, and add only the framework-owned coordination MCP server
plus these explicit runtime values:

```ts
const codex = new Codex({
  env: definedProcessEnvironment(),
  config: {
    approval_policy: "on-request",
    approvals_reviewer: "auto_review",
    shell_environment_policy: { /* existing framework Git safe.directory */ },
    mcp_servers: {
      coordination: {
        command,
        args,
        required: true,
        default_tools_approval_mode: "approve",
      },
    },
  },
});

const thread = codex.startThread({
  workingDirectory,
  // model and reasoning effort only when selected by the agent definition
});
```

Do **not** set `sandboxMode`, `webSearchMode`, `networkAccessEnabled`, or
`additionalDirectories` by default. Omitting them preserves the user's
effective configuration. Do not add the linked worktree's Git common directory
as a writable root: Git metadata is intentionally protected, and the supported
route for a needed metadata update is an `on-request` sandbox escalation that
Auto-review evaluates.

This configuration is enough for the product requirement. App Server is only
needed if the framework itself must receive, display, or answer individual
approval requests or expose the richer approval-review lifecycle.

## Findings

### Configuration is inherited unless the SDK supplies a higher-precedence override

Codex loads configuration in this order: CLI flags and `--config` overrides,
then trusted project config (closest file wins), selected profile, user config,
system config, and defaults. Therefore an SDK run still receives ordinary
ambient Codex configuration; each SDK-supplied CLI/config value overrides only
the same effective key. [Official configuration precedence](https://learn.chatgpt.com/docs/config-file/config-basic#configuration-precedence)

The TypeScript SDK is a wrapper around `codex exec` that exchanges JSONL over
stdin/stdout. Its client-level `config` object is flattened into dotted
`--config key=value` arguments. Thread options are emitted afterward and take
precedence for overlapping settings. This means:

- omit `sandboxMode` to inherit the configured sandbox;
- set `approvalPolicy: "on-request"` on the thread or
  `config.approval_policy = "on-request"`; using the thread option makes that
  particular choice override a client-level value;
- set `approvals_reviewer = "auto_review"` through `CodexOptions.config`,
  because the installed TypeScript `ThreadOptions` has no dedicated reviewer
  field;
- arbitrary current Codex settings not represented by `ThreadOptions` can
  still be supplied through `CodexOptions.config`.

Sources: [official TypeScript SDK README](https://github.com/openai/codex/tree/main/sdk/typescript#passing---config-overrides),
[official SDK exec wrapper](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts),
[official thread options](https://github.com/openai/codex/blob/main/sdk/typescript/src/threadOptions.ts).

Managed requirements remain constraints rather than values the framework can
override. Current configuration supports organization allowlists for approval
policies, reviewers, sandbox modes, and web-search modes. The framework should
allow startup/configuration failure to surface rather than trying to defeat
those constraints. [Official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#requirementstoml)

### `on-request` plus `auto_review` is the supported non-human escalation path

`approval_policy = "on-request"` makes eligible boundary crossings request
approval. `approvals_reviewer = "auto_review"` routes those requests to a
separate reviewer agent instead of pausing for a person. Auto-review changes
the reviewer, not the sandbox: it does not expand writable roots, enable
network access, or weaken protected paths. It covers shell/exec escalation,
blocked network requests, writes outside writable roots, and approval-requiring
MCP/app calls. [Official Auto-review guide](https://learn.chatgpt.com/docs/sandboxing/auto-review#how-auto-review-works)

Approval permits one attempted boundary crossing; it is not a permanent
sandbox mutation. If approved, execution continues. If explicitly denied, the
main agent receives the rationale and must use a materially safer alternative
or stop and ask the user. Review build/session/parse failures fail closed;
timeouts do not run the action and are distinguished from a policy denial.
The current implementation also interrupts repeated-denial loops. [Official
denial and failure behavior](https://learn.chatgpt.com/docs/sandboxing/auto-review#denials-and-failure-behavior)

The documented explicit-override workflow for a denial is currently a TUI
surface: `/approve` selects one recent exact denied action for one retry, which
still goes through Auto-review. The TypeScript SDK exposes no equivalent API.
For this framework, continuation should therefore create a new turn whose user
prompt records explicit authorization and asks the agent to retry the exact
action; that gives the reviewer user-authorization context, but it is **not** a
guaranteed approval and remains subject to policy. If the product needs the
framework to approve a protocol-level request directly, use App Server.
[Official denial override semantics](https://learn.chatgpt.com/docs/sandboxing/auto-review#denials-and-failure-behavior)

### Linked-worktree Git metadata must remain an escalation

`workspace-write` protects `<writable_root>/.git` recursively. When `.git` is a
pointer file, as in a linked worktree, Codex also protects the resolved Git
directory. This directly explains why adding the worktree or Git common
directory as an ordinary writable root does not make branch, index, or commit
metadata writable. [Official protected-path rules](https://learn.chatgpt.com/docs/agent-approvals-security#protected-paths-in-writable-roots)

The SDK's `additionalDirectories` field is nevertheless supported: the
installed wrapper emits one `--add-dir` for each value, which becomes an
additional writable root in `workspace-write`. It is appropriate for ordinary
neighboring source/scratch directories, but it does not override `.git`
protection. [Official SDK source](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts),
[writable-roots reference](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml)

Consequently:

- reads, edits, and tests within the worktree should run inside the inherited
  workspace sandbox;
- `git status` is read-only and should normally run without escalation;
- branch creation/switch, staging, and commit update protected Git metadata and
  should request scoped escalation;
- `on-request` plus `auto_review` is the supported retry path. No custom
  permission profile or direct Git-common-directory grant is required for the
  intended design.

### Web search and shell networking are separate controls

Codex web search does not require granting spawned commands full network
access. Current Codex defaults to cached search; live search is independently
selected with `web_search = "live"`, and disabled search removes the tool.
Shell networking remains governed by sandbox/network settings. [Official
network and web-search guidance](https://learn.chatgpt.com/docs/agent-approvals-security#network-access)

The installed 0.146.0 TypeScript SDK exposes `webSearchMode` as
`"disabled" | "cached" | "live"` and emits it as the top-level `web_search`
config value. Current Codex documentation also lists a newer `"indexed"`
mode. If the framework ever needs to force indexed mode before the SDK adds it
to `ThreadOptions`, it can use `CodexOptions.config.web_search = "indexed"`;
for issue 51, omitting the setting is better because it inherits the user's
choice. [Current configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml),
[official SDK thread options](https://github.com/openai/codex/blob/main/sdk/typescript/src/threadOptions.ts).

### Adding the coordination MCP server preserves unrelated configured servers

Codex stores MCP definitions as individual `mcp_servers.<id>` tables in the
same layered config used by local clients. Both user and trusted-project MCP
servers are supported. [Official MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli#connect-codex-to-an-mcp-server)

The SDK flattens nested client config into individual dotted overrides. Thus
the framework's `mcp_servers.coordination.*` keys add or override only the
`coordination` entry; they do not replace unrelated inherited
`mcp_servers.<other-id>` entries. A same-named ambient `coordination` entry is
intentionally overridden because SDK config has CLI precedence. Sources:
[official SDK config serialization](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts),
[one-off dotted overrides](https://learn.chatgpt.com/docs/config-file/config-advanced#one-off-overrides-from-the-cli).

`required = true` makes failure to initialize the framework-owned server fail
startup, and `default_tools_approval_mode = "approve"` avoids a second MCP-tool
approval policy for its coordination calls. Those are documented MCP settings;
they do not weaken shell/filesystem sandboxing. [Official MCP options](https://learn.chatgpt.com/docs/extend/mcp?surface=cli#configure-with-configtoml)

### TypeScript SDK approval observation and control are intentionally limited

The installed TypeScript event union contains thread/turn lifecycle events and
items for messages, reasoning, commands, file changes, MCP calls, web search,
todo lists, and errors. It has no approval-request, approval-decision, or
Auto-review item, and `runStreamed()` offers no callback for answering an
approval. [Official event types](https://github.com/openai/codex/blob/main/sdk/typescript/src/events.ts)

Therefore the framework can observe the operational result—command/MCP failure,
turn failure/interruption, error text, and the agent's final response—but it
cannot depend on receiving structured reviewer rationale, risk level, timeout,
or a request identifier from the supported TypeScript SDK stream. In
particular, a turn interrupted by the Auto-review denial circuit breaker is not
a domain-specific `permission-blocked` event; recovery still depends on the
agent explicitly reporting the permission block through the coordination MCP
tool.

This is the precise remaining parity gap, but it does not block the current
product: Auto-review resolves eligible requests internally, and the existing
permission-block report plus user continuation can represent unresolved cases.
If structured approval UI/control becomes a requirement, App Server is the
documented deep-integration surface for approvals and streamed agent events,
whereas the SDK remains the recommended automation/CI surface. [Official App
Server boundary](https://learn.chatgpt.com/docs/app-server)

## Capability conclusion

### Native-Windows linked-worktree proof

On 2026-08-11, the opt-in integration probe in
[`test/integration/real-codex-linked-worktree-git.test.ts`](../../../test/integration/real-codex-linked-worktree-git.test.ts)
passed against the repository's installed SDK and CLI 0.146.0. The SDK thread
inherited its launch sandbox and received only `approvalPolicy: "on-request"`,
`approvals_reviewer: "auto_review"`, and exact process-local Git ownership
trust.

The first `git switch -c`, `git add`, and `git commit` attempts each failed at
the protected shared repository metadata. The agent then requested a scoped
escalation for the same command; the Auto-review trace allowed it; and each
retry completed. The same run created a worktree file, executed the fixture's
Node verifier successfully, committed the file on
`codex/capability-probe`, and ended with an empty `git status --short`. The
test asserts both the initial failures and successful retries, plus the final
branch, committed content, commit subject, verifier result, and clean status.
This makes the denial-and-retry observable without making production code
depend on private session records; the reviewer decision itself remains absent
from the supported SDK event union, as described above.

| Product-relevant capability | Supported path | Framework policy |
| --- | --- | --- |
| Repository read/edit | Inherited sandbox and working directory | Do not override normal sandbox defaults |
| Tests and local tools | Shell inside the inherited sandbox | Escalate only on a real boundary crossing |
| Cached/live web search | Built-in web-search tool, separate from shell network | Inherit user choice |
| Coordination MCP | Add one dotted `mcp_servers.coordination.*` override | Required; tool approval mode `approve` |
| Other user/project MCP | Ambient layered config | Preserve; no parity guarantee required |
| Repository skills/`AGENTS.md` | Ordinary project files loaded by Codex | No framework integration |
| Linked-worktree status | Read-only Git metadata access | No escalation expected |
| Branch/stage/commit | Scoped sandbox escalation over protected Git metadata | `on-request` + `auto_review` |
| Denied/timed-out escalation | Agent receives failure guidance; framework receives no typed approval event | Agent reports permission block; later user continuation retries with explicit authorization |
| Human approval protocol/UI | Not exposed by TypeScript SDK | App Server only if this becomes required |

## Decision

The supported TypeScript SDK is sufficient. The smallest policy is to preserve
ambient sandbox, web, MCP, and project configuration; add only the required
coordination MCP and Git environment override; and force
`approval_policy = "on-request"` with
`approvals_reviewer = "auto_review"`. Do not attempt to make linked-worktree
Git metadata an ordinary writable root. Treat an unresolved denied or timed-out
action as a permission block reported by the agent, and retry only in a later
user-authorized turn. App Server is not justified unless structured approval
events or direct approval controls become a product requirement.
