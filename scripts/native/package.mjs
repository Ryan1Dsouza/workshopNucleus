import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'native/android/app/build/outputs/apk/debug/app-debug.apk');
const out = path.join(root, 'public/downloads/air-slice-ble.apk');
const uiSource = path.join(root, 'public/downloads/controller.html');
const manifestOut = path.join(root, 'public/downloads/version.json');
const gradlePath = path.join(root, 'native/android/app/build.gradle');
try { await fs.access(source); } catch { throw new Error('Build the Android app first: cd native/android, then ./gradlew assembleDebug (Windows: .\\gradlew.bat assembleDebug).'); }
await fs.mkdir(path.dirname(out), { recursive: true }); await fs.copyFile(source, out);
const gradle = await fs.readFile(gradlePath, 'utf8');
const codeMatch = gradle.match(/versionCode\s+(\d+)/);
const nameMatch = gradle.match(/versionName\s+['"]([^'"]+)['"]/);
if (!codeMatch || !nameMatch) throw new Error('Could not read versionCode/versionName from native/android/app/build.gradle');
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const [apkSha256, uiSha256] = await Promise.all([sha256(out), sha256(uiSource)]);
const manifest = {
  versionCode: Number(codeMatch[1]),
  versionName: nameMatch[1],
  apkSha256,
  uiSha256,
  apkUrl: '/downloads/air-slice-ble.apk',
  uiUrl: '/downloads/controller.html'
};
await fs.writeFile(manifestOut, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Packaged Android test APK: ${out} (v${manifest.versionName} / ${manifest.versionCode})`);
