import { root, readKit, verifyStage } from './files.mjs';
const { manifest, state, referenceRoot } = await readKit();
const stage = process.argv[2] === undefined ? state.stage : Number(process.argv[2]);
if (!Number.isInteger(stage) || stage !== state.stage) throw new Error('The current checkpoint is Stage ' + state.stage + '; verify that stage.');
const result = await verifyStage(root, manifest, stage, referenceRoot);
if (result.problems.length) { console.error(result.problems.join('\n')); process.exitCode = 1; }
else console.log('PASS Stage ' + stage + ': ' + result.files + ' source files exactly match the frozen reference.');
