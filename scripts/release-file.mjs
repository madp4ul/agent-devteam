import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Replace a complete cache/selection file without exposing an unlink gap. */
export async function replaceReleaseFile(root, name, contents) {
  const temporary = join(root, `.${name}-${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx');
    try { await file.writeFile(contents); await file.sync(); } finally { await file.close(); }
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, join(root, name)); return; }
      catch (error) {
        // Windows readers can briefly prevent replacement. Never remove the
        // accepted file before trying the same atomic rename again.
        if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 20) throw error;
        await delay(25);
      }
    }
  } finally { await rm(temporary, { force: true }); }
}
