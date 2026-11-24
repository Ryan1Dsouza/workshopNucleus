import path from 'node:path';
import fs from 'node:fs/promises';
import { root, sourceFiles, inside, copyFile, emptyOutput, outputArgument } from './files.mjs';
const output = outputArgument(path.join(root, 'dist/controllerkit-workshop'));
const state = await fs.readFile(path.join(root, '.workshop/state.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
if (state && state.stage !== 7) throw new Error('Complete Stage 7 before exporting the full game.');
await emptyOutput(output);
for (const file of await sourceFiles()) await copyFile(inside(root, file), inside(output, file));
console.log('Portable game source: ' + output + '\nOn another laptop: npm ci, then npm start. No OpenCode or OmniRoute service is needed to play.');
