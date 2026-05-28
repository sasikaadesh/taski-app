// Preload — secure bridge between the React renderer and Node.js via contextBridge.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('taskiAPI', {
  // File system
  scanFolder:     (folderPath) => ipcRenderer.invoke('scan-folder',      folderPath),
  organizeFolder: (plan)       => ipcRenderer.invoke('organize-folder',  plan),
  selectFolder:   ()           => ipcRenderer.invoke('select-folder'),
  getDownloadsPath: ()         => ipcRenderer.invoke('get-downloads-path'),

  // System
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),

  isElectron: true,
})
