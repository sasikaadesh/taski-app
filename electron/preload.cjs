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

  // Todos persistence
  loadTodos: ()       => ipcRenderer.invoke('load-todos'),
  saveTodos: (todos)  => ipcRenderer.invoke('save-todos', todos),

  // Quick todos persistence
  quickTodosLoad: ()        => ipcRenderer.invoke('quicktodos-load'),
  quickTodosSave: (todos)   => ipcRenderer.invoke('quicktodos-save', todos),

  // Chat history persistence
  chatsLoad:       ()                    => ipcRenderer.invoke('chats-load'),
  chatsSave:       (sessions)            => ipcRenderer.invoke('chats-save', sessions),
  chatsExportTxt:  (sessionId, text)     => ipcRenderer.invoke('chats-export-txt', sessionId, text),

  // System
  showNotification: (title, body)         => ipcRenderer.invoke('show-notification', title, body),
  loadSkills:       ()                    => ipcRenderer.invoke('load-skills'),
  saveImageBase64:  (base64, filename)    => ipcRenderer.invoke('save-image-base64', base64, filename),

  isElectron: true,
})
