import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sourceFiles } from '../scripts/workshop/files.mjs';

test('source inventory ignores Finder metadata while retaining unexpected source files', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'controllerkit-inventory-'));
  try {
    await fs.mkdir(path.join(folder, 'public/nested'), { recursive: true });
    for (const file of ['public/.DS_Store', 'public/._host.html', 'public/nested/.DS_Store', 'public/nested/._app.mjs', 'public/nested/app.mjs', 'public/unexpected.mjs']) {
      await fs.writeFile(path.join(folder, file), 'fixture');
    }
    assert.deepEqual(await sourceFiles(folder), ['public/nested/app.mjs', 'public/unexpected.mjs']);
  } finally {
    const resolved = await fs.realpath(folder), temporaryRoot = await fs.realpath(os.tmpdir());
    assert.equal(path.dirname(resolved), temporaryRoot);
    assert.ok(path.basename(resolved).startsWith('controllerkit-inventory-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
