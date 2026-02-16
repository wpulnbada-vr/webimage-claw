const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDownloads: () => ipcRenderer.invoke('open-downloads'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  getDownloadsDir: () => ipcRenderer.invoke('get-downloads-dir'),
});
