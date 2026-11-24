import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sourceEntries = ['public', 'server', 'native', 'licenses', 'tests', 'scripts', 'workshop', 'docs', '.agents', 'skills-lock.json', 'AGENTS.md', 'README.md', '.gitignore', 'package.json', 'package-lock.json'];
export const sha256 = content => createHash('sha256').update(content).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export function inside(folder, relative) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Unsafe source path: ' + relative);
  const result = path.resolve(folder, relative);
  if (!result.startsWith(path.resolve(folder) + path.sep)) throw new Error('Path escaped its directory: ' + relative);
  return result;
}
export async function sourceFiles(folder = root) {
  const files = [];
  async function walk(relative) {
    const absolute = inside(folder, relative);
    const stat = await fs.lstat(absolute).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error('Cannot export a symbolic link: ' + relative);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) {
        // Finder and ZIP extraction can add metadata without changing source.
        if (name === '.DS_Store' || name.startsWith('._')) continue;
        if (['.gradle', 'build', 'node_modules', '.local', '.workshop', 'dist', 'test-results', 'local.properties', 'DerivedData', 'xcuserdata', '.build', 'Pods'].includes(name) || /\.(jks|keystore|mobileprovision)$/i.test(name)) continue;
        await walk(relative + '/' + name);
      }
    } else files.push(relative.replaceAll('\\', '/'));
  }
  for (const entry of sourceEntries) await walk(entry);
  return files.sort();
}
export async function copyFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}
export async function emptyOutput(folder) {
  const relative = path.relative(root, folder);
  if (folder === root || root.startsWith(folder + path.sep)) throw new Error('Output cannot contain the source project.');
  if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== 'dist') throw new Error('Put output under dist/ or outside the source project.');
  const contents = await fs.readdir(folder).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  if (contents.length) throw new Error('Output already contains files: ' + folder + '\nChoose a new --out path or move the old output to your backup first.');
  await fs.mkdir(folder, { recursive: true });
}
export function outputArgument(defaultPath) {
  const args = process.argv.slice(2);
  if (!args.length) return defaultPath;
  if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: --out <new-or-empty-folder>');
  return path.resolve(args[1]);
}
export async function stageContent(referenceRoot, file, stage) {
  const content = await fs.readFile(inside(referenceRoot, file));
  return file === 'public/stage.mjs' ? Buffer.from(content.toString('utf8').replace(/export const stage = \d+;/, 'export const stage = ' + stage + ';')) : content;
}
export async function readKit() {
  const manifest = await fs.readFile(path.join(root, '.workshop/manifest.json'), 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') throw new Error('Open the generated kit/starter folder. The organizer creates it with npm run workshop:kit.');
    throw error;
  });
  const state = JSON.parse(await fs.readFile(path.join(root, '.workshop/state.json'), 'utf8'));
  if (manifest.schema !== 1 || !Number.isInteger(state.stage) || state.stage < 0 || state.stage > 7) throw new Error('Invalid workshop manifest or state.');
  return { manifest, state, referenceRoot: path.join(root, '.workshop/reference') };
}
export async function verifyStage(folder, manifest, stage, referenceRoot) {
  const problems = [], expected = manifest.files.filter(file => file.stage <= stage), expectedPaths = new Set(expected.map(file => file.path));
  for (const file of expected) {
    const reference = await stageContent(referenceRoot, file.path, stage);
    if (sha256(reference) !== (file.path === 'public/stage.mjs' ? manifest.stageHashes[stage] : file.sha256)) problems.push('Reference changed: ' + file.path);
    const actual = await fs.readFile(inside(folder, file.path)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!actual) problems.push('Missing: ' + file.path);
    else if (sha256(actual) !== sha256(reference)) problems.push('Different: ' + file.path);
  }
  for (const file of await sourceFiles(folder)) if (!expectedPaths.has(file)) problems.push('Outside this stage: ' + file);
  return { stage, files: expected.length, problems };
}
