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

From the repository root, install exactly the dependency graph in
`pnpm-lock.yaml`:

```powershell
pnpm install --frozen-lockfile
```

Validate the example process, then start the development server:

```powershell
pnpm validate:example
pnpm start -- --process examples/software-delivery/process.yaml
```

Open <http://127.0.0.1:3000>. Stop the server with `Ctrl+C`.

Before changing code, it is useful to verify the checkout:

```powershell
pnpm typecheck
pnpm test
```

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
