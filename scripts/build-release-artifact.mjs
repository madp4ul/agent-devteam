import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { link, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createLocalRelease } from './create-local-release.mjs';

const exec = promisify(execFile);
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archiveTool = fileURLToPath(new URL('./release-archive.ps1', import.meta.url));

export async function buildReleaseArtifact({ tag, out = join(checkout, 'dist/releases'), source = checkout }) {
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag ?? '')) throw new Error('A stable version tag such as v1.2.3 is required.');
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Shared release artifacts currently support Windows x64 only.');
  source = resolve(source); out = resolve(out);
  let commit;
  try { commit = (await exec('git', ['-C', source, 'rev-parse', '--verify', `refs/tags/${tag}^{commit}`])).stdout.trim(); }
  catch { throw new Error(`Version tag ${tag} was not found; create and push a committed version tag first.`); }
  await verifyCommittedTooling(source, commit);
  const archive = join(out, `agent-coordination-framework-${tag}-win32-x64.zip`);
  for (const existing of [archive, `${archive}.sha256`]) {
    try { await lstat(existing); throw new Error(`Release artifact ${tag} already exists; outputs are never overwritten.`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const temporary = await mkdtemp(join(tmpdir(), 'coordination-committed-'));
  const candidate = join(out, `.artifact-${randomUUID()}.zip`);
  try {
    const sourceZip = join(temporary, 'source.zip');
    await exec('git', ['-c', 'core.autocrlf=false', '-C', source, 'archive', '--format=zip', `--output=${sourceZip}`, commit], { maxBuffer: 1024 * 1024 });
    const captured = join(temporary, 'source');
    await runArchive('Unpack', sourceZip, captured);
    const manifest = JSON.parse(await readFile(join(captured, 'package.json'), 'utf8'));
    if (`v${manifest.version}` !== tag) throw new Error(`Version tag ${tag} must match the committed package version ${manifest.version}.`);
    const installation = await createLocalRelease({ root: join(temporary, 'installation'), source: captured, id: tag,
      provenance: { sourceRevision: commit, sourceTag: tag, sourceKind: 'committed-release' } });
    await mkdir(out, { recursive: true });
    await runArchive('Pack', installation.directory, candidate);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(candidate)) hash.update(chunk);
    const sha256 = hash.digest('hex');
    await verifyCommittedTooling(source, commit);
    // A same-directory hard link creates the complete output name atomically and
    // refuses an existing name. The temporary link is removed in finally.
    await link(candidate, archive);
    await writeFile(`${archive}.sha256`, `${sha256}  ${archive.split(/[\\/]/).at(-1)}\n`, { flag: 'wx' });
    return { tag, commit, archive, sha256 };
  } finally {
    await rm(candidate, { force: true });
    await rm(temporary, { recursive: true, force: true });
  }
}

async function verifyCommittedTooling(source, commit) {
  for (const name of ['build-release-artifact.mjs', 'create-local-release.mjs', 'release-archive.ps1']) {
    let committed;
    try { committed = (await exec('git', ['-C', source, 'show', `${commit}:scripts/${name}`], { maxBuffer: 4 * 1024 * 1024 })).stdout; }
    catch { throw new Error(`Committed release tooling scripts/${name} is missing from the selected tag. Run the release build from that tag or its CI workflow.`); }
    const current = await readFile(new URL(`./${name}`, import.meta.url), 'utf8');
    if (committed.replace(/\r\n/g, '\n') !== current.replace(/\r\n/g, '\n')) throw new Error(`Current release tooling scripts/${name} differs from the selected tag. Run the release build from that tag or its CI workflow.`);
  }
}

async function runArchive(mode, source, destination) {
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', archiveTool, '-Mode', mode, '-Source', source, '-Destination', destination], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index]; const value = args[index + 1];
      if (!['--tag', '--out', '--source'].includes(key) || !value || value.startsWith('--') || options[key.slice(2)] !== undefined) throw new Error('Usage: pnpm release:build --tag vX.Y.Z [--out <directory>]');
      options[key.slice(2)] = value;
    }
    console.log(JSON.stringify(await buildReleaseArtifact(options)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
