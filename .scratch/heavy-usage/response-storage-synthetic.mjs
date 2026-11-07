// Isolated deterministic experiment: no framework imports, databases, or project state.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync, brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import assert from 'node:assert/strict';

const bytes = value => Buffer.byteLength(JSON.stringify(value));
console.log('Synthetic payload bytes only; excludes SQLite, indexes, keys, WAL, CPU, and backups.');
console.log('n,currentResponsePlusRequest,gzipResponsePlusRequest,brotliResponsePlusRequest,receiptPlusRequest');
for (const n of [100, 200, 400, 800]) {
  let raw = 0, gzip = 0, brotli = 0, receipts = 0;
  const task = { id: 'task-1', title: 'Synthetic', description: 'Synthetic task', boardId: 'board', columnId: 'work', revision: 1, comments: [], activity: [] };
  let firstResponse;
  for (let i = 0; i < n; i++) {
    const body = Array.from({ length: 8 }, (_, j) => createHash('sha256').update(`${i}:${j}`).digest('hex')).join('');
    const comment = { id: `comment-${i}`, body, actor: { kind: 'user', id: 'user' }, occurredAt: new Date(i * 1000).toISOString() };
    task.comments.push(comment);
    const response = JSON.stringify({ accepted: true, task, comment });
    firstResponse ??= response;
    const requestSize = bytes({ taskId: task.id, body });
    const gz = gzipSync(response, { level: 6 });
    const br = brotliCompressSync(response, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
    assert.equal(gunzipSync(gz).toString(), response);
    assert.equal(brotliDecompressSync(br).toString(), response);
    raw += Buffer.byteLength(response) + requestSize;
    gzip += gz.length + requestSize;
    brotli += br.length + requestSize;
    receipts += bytes({ accepted: true, taskId: task.id, revision: task.revision, commentId: comment.id }) + requestSize;
  }
  // Rehydrating by the retained task ID/revision returns later history.
  assert.notDeepEqual(JSON.parse(firstResponse).task, task);
  assert.equal(JSON.parse(firstResponse).task.revision, task.revision);
  console.log([n, raw, gzip, brotli, receipts].join(','));
}
