# Computer Use in framework-launched agents

Framework agents can use the Computer Use skill after the native desktop host
has saved approval for the required app. Set up that approval before dispatching
desktop validation, or before continuing an app-access-blocked activation.

## Set up required apps

1. Use the same Windows user and Codex home as the framework launcher. Install
   the Computer Use plugin in the Codex desktop app.
2. In a desktop-hosted Codex chat, request a narrow, harmless Computer Use action
   in each app the project needs, such as activating the app's existing window.
3. Review the actual native app prompt and choose **Always allow** for each app
   you want framework agents to use across their separate SDK threads. This is a
   persistent app grant; the user owns the decision. A temporary **Allow** decision
   in another chat should not be treated as an SDK grant.
4. Resume the framework activation with **Continue** and describe the saved native
   app approval. Continue supplies context and resumes work; it does not create
   the grant. No framework restart was needed in the verified SDK test.

Revoke saved access through **Settings → Computer Use → Always allow**. Keep
grants limited to the required apps. App grants do not override managed policy
or approve every action the agent might take in an app. Process allowances and
`--additional-allowances` separately guide Auto-review within existing policy.

The [official Computer Use guide](https://learn.chatgpt.com/docs/computer-use)
documents native Allow/Always allow and revocation. Native app prompts are
separate from [Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review).

## Verified behavior and version limits

On Windows with the repository's TypeScript Codex SDK/CLI0.160.0:

- A Calculator temporary native approval permitted direct-host activation;
  a separate SDK thread still returned `Computer Use was not approved to use
  Rechner`.
- After the user selected **Always allow** for Paint in the native prompt,
  direct-host activation and two fresh SDK Paint activations succeeded. The
  second SDK thread removed parent-chat routing identifiers while retaining
  every inherited permission/sandbox variable.

This verifies a saved-grant recovery route for Paint through the SDK transport.
It does not prove every app is permitted by its effective policy, nor does it
replace app-specific validation. The original Balatro production activation was
not retried. Framework skills in general do not all share this native app gate.

Use the desktop prompt/settings route for this installed version. Do not apply
the current documentation's `computer_use.windows.always_allowed_app_ids` TOML
recipe to CLI0.160.0: its strict parser rejects that field. The platform `aumids`
and signed-executable policy entries are access-policy rules, not substitute
app grants. No upgrade or app-server migration was needed for the successful
saved-grant SDK test; the SDK still lacks an interactive native approval-response
interface.

## Distinguish other failures

- `helper_unknown_error: setup refresh had errors` occurs before app access.
  Inspect the Codex sandbox log for the specific failure. In the investigation,
  a sandbox-owned disposable directory prevented Windows ACL setup; using the
  existing user-owned repository root made the probe reach app access without
  changing ACLs or disabling the sandbox.
- `Computer Use helper already has an active request` means requests overlapped.
  Run desktop probes one at a time.
- A user-input guard requires a fresh state observation through the supported
  Computer Use API. It is not evidence that an app grant was denied.
- A specific Auto-review rejection needs its own scoped recovery. A saved app
  grant does not override a denial about private editor contents or another
  proposed action.

[Investigation evidence](../.scratch/computer-use-and-project-allowances/evidence/01-incident-findings.md)
records the exact trace locations and limits. The bounded
[SDK probe](../.scratch/computer-use-and-project-allowances/evidence/probe-sdk-computer-use.mjs)
can test activation of an already running Calculator, or Paint with `--paint`.
It loads normal native configuration and restricts its agent to that activation.
