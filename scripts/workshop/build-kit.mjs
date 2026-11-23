import fs from 'node:fs/promises';
import path from 'node:path';
import { root, sourceFiles, inside, sha256, json, copyFile, emptyOutput, outputArgument, stageContent } from './files.mjs';
import { stage as currentStage } from '../../public/stage.mjs';
if (currentStage !== 7) throw new Error('Create a kit from the complete Stage 7 source project.');
const output = outputArgument(path.join(root, 'dist/air-slice-kit'));
const spec = JSON.parse(await fs.readFile(path.join(root, 'workshop/stages.json'), 'utf8'));
const matches = (file, pattern) => pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -2)) : file === pattern;
const files = [];
for (const file of await sourceFiles()) {
  const owners = [...(spec.baseFiles.some(pattern => matches(file, pattern)) ? [0] : []), ...spec.stages.filter(stage => stage.files.some(pattern => matches(file, pattern))).map(stage => stage.id)];
  if (owners.length !== 1) throw new Error('Every source file needs one stage owner: ' + file + ' has ' + owners.length + '. Update workshop/stages.json.');
  const content = await fs.readFile(inside(root, file));
  files.push({ path: file, stage: owners[0], sha256: sha256(content), bytes: content.length });
}
// A test must never arrive before the source it imports.
const owners = new Map(files.map(file => [file.path, file.stage]));
for (const file of files.filter(file => file.path.startsWith('tests/'))) {
  const source = await fs.readFile(inside(root, file.path), 'utf8');
  for (const match of source.matchAll(/(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), match[1]));
    if (!owners.has(target) || owners.get(target) > file.stage) throw new Error('Test dependency belongs to a later/missing stage: ' + file.path + ' -> ' + target);
  }
}
const stageHashes = {};
for (let stage = 0; stage <= 7; stage++) stageHashes[stage] = sha256(await stageContent(root, 'public/stage.mjs', stage));
const manifest = { schema: 1, appVersion: JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version,
  sourceCommit: JSON.parse(await fs.readFile(path.join(root, 'licenses/OpenWii-source.json'), 'utf8')).commit, stages: spec.stages, stageHashes, files };
await emptyOutput(output);
const starter = path.join(output, 'starter'), referenceRoot = path.join(starter, '.workshop/reference');
for (const file of files) {
  await copyFile(inside(root, file.path), inside(referenceRoot, file.path));
  if (file.stage === 0) {
    const target = inside(starter, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await stageContent(referenceRoot, file.path, 0));
  }
}
await fs.writeFile(path.join(starter, '.workshop/manifest.json'), json(manifest));
await fs.writeFile(path.join(starter, '.workshop/state.json'), json({ stage: 0 }));
await fs.writeFile(path.join(output, 'START-HERE.md'), "# Air Slice workshop kit\n\nStart with [the new-laptop walkthrough](starter/workshop/NEW-LAPTOP.md). It covers transferring this kit, Node dependencies, your OmniRoute model configuration, the gateway key and a tool-call smoke test.\n\nThen paste the prompts from [STAGE-PROMPTS.md](starter/workshop/STAGE-PROMPTS.md), one at a time, starting with Stage 1. Work inside starter/ throughout. The starter begins at Stage 0, with no server/game yet; source is restored from .workshop/reference/ and checked with SHA-256.\n\nKeep .workshop/ when sharing the kit. Installed packages, certificates, SDK paths, old exports and native build output are excluded.\n");
console.log('Workshop kit: ' + output + '\nParticipant folder: ' + starter + '\n' + files.length + ' frozen files; 7 sequential stages. Start with npm ci and the Stage 1 prompt.');
