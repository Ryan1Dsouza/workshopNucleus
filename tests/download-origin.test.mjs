import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadOrigins } from '../public/host/download-origin.js';
test('localhost QR uses a phone-reachable LAN address and removes invalid/duplicate entries',()=>{
  assert.deepEqual(downloadOrigins({port:3000,addresses:['127.0.0.1','169.254.2.1','192.168.1.20','192.168.1.20','bad','999.1.2.3']},{hostname:'localhost',origin:'http://localhost:3000'}),['http://192.168.1.20:3000']);
});
test('a host opened through a LAN address keeps its current reachable origin',()=>{
  assert.deepEqual(downloadOrigins({port:3000,addresses:['10.0.0.2']},{hostname:'192.168.1.20',origin:'http://192.168.1.20:3000'}),['http://192.168.1.20:3000']);
});
