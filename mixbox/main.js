// Mixbox DJ — Electron main process
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsc = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const AUDIO = /\.(mp3|wav|wave|aiff?|flac|m4a|aac|ogg|oga|opus|mp4)$/i;
let win = null;

function send(action) { if (win) win.webContents.send('menu', action); }

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Import Tracks…', accelerator: 'CmdOrCtrl+O', click: () => send('import-files') },
        { label: 'Import Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('import-folder') },
        { type: 'separator' },
        { label: 'Import rekordbox XML…', click: () => send('import-xml') },
        { label: 'Export rekordbox XML…', click: () => send('export-xml') },
        { type: 'separator' },
        { label: 'Phone Sync…', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('phone') },
        { label: 'Start/Stop Recording', accelerator: 'CmdOrCtrl+R', click: () => send('record') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { label: 'Audio Setup…', accelerator: 'CmdOrCtrl+,', click: () => send('audio') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }, { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: 'Keyboard Shortcuts', accelerator: 'F12', click: () => send('help') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1024, minHeight: 680,
    backgroundColor: '#0c0c0f', title: 'Mixbox DJ', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false, // keep audio/UI timing steady when the window is in the background
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; });
}

async function walk(dir, out, depth = 0) {
  if (depth > 12 || out.length > 20000) return out;
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out, depth + 1);
    else if (AUDIO.test(e.name)) out.push(p);
  }
  return out;
}

ipcMain.handle('read-file', async (_e, p) => {
  if (typeof p !== 'string' || !AUDIO.test(p)) return null;
  try { return await fs.readFile(p); } catch (e) { return null; }
});
ipcMain.handle('open-files', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import tracks', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'aif', 'aiff', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'mp4'] }] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('open-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import folder', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return walk(r.filePaths[0], []);
});
ipcMain.handle('open-xml', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import rekordbox XML', properties: ['openFile'], filters: [{ name: 'rekordbox XML', extensions: ['xml'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], text: await fs.readFile(r.filePaths[0], 'utf8') };
});
ipcMain.handle('save-file', async (_e, name, data) => {
  const r = await dialog.showSaveDialog(win, { title: 'Save recording', defaultPath: path.join(app.getPath('music'), name) });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, Buffer.from(data));
  return r.filePath;
});
ipcMain.handle('save-text', async (_e, name, text) => {
  const r = await dialog.showSaveDialog(win, { title: 'Export rekordbox XML', defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'XML', extensions: ['xml'] }] });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, text, 'utf8');
  return r.filePath;
});

/* ======================= Phone sync server ======================= */
// The phone app is served by this computer over the local network. The library
// itself lives in the renderer (IndexedDB), so API calls are relayed to it.
const SYNC = { server: null, port: 7777, pin: '', tokens: new Set(), clients: new Set(), pending: new Map(), seq: 0 };
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}
function rpc(method, args) {
  return new Promise((resolve, reject) => {
    if (!win) return reject(new Error('no window'));
    const id = ++SYNC.seq; SYNC.pending.set(id, { resolve, reject });
    win.webContents.send('sync-req', { id, method, args });
    setTimeout(() => { if (SYNC.pending.has(id)) { SYNC.pending.delete(id); reject(new Error('timeout')); } }, 20000);
  });
}
ipcMain.on('sync-res', (_e, { id, result, error }) => { const p = SYNC.pending.get(id); if (!p) return; SYNC.pending.delete(id); error ? p.reject(new Error(error)) : p.resolve(result); });
ipcMain.on('sync-changed', (_e, ver) => { for (const res of SYNC.clients) res.write(`data: ${JSON.stringify({ ver })}\n\n`); });

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = (req, limit = 5e6) => new Promise((ok, bad) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > limit) { bad(new Error('too large')); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c))); req.on('error', bad); });
const MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', wave: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', flac: 'audio/flac', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fsc.createReadStream(path.join(__dirname, 'app', 'mobile.html')).pipe(res);
  }
  if (p === '/api/login' && req.method === 'POST') {
    let body = {}; try { body = JSON.parse((await readBody(req)).toString()); } catch (e) {}
    if (String(body.pin || '') !== SYNC.pin) return json(res, 403, { error: 'Wrong PIN' });
    const t = crypto.randomBytes(18).toString('hex'); SYNC.tokens.add(t);
    if (win) win.webContents.send('menu', 'phone-connected');
    return json(res, 200, { token: t, name: os.hostname() });
  }
  const token = req.headers['x-mixbox-token'] || url.searchParams.get('t');
  if (!SYNC.tokens.has(token)) return json(res, 401, { error: 'Not paired' });
  try {
    if (p === '/api/library') return json(res, 200, await rpc('library'));
    if (p === '/api/ops' && req.method === 'POST') return json(res, 200, await rpc('ops', JSON.parse((await readBody(req)).toString())));
    if (p.startsWith('/api/wave/')) return json(res, 200, await rpc('wave', decodeURIComponent(p.slice(10))));
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n'); SYNC.clients.add(res);
      const ka = setInterval(() => res.write(': ka\n\n'), 25000);
      req.on('close', () => { clearInterval(ka); SYNC.clients.delete(res); });
      return;
    }
    if (p.startsWith('/api/audio/')) {
      const fp = await rpc('path', decodeURIComponent(p.slice(11)));
      if (!fp || !AUDIO.test(fp)) return json(res, 404, { error: 'No file' });
      const st = await fs.stat(fp), ext = fp.split('.').pop().toLowerCase(), type = MIME[ext] || 'application/octet-stream';
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (range) {
        const start = range[1] ? +range[1] : st.size - +range[2], end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
        res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        return fsc.createReadStream(fp, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
      return fsc.createReadStream(fp).pipe(res);
    }
    if (p === '/api/upload' && req.method === 'POST') {
      const name = path.basename(url.searchParams.get('name') || 'upload.mp3').replace(/[<>:"|?*\x00-\x1f]/g, '_');
      if (!AUDIO.test(name)) return json(res, 400, { error: 'Not an audio file' });
      const dir = path.join(app.getPath('music'), 'Mixbox Uploads'); await fs.mkdir(dir, { recursive: true });
      let dest = path.join(dir, name), i = 1;
      while (fsc.existsSync(dest)) dest = path.join(dir, name.replace(/(\.[^.]+)$/, ` (${i++})$1`));
      await new Promise((ok, bad) => { const w = fsc.createWriteStream(dest); req.pipe(w); w.on('finish', ok); w.on('error', bad); req.on('error', bad); });
      const r = await rpc('import', { path: dest, playlist: url.searchParams.get('playlist') || '' });
      return json(res, 200, r);
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
}
function startSync() {
  if (SYNC.server) return syncInfo();
  SYNC.pin = String(crypto.randomInt(0, 1e6)).padStart(6, '0'); SYNC.tokens.clear();
  SYNC.server = http.createServer((q, r) => handle(q, r).catch(e => { try { json(r, 500, { error: String(e) }); } catch (_) {} }));
  return new Promise(resolve => {
    const tryPort = port => {
      SYNC.server.once('error', err => { if (err.code === 'EADDRINUSE' && port < 7790) tryPort(port + 1); else resolve({ error: String(err.message) }); });
      SYNC.server.listen(port, '0.0.0.0', () => { SYNC.port = port; resolve(syncInfo()); });
    };
    tryPort(7777);
  });
}
function syncInfo() { return { running: !!SYNC.server, pin: SYNC.pin, port: SYNC.port, urls: lanAddresses().map(a => `http://${a}:${SYNC.port}`), clients: SYNC.clients.size }; }
function stopSync() { if (!SYNC.server) return syncInfo(); for (const c of SYNC.clients) c.end(); SYNC.clients.clear(); SYNC.server.close(); SYNC.server = null; SYNC.tokens.clear(); return syncInfo(); }
ipcMain.handle('sync-start', () => startSync());
ipcMain.handle('sync-stop', () => stopSync());
ipcMain.handle('sync-info', () => syncInfo());

app.whenReady().then(() => {
  // Allow listing/selecting audio output devices (needed for headphone cue routing).
  const ALLOW = ['media', 'speaker-selection', 'midi', 'midiSysex'];
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOW.includes(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ALLOW.includes(perm));
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
