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
directory. The selected `--task-workspaces` parent must also be writable by that
account.

If Git reports dubious ownership or worktree registration fails with Access
Denied, stop the application and reopen PowerShell as the checkout's owning
account. For a checkout intentionally owned by another account, the safest
development setup is a fresh clone owned by the account that will run the
application. Do not add `safe.directory=*` or change global Git trust to work
around the mismatch. An exact safe-directory exception bypasses only Git's
ownership check; it does not grant the `.git/worktrees` write permission the
application requires.

From the repository root, install exactly the dependency graph in
`pnpm-lock.yaml`:

```powershell
pnpm install --frozen-lockfile
```

Validate the example process, then start the development server:

```powershell
pnpm validate:example
pnpm build
pnpm start -- --process examples/software-delivery/process.yaml --project .
```

Open <http://127.0.0.1:3000>. Stop the server with `Ctrl+C`.

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
