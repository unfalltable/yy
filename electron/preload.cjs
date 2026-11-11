const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  nativeWindowControls: process.platform === 'win32',
  onBeforeClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('flush-before-close', listener);
    ipcRenderer.send('window', 'close-handler-ready');
    return () => ipcRenderer.removeListener('flush-before-close', listener);
  },
  closeReady: () => ipcRenderer.send('window', 'close-ready'),
  minimize: () => ipcRenderer.send('window', 'minimize'),
  maximize: () => ipcRenderer.send('window', 'maximize'),
  close: () => ipcRenderer.send('window', 'close'),
  saveKey: (key) => ipcRenderer.invoke('save-key', key),
  hasKey: () => ipcRenderer.invoke('has-key'),
  ai: (data) => ipcRenderer.invoke('ai', data),
  cancelAi: (id) => ipcRenderer.invoke('cancel-ai', id),
  extractDocument: (data) => ipcRenderer.invoke('extract-document', data),
  transcribe: (data) => ipcRenderer.invoke('transcribe', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  exportFile: (data) => ipcRenderer.invoke('export-file', data),
});
