// Electron main process — creates the app window and handles all IPC file-system calls.

const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  1200,
    minHeight: 800,
    backgroundColor: '#050a0e',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: scan-folder ──────────────────────────────────────────────────────────

ipcMain.handle('scan-folder', async (_event, folderPath) => {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  const files   = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue   // skip hidden
    if (entry.isDirectory())        continue   // skip subdirs

    const fullPath = path.join(folderPath, entry.name)
    const stat     = fs.statSync(fullPath)
    const ext      = path.extname(entry.name).toLowerCase().replace('.', '')

    files.push({
      name:         entry.name,
      extension:    ext,
      sizeKB:       Math.round(stat.size / 1024),
      lastModified: stat.mtime.toISOString(),
      path:         fullPath,
    })
  }

  return files
})

// ── IPC: organize-folder ──────────────────────────────────────────────────────

ipcMain.handle('organize-folder', async (_event, plan) => {
  if (!plan || plan.length === 0) return { success: true, moved: 0, errors: [] }

  const baseFolder = path.dirname(plan[0].sourcePath)
  const moved      = []
  const errors     = []
  const logLines   = [`Taski File Organization Log — ${new Date().toISOString()}\n`]

  for (const item of plan) {
    const targetDir = path.join(baseFolder, item.folder)

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      let dest = path.join(targetDir, item.file)

      // Handle duplicate file names
      if (fs.existsSync(dest)) {
        const ext  = path.extname(item.file)
        const base = path.basename(item.file, ext)
        let counter = 2
        while (fs.existsSync(dest)) {
          dest = path.join(targetDir, `${base}_${counter}${ext}`)
          counter++
        }
      }

      fs.renameSync(item.sourcePath, dest)
      moved.push(item.file)
      logLines.push(`MOVED: ${item.file} → ${item.folder}/`)
    } catch (err) {
      errors.push({ file: item.file, error: err.message })
      logLines.push(`ERROR: ${item.file} — ${err.message}`)
    }
  }

  // Write log file into the organized folder
  try {
    const logPath = path.join(baseFolder, 'organize_log.txt')
    fs.writeFileSync(logPath, logLines.join('\n'), 'utf8')
  } catch { /* non-fatal */ }

  return { success: true, moved: moved.length, errors }
})

// ── IPC: select-folder ────────────────────────────────────────────────────────

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title:      'Select folder to organize',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// ── IPC: get-downloads-path ───────────────────────────────────────────────────

ipcMain.handle('get-downloads-path', async () => {
  return app.getPath('downloads')
})

// ── IPC: show-notification ────────────────────────────────────────────────────

ipcMain.handle('show-notification', async (_event, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
})
