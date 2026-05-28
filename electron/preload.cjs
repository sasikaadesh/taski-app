// Preload — secure bridge between the React renderer and Node.js via contextBridge.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('taskiAPI', {
  // Folder selection
  selectFolder:      ()           => ipcRenderer.invoke('select-folder'),
  getSpecialFolders: ()           => ipcRenderer.invoke('get-special-folders'),
  getDownloadsPath:  ()           => ipcRenderer.invoke('get-downloads-path'),

  // File operations
  scanFolder:     (folderPath) => ipcRenderer.invoke('scan-folder',      folderPath),
  organizeFolder: (plan)       => ipcRenderer.invoke('organize-folder',  plan),
  undoOrganize:   (log)        => ipcRenderer.invoke('undo-organize',    log),
  createFolder:   (folderPath) => ipcRenderer.invoke('create-folder',    folderPath),
  getFolderStats: (folderPath) => ipcRenderer.invoke('get-folder-stats', folderPath),

  // System
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),

  isElectron: true,
})
