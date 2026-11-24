import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'public/controller');
try { await fs.access(path.join(source, 'phone-ui.mjs')); }
catch { console.log('Using the supplied native controller UI at this checkpoint.'); process.exit(0); }
const [html, authoredCss, contract, ui, theme] = await Promise.all([
  fs.readFile(path.join(source, 'index.html'), 'utf8'), fs.readFile(path.join(source, 'phone.css'), 'utf8'),
  fs.readFile(path.join(root, 'public/core/controller-contract.js'), 'utf8'), fs.readFile(path.join(source, 'phone-ui.mjs'), 'utf8'),
  fs.readFile(path.join(root, 'public/ui/theme.css'), 'utf8')
]);
// The native remote is one self-contained file, including its offline typography.
let offlineTheme = theme;
for (const match of theme.matchAll(/url\("\.\/fonts\/([\w-]+\.woff2)"\)/g)) {
  const font = await fs.readFile(path.join(root, 'public/ui/fonts', match[1]));
  if (font.subarray(0, 4).toString() !== 'wOF2') throw new Error('Invalid offline font: ' + match[1]);
  offlineTheme = offlineTheme.replaceAll(match[0], 'url("data:font/woff2;base64,' + font.toString('base64') + '")');
}
const css = authoredCss.replace('@import url("../ui/theme.css");', offlineTheme);
// Two known, dependency-free modules become one offline native WebView bundle.
// The authored browser source remains ES modules; native loading needs no server.
const script = '(function(){\n' + contract.replaceAll(/\bexport /g, '') + '\n'
  + ui.replace(/^import[^\n]+\n/gm, '').replaceAll(/\bexport /g, '') + '\n})();';
const bundled = html.replace('<link rel="stylesheet" href="./phone.css">', '<style>' + css + '</style>')
  .replace('<script type="module" src="./phone-ui.mjs"></script>', '<script>' + script + '</script>');
for (const relative of ['native/android/app/src/main/assets/controller.html', 'native/ios/Resources/controller.html']) {
  const destination = path.join(root, relative); await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bundled);
}
console.log('Shared offline controller UI synchronized to Android and iOS.');
