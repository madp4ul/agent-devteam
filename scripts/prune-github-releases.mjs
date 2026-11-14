import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const version = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function frameworkRelease(release) {
  return release && Number.isSafeInteger(release.id) && release.id > 0 &&
    typeof release.tag_name === 'string' && version.test(release.tag_name) &&
    release.draft === false && release.prerelease === false &&
    Number.isFinite(Date.parse(release.published_at)) && Number.isFinite(Date.parse(release.updated_at)) &&
    Array.isArray(release.assets) && release.assets.some(asset =>
      asset.name === `agent-coordination-framework-${release.tag_name}-win32-x64.zip` && asset.state === 'uploaded');
}

function fingerprint(release) {
  return JSON.stringify([release.id, release.tag_name, release.draft, release.prerelease,
    release.published_at, release.updated_at, release.assets.map(asset =>
      [asset.id, asset.name, asset.state, asset.size, asset.digest]).sort((a, b) => a[0] - b[0])]);
}

/** Run only after successful publication. This never calls a Git-ref deletion API. */
export async function pruneGithubReleases({ repository, publishedTag, keep = 5,
  apiBase = 'https://api.github.com', token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN } = {}) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split('/').some(part => part === '.' || part === '..')) throw new Error('Repository must be owner/name.');
  if (typeof publishedTag !== 'string' || !version.test(publishedTag)) throw new Error('A successfully published stable version tag is required.');
  if (!Number.isSafeInteger(keep) || keep < 2 || keep > 100) throw new Error('Retention must keep between 2 and 100 versions.');
  if (!token) throw new Error('GH_TOKEN or GITHUB_TOKEN with repository contents-write permission is required.');
  const api = new URL(apiBase);
  if (api.username || api.password || api.search || api.hash || api.pathname !== '/' || !(api.origin === 'https://api.github.com' || api.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname))) throw new Error('Retention API must be GitHub HTTPS or an explicit local test endpoint.');
  const base = new URL(`/repos/${repository}/`, api);
  async function request(path, method = 'GET', allowMissing = false) {
    const response = await fetch(new URL(path, base), { method, redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'agent-coordination-framework-retention', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (response.status === 404 && allowMissing) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Release retention ${method} failed with HTTP ${response.status}; the published release was not rolled back.`); }
    if (method === 'DELETE') { await response.body?.cancel(); return null; }
    let bytes = 0, text = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body ?? []) {
      bytes += chunk.byteLength;
      if (bytes > 16 * 1024 * 1024) throw new Error('Release retention metadata exceeded its size limit.');
      text += decoder.decode(chunk, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  }

  const published = await request(`releases/tags/${encodeURIComponent(publishedTag)}`);
  if (!frameworkRelease(published) || published.tag_name !== publishedTag) throw new Error('Cannot confirm the completed framework publication; no retention deletion is allowed.');
  const catalog = new Map();
  for (let page = 1; ; page++) {
    if (page > 1000) throw new Error('Release listing exceeded its pagination limit; no retention deletion is allowed.');
    const releases = await request(`releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases) || releases.length > 100) throw new Error('Release listing is invalid; no retention deletion is allowed.');
    for (const release of releases.filter(frameworkRelease)) {
      if (catalog.has(release.id) && fingerprint(catalog.get(release.id)) !== fingerprint(release)) throw new Error('Release listing changed during pagination; cleanup was stopped.');
      catalog.set(release.id, release);
    }
    if (releases.length < 100) break;
  }
  if (catalog.has(published.id) && fingerprint(catalog.get(published.id)) !== fingerprint(published)) throw new Error('The published release changed while listing; cleanup was stopped.');
  catalog.set(published.id, published);
  const latest = await request('releases/latest');
  if (!Number.isSafeInteger(latest?.id) || latest.id <= 0) throw new Error('Cannot confirm GitHub latest; no retention deletion is allowed.');
  const protectedIds = new Set([published.id, latest.id]);
  const ordered = [...catalog.values()].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || b.id - a.id);
  const retained = new Set(ordered.filter(release => protectedIds.has(release.id)).map(release => release.id));
  for (const release of ordered) { if (retained.size >= keep) break; retained.add(release.id); }
  const candidates = ordered.filter(release => !retained.has(release.id)).reverse();
  const deleted = [], skipped = [];
  let lastMutation = 0;
  for (const candidate of candidates) {
    if (lastMutation) await delay(Math.max(0, 1000 - (Date.now() - lastMutation)));
    const currentLatest = await request('releases/latest');
    if (!Number.isSafeInteger(currentLatest?.id) || currentLatest.id <= 0) throw new Error('Cannot reconfirm GitHub latest; remaining cleanup was stopped.');
    if (candidate.id === currentLatest.id || protectedIds.has(candidate.id)) { skipped.push(candidate.id); continue; }
    const current = await request(`releases/${candidate.id}`, 'GET', true);
    if (!frameworkRelease(current) || fingerprint(current) !== fingerprint(candidate)) { skipped.push(candidate.id); continue; }
    await request(`releases/${candidate.id}`, 'DELETE', true);
    lastMutation = Date.now();
    deleted.push(candidate.id);
  }
  return { keep, published: published.id, latest: latest.id, deleted, skipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index], value = args[index + 1];
      if (!['--repository', '--published-tag', '--keep', '--api-base'].includes(key) || !value || value.startsWith('--') || options[key] !== undefined) throw new Error('Usage: node prune-github-releases.mjs --repository owner/name --published-tag vX.Y.Z [--keep 5]');
      options[key] = value;
    }
    console.log(JSON.stringify(await pruneGithubReleases({ repository: options['--repository'], publishedTag: options['--published-tag'],
      ...(options['--keep'] && { keep: Number(options['--keep']) }), ...(options['--api-base'] && { apiBase: options['--api-base'] }) })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
