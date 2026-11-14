import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { open, readFile, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { resolveRelease, resolveLatestRelease as resolveInstalledRelease } from './local-release-launcher.mjs';
import { recordManagedRelease, selectAndPinRelease, withReleaseCache } from './release-cache.mjs';

const exec = promisify(execFile);
const version = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const sha = /^[a-f0-9]{40}$/;
const maxDownloadBytes = 512 * 1024 * 1024;
class RemoteUnavailable extends Error {}

async function request(url, api, accept = 'application/vnd.github+json', timeout = 15_000, missingReleaseIsUnavailable = false) {
  const headers = { Accept: accept, 'User-Agent': 'agent-coordination-framework-updater', 'X-GitHub-Api-Version': '2022-11-28' };
  // Test loopback endpoints never receive the launching user's credentials.
  const token = api.origin === 'https://api.github.com' ? process.env.GITHUB_TOKEN || process.env.GH_TOKEN : undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  const signal = AbortSignal.timeout(timeout);
  for (let redirect = 0; redirect < 6; redirect++) {
    let response;
    try { response = await fetch(url, { headers, redirect: 'manual', signal }); }
    catch (error) { throw new RemoteUnavailable(`GitHub release service is unreachable (${error.code ?? error.name}).`); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('GitHub asset redirect has no destination.');
      const next = new URL(location, url);
      if (next.protocol !== 'https:' && !(next.protocol === 'http:' && next.origin === api.origin && ['127.0.0.1', 'localhost', '[::1]'].includes(next.hostname))) throw new Error('Unsafe release download redirect.');
      if (next.origin !== api.origin) delete headers.Authorization;
      url = next;
      continue;
    }
    if ((response.status === 404 && missingReleaseIsUnavailable) || response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      throw new RemoteUnavailable(`GitHub release service returned HTTP ${response.status}; a published release may not exist yet.`);
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404) throw new Error('Published release refers to a missing committed tag or application asset (HTTP 404); cached fallback was not used.');
      throw new Error(`GitHub release request failed with HTTP ${response.status}. Check repository access and GITHUB_TOKEN if private.`);
    }
    return response;
  }
  throw new Error('Too many release download redirects.');
}

async function json(url, api, missingReleaseIsUnavailable = false) {
  const response = await request(url, api, 'application/vnd.github+json', 15_000, missingReleaseIsUnavailable);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 4 * 1024 * 1024) { await response.body?.cancel(); throw new Error('GitHub release metadata is unexpectedly large.'); }
  let data = '';
  for await (const chunk of response.body ?? []) {
    data += Buffer.from(chunk).toString('utf8');
    if (Buffer.byteLength(data) > 4 * 1024 * 1024) { await response.body?.cancel().catch(() => {}); throw new Error('GitHub release metadata is unexpectedly large.'); }
  }
  return JSON.parse(data);
}

async function validateDownloaded(root, id, expected) {
  const installation = await resolveRelease(root, id);
  const metadata = JSON.parse(await readFile(join(installation.directory, 'release.json'), 'utf8'));
  const download = JSON.parse(await readFile(join(installation.directory, 'download.json'), 'utf8'));
  if (metadata.sourceKind !== 'committed-release' || metadata.sourceTag !== id || metadata.sourceRevision !== expected.commit || download.repository !== expected.repository || download.releaseId !== expected.releaseId || download.assetId !== expected.assetId || download.digest !== expected.digest) throw new Error(`Installed release ${id} conflicts with the published committed artifact; existing files were preserved.`);
  return installation;
}

/** Fetch/install once before host import. Never catches application or migration failures. */
export async function ensureLatestRelease(root, { warn = message => console.error(message) } = {}) {
  root = resolve(root);
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Release startup requires installed Node.js 24 or later.');
  const config = JSON.parse(await readFile(join(root, 'release-source.json'), 'utf8'));
  if (typeof config.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository) || config.repository.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid release repository configuration.');
  const api = new URL(config.apiBase ?? 'https://api.github.com');
  if (api.username || api.password || api.search || api.hash || api.pathname !== '/' || !(api.origin === 'https://api.github.com' || api.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname))) throw new Error('Release API must be GitHub HTTPS or an explicit local test endpoint.');
  const base = new URL(`/repos/${config.repository}/`, api);
  let stage;
  try {
    const release = await json(new URL('releases/latest', base), api, true);
    const id = release.tag_name;
    if (typeof id !== 'string' || !version.test(id) || release.draft !== false || release.prerelease !== false || !Number.isSafeInteger(release.id) || release.id <= 0 || !Array.isArray(release.assets)) throw new Error('Latest published release metadata is invalid or not a stable version.');
    const name = `agent-coordination-framework-${id}-${process.platform}-${process.arch}.zip`;
    const matches = release.assets.filter(asset => asset.name === name);
    if (matches.length !== 1) throw new Error(`Published release ${id} must contain exactly one ${name} application asset.`);
    const asset = matches[0];
    if (!Number.isSafeInteger(asset.id) || asset.id <= 0 || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maxDownloadBytes || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '')) throw new Error('Published release asset has invalid size or SHA-256 digest metadata.');
    const tagged = await json(new URL(`commits/${encodeURIComponent(id)}`, base), api);
    if (typeof tagged.sha !== 'string' || !sha.test(tagged.sha)) throw new Error('Published release tag does not identify a committed revision.');
    const expected = { repository: config.repository, releaseId: release.id, assetId: asset.id, digest: asset.digest, commit: tagged.sha };
    const destination = join(root, 'releases', id);
    try {
      await stat(destination);
      return await withReleaseCache(root, async database => {
        const installed = await validateDownloaded(root, id, expected);
        return selectAndPinRelease(database, root, installed, warn);
      });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(join(root, 'releases'), { recursive: true });
    stage = await mkdtemp(join(root, '.install-'));
    const archive = join(stage, 'application.zip');
    const response = await request(new URL(`releases/assets/${asset.id}`, base), api, 'application/octet-stream', 120_000);
    const file = await open(archive, 'wx');
    const hash = createHash('sha256');
    let count = 0;
    try {
      for await (const chunk of response.body ?? []) {
        const buffer = Buffer.from(chunk); count += buffer.length;
        if (count > asset.size || count > maxDownloadBytes) throw new Error('Release download exceeds its declared size.');
        hash.update(buffer); await file.writeFile(buffer);
      }
      await file.sync();
    } finally { await file.close(); }
    if (count !== asset.size || `sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('Downloaded release failed SHA-256 checksum verification; previous installation was preserved.');
    const stageRoot = join(stage, 'candidate');
    const candidate = join(stageRoot, 'releases', id);
    await mkdir(dirname(candidate), { recursive: true });
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./release-archive.ps1', import.meta.url)), '-Mode', 'Unpack', '-Source', archive, '-Destination', candidate], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    await writeDownloadRecord(candidate, expected);
    await validateDownloaded(stageRoot, id, expected);
    return await withReleaseCache(root, async database => {
      let created = false;
      try { await rename(candidate, destination); created = true; }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
        // Another starter may have installed the exact same verified asset first.
        await validateDownloaded(root, id, expected);
      }
      const installed = await validateDownloaded(root, id, expected);
      if (created) await recordManagedRelease(database, root, id);
      return selectAndPinRelease(database, root, installed, warn);
    });
  } catch (error) {
    if (!(error instanceof RemoteUnavailable)) throw error;
    let installed;
    try { installed = await withReleaseCache(root, async database => selectAndPinRelease(database, root, await resolveInstalledRelease(root), warn)); }
    catch { throw new Error(`${error.message} No verified cached installation is available. Publish a shared release and start again.`, { cause: error }); }
    warn(`Warning: ${error.message} Using cached installed release ${installed.id}; no update was applied.`);
    return installed;
  } finally {
    // stage is created by mkdtemp directly beneath this root, never project state.
    if (stage) await rm(stage, { recursive: true, force: true });
  }
}

async function writeDownloadRecord(candidate, expected) {
  const file = await open(join(candidate, 'download.json'), 'wx');
  try { await file.writeFile(JSON.stringify({ formatVersion: 1, ...expected }, null, 2) + '\n'); } finally { await file.close(); }
}
