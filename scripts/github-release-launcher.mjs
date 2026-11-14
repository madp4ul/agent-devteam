import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureLatestRelease } from './github-release-updater.mjs';

/** The caller retains the returned installation for validation and host startup. */
export async function resolveLatestRelease(root = dirname(fileURLToPath(import.meta.url))) {
  return ensureLatestRelease(root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const installation = await resolveLatestRelease(process.env.COORDINATION_RELEASE_ROOT ?? dirname(fileURLToPath(import.meta.url)));
    const launcher = join(installation.directory, 'launch.mjs');
    process.argv = [process.execPath, launcher, ...process.argv.slice(2)];
    // Runtime failures propagate; they must not select another application version.
    await import(pathToFileURL(launcher).href);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
