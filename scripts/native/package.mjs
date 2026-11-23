import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'native/android/app/build/outputs/apk/debug/app-debug.apk');
const out = path.join(root, 'public/downloads/air-slice-ble.apk');
try { await fs.access(source); } catch { throw new Error('Build the Android app first: cd native/android, then gradlew assembleDebug (Windows: .\\gradlew.bat assembleDebug).'); }
await fs.mkdir(path.dirname(out), { recursive: true }); await fs.copyFile(source, out);
console.log(`Packaged Android test APK: ${out}`);
