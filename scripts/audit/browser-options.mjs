import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export function browserOptions(engine = 'chromium') {
  const options = { headless: true };
  if (engine !== 'chromium') return options;
  if (process.env.BROWSER_EXECUTABLE) return { ...options, executablePath: process.env.BROWSER_EXECUTABLE };
  if (fs.existsSync(chromium.executablePath())) return { ...options, executablePath: chromium.executablePath() };
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const executablePath = candidates.find(candidate => fs.existsSync(candidate));
  return executablePath ? { ...options, executablePath } : options;
}
