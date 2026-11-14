import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { replaceReleaseFile } from './release-file.mjs';
import { initializeReleaseRetention } from './release-cache.mjs';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Install only the bootstrap and source selection; retain all running installations. */
export async function installReleaseLauncher({ root = process.env.COORDINATION_RELEASE_ROOT ?? join(dirname(checkout), 'agent-devteam-releases'), repository = 'madp4ul/agent-devteam', apiBase = 'https://api.github.com' } = {}) {
  root = resolve(root);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split('/').some(part => part === '.' || part === '..')) throw new Error('Repository must be owner/name.');
  const api = new URL(apiBase);
  if (api.username || api.password || api.search || api.hash || api.pathname !== '/' || !(api.origin === 'https://api.github.com' || api.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname))) throw new Error('Release API must be GitHub HTTPS or an explicit local test endpoint.');
  await mkdir(root, { recursive: true });
  // Write dependencies before the entry point. Existing hosts already imported
  // theirs and run from their immutable installation, not these bootstrap files.
  for (const name of ['release-file.mjs', 'release-cache.mjs', 'github-release-updater.mjs', 'local-release-launcher.mjs', 'release-archive.ps1']) await replaceReleaseFile(root, name, await readFile(new URL(`./${name}`, import.meta.url)));
  await replaceReleaseFile(root, 'release-source.json', JSON.stringify({ repository, apiBase: api.origin }, null, 2) + '\n');
  await replaceReleaseFile(root, 'launch-latest.mjs', await readFile(new URL('./github-release-launcher.mjs', import.meta.url)));
  // Inventory legacy users only after all new starts use the lease-aware entry.
  await initializeReleaseRetention(root);
  return { root, repository };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index]; const value = args[index + 1];
      if (!['--root', '--repository', '--api-base'].includes(key) || !value || value.startsWith('--') || options[key] !== undefined) throw new Error('Usage: node scripts/install-release-launcher.mjs [--root <cache>] [--repository <owner/name>]');
      options[key] = value;
    }
    console.log(JSON.stringify(await installReleaseLauncher({ ...(options['--root'] && { root: options['--root'] }), ...(options['--repository'] && { repository: options['--repository'] }), ...(options['--api-base'] && { apiBase: options['--api-base'] }) })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
