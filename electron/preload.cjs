const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shuoxiWindow', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  loadSyncQueue: () => ipcRenderer.invoke('queue:load'),
  getBalance: (payload) => ipcRenderer.invoke('billing:balance', payload),
  saveSyncQueue: (payload) => ipcRenderer.sendSync('queue:save-sync', payload),
  onMaximizeChange: (callback) => {
    const handler = (_event, value) => callback(Boolean(value))
    ipcRenderer.on('window:maximized-changed', handler)
    return () => ipcRenderer.removeListener('window:maximized-changed', handler)
  },
})
