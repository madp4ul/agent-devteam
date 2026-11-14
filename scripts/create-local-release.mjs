import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, realpath, stat, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = ['src', 'web', 'schemas', 'examples', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts'];

/** Capture a complete local installation; publication is deliberately separate. */
export async function createLocalRelease({ root, source = checkout, id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8), provenance }) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Local releases require installed Node.js 24 or later.');
  if (!root) throw new Error('A release root is required.');
  if (provenance && (provenance.sourceKind !== 'committed-release' || !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(provenance.sourceTag ?? '') || !/^[a-f0-9]{40}$/.test(provenance.sourceRevision ?? '') || provenance.sourceTag !== id)) throw new Error('Committed release provenance requires its version tag and exact source revision.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(id)) throw new Error('Release ID must be a simple unique directory name.');
  source = resolve(source); root = resolve(root);
  const fromSource = relative(source, root);
  if (!isAbsolute(fromSource) && fromSource !== '..' && !fromSource.startsWith('..\\') && !fromSource.startsWith('../')) throw new Error('Release root must be outside the source checkout.');
  const directory = join(root, 'releases', id);
  await mkdir(dirname(directory), { recursive: true });
  try { await mkdir(directory); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Release ${id} already exists; choose a new ID.`);
    throw error;
  }
  const before = await hashInputs(source);
  for (const name of inputs) {
    try { await cp(join(source, name), join(directory, name), { recursive: true, dereference: true, force: false, errorOnExist: true }); }
    catch (error) { if (error.code !== 'ENOENT' || name !== 'examples') throw error; }
  }
  if (before !== await hashInputs(source) || before !== await hashInputs(directory)) throw new Error('Source changed while capturing the release; candidate was not completed.');
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const dependencySource = await findDependencySource(source);
  const lockText = await readFile(join(directory, 'pnpm-lock.yaml'), 'utf8');
  const installedLock = await readFile(join(dependencySource, 'node_modules/.pnpm/lock.yaml'), 'utf8');
  if (lockText.replace(/\r\n/g, '\n') !== installedLock.replace(/\r\n/g, '\n')) throw new Error('Installed dependencies do not match the captured lockfile; run pnpm install --frozen-lockfile.');
  const installedRequire = createRequire(join(dependencySource, 'package.json'));
  const locked = installedRequire('yaml').parse(lockText).importers['.'];
  for (const kind of ['dependencies', 'devDependencies']) {
    for (const [name, specifier] of Object.entries(manifest[kind] ?? {})) {
      if (locked[kind]?.[name]?.specifier !== specifier) throw new Error(`Captured manifest and lockfile disagree for ${name}; run pnpm install --frozen-lockfile.`);
    }
  }
  const roots = new Map();
  // Keep the captured build toolchain too: the browser build must execute the
  // captured configuration, not a file still being edited in the checkout.
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) roots.set(name, await resolvePackage(dependencySource, name));
  const packages = new Map();
  for (const [name, origin] of roots) await copyPackage(origin, join(directory, 'node_modules', name), roots, packages);

  // Build captured application inputs; the development checkout's dist is never touched.
  const require = createRequire(join(directory, 'package.json'));
  const vite = require.resolve('vite/package.json');
  await exec(process.execPath, [join(dirname(vite), 'bin/vite.js'), 'build', join(directory, 'web'), '--config', join(directory, 'vite.config.ts'), '--outDir', join(directory, 'dist/web')], { cwd: directory, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (before !== await hashInputs(source)) throw new Error('Source changed during release creation; candidate was not completed.');
  let revision = null;
  try { revision = (await exec('git', ['-C', source, 'rev-parse', 'HEAD'])).stdout.trim(); } catch { /* Source fixtures need not be Git repositories. */ }
  for (const [origin, evidence] of packages) {
    if (evidence.digest !== await hashPackage(origin)) throw new Error('Installed dependencies changed during release capture; candidate was not completed.');
  }
  const metadata = { formatVersion: 1, id, ready: true, createdAt: new Date().toISOString(), sourceRevision: provenance?.sourceRevision ?? revision,
    ...(provenance ? { sourceTag: provenance.sourceTag, sourceKind: provenance.sourceKind } : {}),
    sourceDigest: before, packageVersion: manifest.version, nodeMajor: 24, platform: process.platform, architecture: process.arch, packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  await writeFile(join(directory, 'launch.mjs'), concreteLauncher);
  await verifyInstalledHost(directory);
  // The readiness record is the final operation. Failed candidates are never eligible for publication.
  await writeFile(join(directory, 'release.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
  return { id, directory };
}

async function hashInputs(source) {
  const hash = createHash('sha256');
  async function visit(path, name) {
    const info = await stat(path);
    if (info.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await visit(join(path, entry), name + '/' + entry);
    } else if (info.isFile()) hash.update(name).update('\0').update(await readFile(path)).update('\0');
    else throw new Error(`Unsupported release input: ${path}`);
  }
  for (const name of inputs) {
    try { await visit(join(source, name), name); }
    catch (error) { if (error.code !== 'ENOENT' || name !== 'examples') throw error; }
  }
  return hash.digest('hex');
}

async function findDependencySource(source) {
  try { await stat(join(source, 'node_modules')); return source; }
  catch { return checkout; }
}

async function resolvePackage(from, name) {
  let current = from;
  while (true) {
    try { return await realpath(join(current, 'node_modules', name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(current);
    if (parent === current) throw Object.assign(new Error(`Installed dependency ${name} is missing from ${from}; run pnpm install --frozen-lockfile.`), { code: 'ENOENT' });
    current = parent;
  }
}

async function copyPackage(origin, destination, available, packages) {
  const metadata = JSON.parse(await readFile(join(origin, 'package.json'), 'utf8'));
  const digest = await hashPackage(origin);
  packages.set(origin, { name: metadata.name, version: metadata.version, digest });
  await mkdir(dirname(destination), { recursive: true });
  await cp(origin, destination, { recursive: true, dereference: true, filter: path => !relative(origin, path).split(/[\\/]/).includes('node_modules') });
  if (digest !== await hashPackage(destination)) throw new Error(`Dependency changed while capturing ${metadata.name}.`);
  const inherited = new Map(available);
  inherited.set(metadata.name, origin);
  const dependencies = { ...metadata.peerDependencies, ...metadata.dependencies, ...metadata.optionalDependencies };
  const required = metadata.dependencies ?? {};
  const pending = [];
  for (const name of Object.keys(dependencies ?? {})) {
    let resolved;
    try { resolved = await resolvePackage(origin, name); }
    catch (error) { if (error.code === 'ENOENT' && !(name in required)) continue; throw error; }
    if (inherited.get(name) === resolved) continue;
    pending.push([name, resolved]);
  }
  for (const [name, origin] of pending) inherited.set(name, origin);
  for (const [name, origin] of pending) await copyPackage(origin, join(destination, 'node_modules', name), inherited, packages);
}

async function hashPackage(directory) {
  const hash = createHash('sha256');
  async function visit(path, name) {
    const info = await stat(path);
    if (info.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) if (entry !== 'node_modules') await visit(join(path, entry), name + '/' + entry);
    } else if (info.isFile()) hash.update(name).update('\0').update(await readFile(path)).update('\0');
  }
  await visit(directory, '');
  return hash.digest('hex');
}

async function verifyInstalledHost(directory) {
  const fixture = await mkdtemp(join(tmpdir(), 'coordination-release-smoke-'));
  let child;
  try {
    const project = join(fixture, 'project');
    await exec('git', ['init', '--initial-branch=main', project]);
    const definition = join(fixture, 'process.yaml');
    await writeFile(definition, 'schemaVersion: 1\nname: Release verification\ndefaultTaskWorkspaceStartingRef: main\ncoordinationGuidance: Verify isolated startup.\nagents: []\nboards:\n  - id: delivery\n    name: Delivery\n    guidance: Inspect work.\n    columns:\n      - id: backlog\n        name: Backlog\n');
    child = spawn(process.execPath, ['--experimental-strip-types', join(directory, 'src/cli.ts'), 'start', '--project', project, '--process', definition, '--port', '0'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    const url = await new Promise((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error('Installed host verification timed out: ' + output)), 20_000);
      const observe = data => {
        output += data;
        const match = output.match(/Coordination application listening at (http:\/\/[^\s]+)/);
        if (match && output.includes('Startup mode: paused')) { clearTimeout(timeout); accept(match[1]); }
      };
      child.stdout.on('data', observe); child.stderr.on('data', observe);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('Installed host verification failed: ' + output)); });
    });
    let response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(10_000) }); }
    catch (error) { throw new Error(`Installed host HTTP verification failed at ${url}: ${error.message}; ${error.cause?.message ?? ''}; output=${output}`); }
    if (!response.ok || !(await response.text()).includes('Agent Coordination')) throw new Error('Installed browser verification failed.');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(accept => child.once('exit', accept));
      child.kill('SIGTERM'); await exited;
    }
    // mkdtemp supplies this exact owned directory; never remove project state.
    await rm(fixture, { recursive: true, force: true });
  }
}

const concreteLauncher = `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const metadata = JSON.parse(await readFile(new URL('./release.json', import.meta.url), 'utf8'));
if (!metadata.ready || Number(process.versions.node.split('.')[0]) < metadata.nodeMajor) throw new Error('Release requires a completed installation and Node.js ' + metadata.nodeMajor + ' or later.');
console.log('Framework release: ' + metadata.id);
console.log('Framework installation: ' + fileURLToPath(new URL('.', import.meta.url)));
console.log('Framework source: ' + metadata.sourceDigest);
const cli = new URL('./src/cli.ts', import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), ...process.argv.slice(2)];
await import(cli.href);
`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = {};
    const arguments_ = process.argv.slice(2);
    for (let index = 0; index < arguments_.length; index += 2) {
      const key = arguments_[index]; const value = arguments_[index + 1];
      if (!['--root', '--source', '--id'].includes(key) || !value || value.startsWith('--') || options[key.slice(2)] !== undefined) throw new Error('Usage: node scripts/create-local-release.mjs --root <directory> [--source <checkout>] [--id <unique-id>]');
      options[key.slice(2)] = value;
    }
    options.root ??= join(dirname(checkout), 'agent-devteam-releases');
    console.log(JSON.stringify(await createLocalRelease(options)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
