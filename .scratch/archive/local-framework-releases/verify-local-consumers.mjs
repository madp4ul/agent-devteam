import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(process.argv[2] ?? '../agent-devteam-releases');
const fixture = await mkdtemp(join(tmpdir(), 'installed-v2-consumer-proof-'));
let host;
try {
  const project = join(fixture, 'project-v2');
  await exec('git', ['init', '--initial-branch=main', project]);
  await writeFile(join(project, 'README.md'), 'Disposable prepared V2 project.\n');
  await exec('git', ['-C', project, 'add', 'README.md']);
  await exec('git', ['-C', project, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixture']);
  const baseline = (await exec('git', ['-C', project, 'rev-parse', 'HEAD'])).stdout.trim();
  await exec('git', ['-C', project, 'config', 'autonomousv2.source', join(fixture, 'original')]);
  await exec('git', ['-C', project, 'config', 'autonomousv2.baseline', baseline]);
  const wrapper = join(fixture, 'process-v2');
  await cp(resolve('../agent-devteam-processes/Autonomous-v2'), wrapper, { recursive: true });
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((accept, reject) => listener.close(error => error ? reject(error) : accept()));
  host = spawn(process.execPath, [join(wrapper, 'launch.mjs'), '--project', project, '--port', String(port)], {
    env: { ...process.env, COORDINATION_RELEASE_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  await new Promise((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error(output)), 30_000);
    const observe = data => {
      output += data;
      if (output.includes('Startup mode: paused')) { clearTimeout(timeout); accept(); }
    };
    host.stdout.on('data', observe); host.stderr.on('data', observe);
    host.once('exit', () => { clearTimeout(timeout); reject(new Error(output)); });
  });
  const latest = JSON.parse(await readFile(join(root, 'latest.json'), 'utf8'));
  assert.equal(output.split(`Framework release: ${latest.id}`).length - 1, 2, 'validation and start use the selected release');
  const response = await fetch(`http://127.0.0.1:${port}`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Agent Coordination/);
  const binding = (await exec('git', ['-C', project, 'config', '--get', 'coordination.projectStateRoot'])).stdout.trim();
  assert.equal(binding, `${project}-agent-coordination-state`);

  // Verify original batch argument forwarding with a controlled application boundary.
  const originalBatch = resolve('../idle-games/start-agent-devteam.bat');
  const originalPresent = await stat(originalBatch).then(info => info.isFile()).catch(error => { if (error.code === 'ENOENT') return false; throw error; });
  if (originalPresent) {
  const batch = join(project, 'start-agent-devteam.bat');
  await cp(originalBatch, batch);
  const processDirectory = join(fixture, 'agent-devteam-processes', 'Autonomous');
  await mkdir(processDirectory, { recursive: true });
  await writeFile(join(processDirectory, 'process.yaml'), 'Fixture process input');
  const batchRoot = join(fixture, 'stub release root');
  await mkdir(batchRoot);
  const received = join(fixture, 'batch-arguments.json');
  await writeFile(join(batchRoot, 'launch-latest.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(received)}, JSON.stringify(process.argv.slice(2)));`);
  await exec('cmd.exe', ['/d', '/c', batch, '--port', '3422'], { env: { ...process.env, COORDINATION_RELEASE_ROOT: batchRoot }, timeout: 10_000 });
  assert.deepEqual(JSON.parse(await readFile(received, 'utf8')), ['start', '--process', join(processDirectory, 'process.yaml'), '--project', project, '--port', '3422']);
  }
  console.log(JSON.stringify({ release: latest.id, v2Startup: 'paused', browser: response.status, stateBinding: 'disposable project only', originalBatch: originalPresent ? 'arguments verified' : 'checkout absent; untouched' }));
} finally {
  if (host && host.exitCode === null && host.signalCode === null) {
    const exited = once(host, 'exit'); host.kill('SIGTERM'); await exited;
  }
  await rm(fixture, { recursive: true, force: true });
}
