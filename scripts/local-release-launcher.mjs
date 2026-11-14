import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const releaseId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

/** Shared by publication and startup; never selects a different release on failure. */
export async function resolveRelease(root, id) {
  if (typeof id !== 'string' || !releaseId.test(id)) throw new Error('Invalid latest release identity. Publish a complete local release again.');
  const releases = await realpath(join(resolve(root), 'releases'));
  const directory = await realpath(join(releases, id));
  if (relative(releases, directory) !== id) throw new Error('Invalid latest release location: installation must be inside its release root.');
  const metadata = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'));
  if (metadata.formatVersion !== 1 || metadata.id !== id || metadata.ready !== true || !/^[a-f0-9]{64}$/.test(metadata.sourceDigest ?? '')) {
    throw new Error('Invalid latest release metadata. Publish a complete local release again.');
  }
  if (metadata.platform !== process.platform || metadata.architecture !== process.arch) throw new Error('Latest release was built for a different platform or architecture. Publish a release on this machine.');
  if (!Number.isInteger(metadata.nodeMajor) || metadata.nodeMajor < 24 || Number(process.versions.node.split('.')[0]) < metadata.nodeMajor) {
    throw new Error(`Latest release requires installed Node.js ${metadata.nodeMajor >= 24 ? metadata.nodeMajor : 24} or later.`);
  }
  for (const name of ['launch.mjs', 'src/cli.ts', 'src/startup-progress-worker.ts', 'src/runtime/codex-worker.ts', 'src/mcp/stdio-server.ts', 'src/application/internal/migrations/current-schema.sql', 'dist/web/index.html', 'node_modules/@openai/codex-sdk/package.json']) {
    if (!(await stat(join(directory, name))).isFile()) throw new Error(`Latest release is incomplete: ${name}`);
  }
  return { id, directory };
}

/** Resolve once; callers retain this concrete installation for their host lifetime. */
export async function resolveLatestRelease(root = dirname(fileURLToPath(import.meta.url))) {
  try {
    const latest = JSON.parse(await readFile(join(resolve(root), 'latest.json'), 'utf8'));
    if (latest.formatVersion !== 1) throw new Error('Invalid latest release selection format.');
    return await resolveRelease(root, latest.id);
  } catch (error) {
    throw new Error(`Cannot start latest framework release in ${resolve(root)}: ${error.message}. Create a release with pnpm release:local; there is no development-checkout fallback.`, { cause: error });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const installation = await resolveLatestRelease(process.env.COORDINATION_RELEASE_ROOT ?? dirname(fileURLToPath(import.meta.url)));
    const launcher = join(installation.directory, 'launch.mjs');
    process.argv = [process.execPath, launcher, ...process.argv.slice(2)];
    await import(pathToFileURL(launcher).href);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
