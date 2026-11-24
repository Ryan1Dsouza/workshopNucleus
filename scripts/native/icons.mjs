import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from '../audit/browser-options.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const svg=await fs.readFile(path.join(root,'native/shared/controllerkit-icon.svg'),'utf8');
const folder=path.join(root,'native/ios/Assets.xcassets/AppIcon.appiconset');await fs.mkdir(folder,{recursive:true});
const browser=await chromium.launch(browserOptions());
try{const page=await browser.newPage({viewport:{width:1024,height:1024}});await page.setContent('<style>html,body{margin:0;padding:0;overflow:hidden;background:#6178d9}</style>'+svg);await page.screenshot({path:path.join(folder,'AppIcon.png')});}
finally{await browser.close();}
await fs.writeFile(path.join(folder,'Contents.json'),JSON.stringify({images:[{filename:'AppIcon.png',idiom:'universal',platform:'ios',size:'1024x1024'}],info:{author:'xcode',version:1}},null,2)+'\n');
await fs.writeFile(path.join(root,'native/ios/Assets.xcassets/Contents.json'),JSON.stringify({info:{author:'xcode',version:1}},null,2)+'\n');
console.log('ControllerKit iOS icon generated from the shared vector.');
