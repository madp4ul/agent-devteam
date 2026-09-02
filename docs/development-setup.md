# Development setup

These instructions are for running the TypeScript application from source. The
planned end-user distribution is a self-contained host-native application, so
this toolchain is a development requirement rather than the intended product
installation experience.

## Install the prerequisites on Windows

1. Install **Node.js 24 LTS** from the
   [official Node.js download page](https://nodejs.org/en/download). Use the
   Windows installer and keep its option to add Node.js to `PATH` enabled.
2. Close and reopen PowerShell so it receives the updated `PATH`, then verify
   the installation:

   ```powershell
   node --version
   npm --version
   ```

   The Node.js version must begin with `v24` (or be a later supported major
   version).
3. Install the pnpm version pinned by this repository. The pnpm project
   recommends installation through npm or Corepack on Windows; npm gives this
   project a simple, explicit bootstrap path:

   ```powershell
   npm install --global pnpm@11.9.0
   ```

4. Open a fresh PowerShell again and verify pnpm:

   ```powershell
   pnpm --version
   ```

   It should print `11.9.0`. See the
   [official pnpm installation guide](https://pnpm.io/installation) for other
   supported installation methods.

## Install and run the application

### Verify the Windows repository identity

The application creates and registers detached Git worktrees for agent tasks.
Start it from a normal, non-elevated PowerShell running as the same Windows
account that owns the checkout. A terminal, automation process, service, or
sandbox running as another identity may be able to read the repository while
still being unable to write Git's internal `.git/worktrees` records.

Before starting the application, verify the active identity and repository:

```powershell
whoami
git status --short
(Get-Acl .git).Owner
```

`git status` must complete without a dubious-ownership error, and the current
account must have Modify permission on both the checkout and its `.git`
directory. The parent of the bound sibling project state root must also be
writable by that account.

If Git reports dubious ownership or worktree registration fails with Access
Denied, stop the application and reopen PowerShell as the checkout's owning
account. For a checkout intentionally owned by another account, the safest
development setup is a fresh clone owned by the account that will run the
application. Do not add `safe.directory=*` or change global Git trust to work
around the mismatch. An exact safe-directory exception bypasses only Git's
ownership check; it does not grant the `.git/worktrees` write permission the
application requires.

Framework-launched agents inject the exact task-workspace path through Git's
process environment as `safe.directory`. Host-side archival applies the same
exact, process-local trust only after confirming the framework-owned path and
primary-repository worktree registration. Trust ends with each Git or Codex
process; the application does not change global or repository Git
configuration. This fixes Git ownership inspection only. Writes to
linked-worktree metadata remain subject to the process's ordinary filesystem
permissions, and agent writes remain subject to the user's ordinary Codex
sandbox. Framework-launched runs request scoped escalation with
`approval_policy = "on-request"`; the separate `auto_review` reviewer may allow
or deny each request under the effective managed policy.

From the repository root, install exactly the dependency graph in
`pnpm-lock.yaml`:

```powershell
pnpm install --frozen-lockfile
```

Validate the example process, then use the preferred Windows launcher. It
repeats the Git identity check, builds the browser application, and starts the
example from the repository root:

```powershell
pnpm validate:example
.\examples\software-delivery\start.cmd
```

Open <http://127.0.0.1:3000>. Stop the server with `Ctrl+C`.

While state remains disposable during pre-release development, stop the server
and run `.\examples\software-delivery\reset-state.cmd` to remove the bound
project state root and its Git worktree registrations as one confirmed
operation. The reset does not change global Git trust.

Before changing code, it is useful to verify the checkout:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

The normal suite uses a controlled runtime and never calls a live model. To run
the opt-in real Codex SDK handoff proof after Codex authentication is available:

```powershell
$env:COORDINATION_RUN_CODEX_INTEGRATION = "1"
node --experimental-strip-types --test --test-reporter=spec test/integration/real-codex-handoff.test.ts
```

Remove the environment variable afterward with
`Remove-Item Env:COORDINATION_RUN_CODEX_INTEGRATION`.

To exercise the full linked-worktree mutation and automatic-review proof, run:

```powershell
$env:COORDINATION_RUN_CODEX_CAPABILITY_PROBE = "1"
node --experimental-strip-types --test --test-reporter=spec test/integration/real-codex-linked-worktree-git.test.ts
Remove-Item Env:COORDINATION_RUN_CODEX_CAPABILITY_PROBE
```

The probe creates a disposable native-Windows repository and linked worktree,
then requires the SDK agent to inspect status, create a branch, edit and verify
a file, stage, commit, and finish clean. It asserts that branch, stage, and
commit first encounter protected Git metadata and then succeed through scoped
Auto-reviewed retries.

## Changing the coordination schema

The ordered released-migration registry is the only executable schema source.
Never edit a released migration (including the initial migration), execute the
snapshot as an initializer, or relax verification to make an upgrade pass.

1. Add a migration with a new immutable ID to
   `src/application/internal/migrations/registry.ts`. Establish behavior at the
   application-startup seam using a real retained database and independently
   inspect its recovery backup. Include a direct and a skipped upgrade when
   applicable, plus the invariant behavior the schema change is intended to
   preserve or introduce.
2. Run `pnpm generate:schema-snapshot` explicitly. This executes the registry in
   memory and replaces `src/application/internal/migrations/current-schema.sql`
   with generated review evidence. It does not inspect or modify retained
   project state. Normal startup and tests never regenerate this file.
3. Review the generated diff independently of the migration implementation and
   against requirements/behavior tests. Every disappearing index, constraint,
   trigger, or view condition needs justification; do not simply accept the
   output because it was generated. The snapshot detects unreviewed omissions,
   but blindly regenerating and accepting one would bless the same mistake.
4. Run `node --experimental-strip-types --test test/application/released-schema-migrations.test.ts test/application/restart-recovery.test.ts`,
   then typechecking and the complete non-browser suite. Leave migration,
   snapshot, tests, and any contract documentation together for user review.

Startup requires this checked-in SQL artifact beside the migration registry,
including when packaging/distributing the host. It is read lazily as read-only
expectations, never executed. Missing or differing objects/definitions block
startup before migrations commit or application recovery/dispatch begins, with
a recovery-backup path when an upgrade was attempted. Current stores are also
verified on restart. Comparison ignores layout, comments, keyword case, and
simple object/table-name quoting introduced by SQLite; literals and expression
tokens remain significant. Semantically equivalent but differently expressed
constraints are intentionally not automatically accepted. Synthetic future-chain
tests supply explicitly authored expectations, never expectations produced by
executing the same tested migration chain.

## Troubleshooting

### `pnpm` is not recognized

First close and reopen PowerShell. Then inspect what the shell can see:

```powershell
Get-Command node, npm, pnpm
```

If `node` or `npm` is missing, reinstall Node.js and keep the installer's
`PATH` option enabled. If only `pnpm` is missing, repeat the global pnpm install
command above and open another fresh PowerShell.

Codex may run project commands with a pnpm executable from a private bundled
runtime under its cache directory. That runtime is an implementation detail of
Codex: do not add it to your user `PATH` or treat it as the project's installed
toolchain.

### PowerShell blocks `pnpm.ps1`

If pnpm is installed but PowerShell reports that script execution is disabled,
invoke the generated command shim explicitly:

```powershell
pnpm.cmd --version
pnpm.cmd install --frozen-lockfile
```

This avoids requiring a machine-wide execution-policy change.
