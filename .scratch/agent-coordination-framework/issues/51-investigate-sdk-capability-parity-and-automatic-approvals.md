# 51 — Investigate SDK Capability Parity and Automatic Approvals

**Type:** research

**What to decide:** Determine the smallest supported Codex SDK configuration
and framework recovery flow that lets framework-launched agents perform the
same practical software-development work as local Codex app agents, including
automatically reviewed escalation for linked-worktree Git operations, without
vendor patches or an unnecessary App Server migration.

**Blocked by:** None

**Status:** ready-for-agent

## Goal

The framework should launch capable Codex threads through the supported SDK.
The user does not require those SDK-created sessions to appear as first-class
tasks in the Codex app, does not require parity with arbitrary user MCP
servers, and does not require app-only media or document tooling. Repository
skills already available to Codex remain ordinary project files and need no
special framework integration.

## Proven baseline

- An SDK thread using the attempted issue-49 permission profile successfully
  used Codex first-party web search even though direct command networking was
  disabled. Shell network policy and Codex web search are separate controls.
- An SDK thread inherited and successfully called an existing configured MCP
  server while the framework continued to add its required coordination MCP
  server. User-MCP parity is nevertheless not a product requirement.
- SDK-created sessions are stored in the normal Codex session store and can be
  read by the Codex app by ID. Sidebar visibility and project association are
  not requirements.
- In a disposable native-Windows linked worktree, `approval_policy =
  "on-request"` with `approvals_reviewer = "auto_review"` approved an escalated
  Git metadata update and let the agent switch to its requested branch.
- A custom permission profile plus the TypeScript SDK's
  `additionalDirectories` did not directly make the linked worktree's shared
  Git metadata writable.

## Investigation

- Establish a repeatable capability matrix for the product-relevant surfaces:
  repository reads and edits, indexed and optionally live web search, the
  required coordination MCP server, repository-local skills, test execution,
  and linked-worktree Git status, branch, stage, and commit operations.
- Test the current SDK with the user's ordinary sandbox configuration plus
  `approval_policy = "on-request"` and `approvals_reviewer = "auto_review"`.
  Determine which settings must be supplied by the framework and which should
  remain inherited.
- Extend the real linked-worktree proof to status, branch creation or switch,
  file editing, staging, and committing. Capture initial sandbox denial,
  approval-review evidence, retry behavior, and final Git state.
- Determine how an automatically denied, timed-out, or unsupported approval
  becomes the existing permission-block recovery state, and how an explicit
  user continuation supplies enough authorization for a later retry.
- Decide whether the extra internal denial-and-retry is acceptable for a
  frictionless user experience. Require direct Git-common-directory write
  authority only if that retry is operationally unreliable or materially
  harmful.
- Keep independent repository clones as a fallback workspace design and test
  them only if supported SDK approval behavior cannot make linked worktrees
  reliable.
- Identify any product-relevant Codex capability still missing after these
  proofs. Do not expand the matrix to tools the framework's agents do not need.

## Decision constraints

- Prefer the published Codex SDK while it supplies the required behavior.
- Do not restore a vendor patch or depend on private Codex implementation
  details.
- Do not migrate to App Server merely for web search, MCP access, or automatic
  approval review; those capabilities are already available through the SDK.
- App Server remains a candidate only if a required human-interactive approval
  or thread-lifecycle capability cannot be expressed through the SDK and the
  existing permission-block continuation flow.
- Do not require SDK-created sessions to appear in the Codex app sidebar.

## Expected result

Record the tested capability matrix and choose one supported runtime policy.
If the SDK is sufficient, refine this issue or create a focused implementation
ticket for that policy and its recovery UI. If it is not sufficient, document
the exact missing supported surface before proposing App Server or cloned task
repositories.
