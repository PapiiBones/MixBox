// Mixbox DJ — preload bridge (exposes a small, safe API to the page as window.mixbox)
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mixbox', {
  desktop: true,
  platform: process.platform,
  readFile: p => ipcRenderer.invoke('read-file', p),
  openFiles: () => ipcRenderer.invoke('open-files'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  openXML: () => ipcRenderer.invoke('open-xml'),
  saveFile: (name, data) => ipcRenderer.invoke('save-file', name, data),
  saveText: (name, text) => ipcRenderer.invoke('save-text', name, text),
  pathFor: file => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  onMenu: cb => ipcRenderer.on('menu', (_e, action) => cb(action)),
  syncStart: () => ipcRenderer.invoke('sync-start'),
  syncStop: () => ipcRenderer.invoke('sync-stop'),
  syncInfo: () => ipcRenderer.invoke('sync-info'),
  syncChanged: ver => ipcRenderer.send('sync-changed', ver),
  onSyncRequest: handler => ipcRenderer.on('sync-req', async (_e, { id, method, args }) => {
    try { ipcRenderer.send('sync-res', { id, result: await handler(method, args) }); }
    catch (err) { ipcRenderer.send('sync-res', { id, error: String((err && err.message) || err) }); }
  }),
});
