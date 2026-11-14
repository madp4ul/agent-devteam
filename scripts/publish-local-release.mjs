import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLocalRelease } from './create-local-release.mjs';
import { resolveRelease } from './local-release-launcher.mjs';
import { replaceReleaseFile } from './release-file.mjs';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Explicit publication is the only operation that changes latest. */
export async function publishLocalRelease(options = {}) {
  const root = resolve(options.root ?? process.env.COORDINATION_RELEASE_ROOT ?? join(dirname(checkout), 'agent-devteam-releases'));
  try {
    await readFile(join(root, 'release-source.json'));
    throw new Error('This cache is managed by shared GitHub releases. Use a separate --root for development snapshots; the hosted-release launcher was preserved.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const installation = await createLocalRelease({ ...options, root });
  await resolveRelease(root, installation.id);
  const launcher = await readFile(new URL('./local-release-launcher.mjs', import.meta.url), 'utf8');
  await replaceReleaseFile(root, 'launch-latest.mjs', launcher);
  await replaceReleaseFile(root, 'latest.json', JSON.stringify({ formatVersion: 1, id: installation.id }, null, 2) + '\n');
  return installation;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index]; const value = args[index + 1];
      if (!['--root', '--source', '--id'].includes(key) || !value || value.startsWith('--') || options[key.slice(2)] !== undefined) throw new Error('Usage: pnpm release:local [--root <directory>] [--source <checkout>] [--id <unique-id>]');
      options[key.slice(2)] = value;
    }
    console.log(JSON.stringify(await publishLocalRelease(options)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
