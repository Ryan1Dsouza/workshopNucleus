import fs from 'node:fs/promises';
import path from 'node:path';
import { root, readKit, verifyStage, stageContent, sha256, json, inside } from './files.mjs';
const { manifest, state, referenceRoot } = await readKit();
const requested = Number(process.argv[2]);
if (process.argv.length !== 3 || !Number.isInteger(requested) || requested < 1 || requested > 7) throw new Error('Usage: npm run workshop:stage -- <1-7>');
if (requested !== state.stage + 1 && requested !== state.stage) throw new Error('Finish Stage ' + (state.stage + 1) + ' next. Stages are sequential.');
const previous = await verifyStage(root, manifest, state.stage, referenceRoot);
if (previous.problems.length) throw new Error('Previous checkpoint differs. Restore these files from .workshop/reference before continuing:\n' + previous.problems.join('\n'));
if (requested !== state.stage) {
  const layer = manifest.files.filter(file => file.stage === requested || file.path === 'public/stage.mjs'), contents = [];
  // Validate the entire layer before writing any file.
  for (const file of layer) {
    const content = await stageContent(referenceRoot, file.path, requested);
    if (sha256(content) !== (file.path === 'public/stage.mjs' ? manifest.stageHashes[requested] : file.sha256)) throw new Error('Frozen reference changed: ' + file.path);
    contents.push([file.path, content]);
  }
  for (const [relative, content] of contents) {
    const target = inside(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  await fs.writeFile(path.join(root, '.workshop/state.json'), json({ stage: requested }));
}
const result = await verifyStage(root, manifest, requested, referenceRoot);
if (result.problems.length) throw new Error(result.problems.join('\n'));
console.log('PASS Stage ' + requested + ': ' + manifest.stages.find(stage => stage.id === requested).title + '\n' + result.files + ' source files match. Next: npm test, then npm run audit:stage -- ' + requested + '.');
