const express = require('express');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { Server } = require('socket.io');
const root = path.resolve(__dirname, '..');

function createWorkshopServer() {
  const app = express(), servers = [http.createServer(app)], rooms = new Map();
  const io = new Server({ transports: ['websocket'], maxHttpBufferSize: 32768 });
  require('./lobbies.cjs').installLobbies(io);
  const publicDir = path.join(root, 'public');
  app.use('/assets/mario-kart', express.static(path.join(publicDir, 'assets/mario-kart'), { maxAge: '1d' }));
  app.use(express.static(publicDir, { maxAge: 0 }));
  app.use('/workshop', express.static(path.join(root, 'workshop'), { index: false, maxAge: 0 }));
  app.use('/vendor/three', express.static(path.join(root, 'node_modules/three/build')));
  app.use('/vendor/three-examples', express.static(path.join(root, 'node_modules/three/examples/jsm')));
  // Optional audio overrides are probed once; absent files use synthesis.
  // Static files above still take precedence when an override is supplied.
  app.get(/^\/audio\/[\w-]+\.(mp3|wav|ogg)$/, (_, res) => res.status(204).end());
  app.get('/favicon.ico', (_, res) => res.status(204).end());
  app.get('/', (_, res) => res.redirect('/host'));
  app.get('/host', (_, res) => res.sendFile(path.join(publicDir, 'host/index.html')));
  app.get('/controller', (_, res) => res.sendFile(path.join(publicDir, 'controller/index.html')));
  app.get('/api/health', (_, res) => res.json({ app: 'controllerkit', version: 2 }));
  app.get('/connection-info', (req, res) => {
    const score = name => /wi-?fi|wlan/i.test(name) ? 0 : /virtual|vethernet|vpn|loopback/i.test(name) ? 2 : 1;
    const addresses = [...new Set(Object.entries(os.networkInterfaces()).sort((a,b)=>score(a[0])-score(b[0]))
      .flatMap(([, entries])=>entries || []).filter(n => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.')).map(n => n.address))];
    res.set('Cache-Control', 'no-store').json({ addresses, port: req.socket.localPort, httpsPort: servers.find(server=>server instanceof https.Server && server.listening)?.address()?.port || null });
  });
  io.attach(servers[0]);
  function presence(room) {
    const r = rooms.get(room); if (!r) return;
    io.to(room).emit('presence', { host: r.host, controller: r.phones.filter(Boolean).length,
      slots: r.phones.map((id, slot) => ({ slot, occupied: !!id, id })) });
  }
  function leave(socket) {
    const { room, role, slot } = socket.data, r = rooms.get(room); if (!r) return;
    if (role === 'game' && r.host === socket.id) r.host = null;
    if (role === 'phone' && r.phones[slot] === socket.id) r.phones[slot] = null;
    socket.leave(room); socket.data = {}; presence(room);
    if (!r.host && !r.phones.some(Boolean)) rooms.delete(room);
  }
  io.on('connection', socket => {
    socket.on('register', data => {
      if (!data || !['game', 'phone'].includes(data.role) || !/^[\w-]{16,64}$/.test(data.room || '')) return;
      leave(socket);
      const room = data.room;
      if (!rooms.has(room)) rooms.set(room, { host: null, phones: [null, null] });
      const r = rooms.get(room);
      const slot = data.role === 'phone' ? (Number.isInteger(data.slot) && data.slot >= 0 && data.slot < 2 ? data.slot : r.phones.indexOf(null)) : null;
      if (slot === -1) { socket.emit('replaced', 'Both phone slots are full.'); return; }
      const previous = data.role === 'game' ? r.host : r.phones[slot];
      if (previous && previous !== socket.id) { io.to(previous).emit('replaced', 'This connection was replaced.'); io.sockets.sockets.get(previous)?.disconnect(true); }
      // A replaced socket may have removed the empty room while disconnecting.
      rooms.set(room, r);
      if (data.role === 'game') r.host = socket.id; else r.phones[slot] = socket.id;
      socket.data = { room, role: data.role, slot }; socket.join(room);
      socket.emit('registered', { role: data.role, slot, id: socket.id, host: r.host }); presence(room);
    });
    function target() {
      const r = rooms.get(socket.data.room);
      return r && socket.data.role === 'phone' && r.phones[socket.data.slot] === socket.id ? r.host : null;
    }
    socket.on('signal', data => {
      const r = rooms.get(socket.data.room); if (!r || !data) return;
      const to = socket.data.role === 'game' && r.host === socket.id && r.phones.includes(data.to) ? data.to : target();
      if (to && data.payload && typeof data.payload === 'object') io.to(to).emit('signal', { from: socket.id, slot: socket.data.slot, payload: data.payload });
    });
    socket.on('sample', data => {
      const to = target(); if (!to || !data || !Number.isFinite(data.t) || !Number.isSafeInteger(data.sequence)) return;
      const now = performance.now(); if (now - (socket.data.lastSample || 0) < 8) return;
      socket.data.lastSample = now;
      io.to(to).volatile.emit('sample', { ...data, session: socket.id, slot: socket.data.slot });
    });
    socket.on('command', data => { const to = target(); if (to && data && typeof data.type === 'string') io.to(to).emit('command', { ...data, slot: socket.data.slot, session: socket.id }); });
    socket.on('feedback', data => {
      const r = rooms.get(socket.data.room); if (!r || r.host !== socket.id || !data) return;
      const targets = Number.isInteger(data.slot) ? [r.phones[data.slot]] : r.phones;
      for (const id of targets) if (id) io.to(id).emit('feedback', data);
    });
    socket.on('disconnect', () => leave(socket));
  });
  return { app, io, servers, addHttps(credentials) { const s = https.createServer(credentials, app); io.attach(s); servers.push(s); return s; } };
}

if (require.main === module) {
  const instance = createWorkshopServer(), port = Number(process.env.PORT || 3000);
  instance.servers[0].listen(port, '0.0.0.0', () => console.log(`ControllerKit · http://localhost:${port}/host`));
  instance.servers[0].on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is running the previous app. Stop it in its terminal, then run npm start; or set PORT to another port.` : error.message);
    process.exitCode = 1;
  });
  if (process.env.LOCAL_HTTPS !== '0') {
    const selfsigned = require('selfsigned'), folder = path.join(root, '.local'); fs.mkdirSync(folder, { recursive: true });
    const certPath = path.join(folder, 'cert.json'); let cert;
    try { cert = JSON.parse(fs.readFileSync(certPath, 'utf8')); } catch {}
    if (!cert) {
      const ips = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4').map(n => ({ type: 7, ip: n.address }));
      cert = selfsigned.generate([{ name: 'commonName', value: 'Air Slice local development' }], { keySize: 2048, algorithm: 'sha256', days: 365,
        extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, ...ips] }] });
      fs.writeFileSync(certPath, JSON.stringify({ private: cert.private, cert: cert.cert }));
    }
    const httpsPort = Number(process.env.HTTPS_PORT || 3443), secure = instance.addHttps({ key: cert.private, cert: cert.cert });
    secure.listen(httpsPort, '0.0.0.0', () => console.log(`Local HTTPS · https://localhost:${httpsPort}/host (accept the development certificate on each device)`));
    secure.on('error', error => console.error(`Local HTTPS: ${error.message}`));
  }
}
module.exports = { createWorkshopServer };
