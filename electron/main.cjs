// Electron main process — app window + all IPC file-system handlers.

const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = !app.isPackaged

// ── Safety: block OS system paths ────────────────────────────────────────────

const SYSTEM_PATH_FRAGMENTS = [
  'windows\\system32', 'windows\\syswow64', 'windows\\winsxs',
  'windows\\servicing', 'program files\\windowsapps',
  '/system', '/usr/bin', '/usr/sbin', '/bin', '/sbin',
  '/etc/init.d', '/boot', '/proc', '/sys',
]

function isSystemPath(folderPath) {
  const lower = path.normalize(folderPath).toLowerCase().replace(/\//g, '\\')
  return SYSTEM_PATH_FRAGMENTS.some((frag) => lower.includes(frag))
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width:     1400,
    height:    900,
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

// ── IPC: select-folder ────────────────────────────────────────────────────────

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title:      'Select folder to organize',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// ── IPC: scan-folder ──────────────────────────────────────────────────────────

ipcMain.handle('scan-folder', async (_event, folderPath) => {
  if (isSystemPath(folderPath)) {
    throw new Error('Access to system folders is blocked for your safety.')
  }

  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  const items   = []

  for (const entry of entries) {
    const isHidden = entry.name.startsWith('.')
    if (isHidden) continue

    const fullPath = path.join(folderPath, entry.name)
    let stat
    try { stat = fs.statSync(fullPath) } catch { continue }

    const isDir = entry.isDirectory()
    const ext   = isDir ? '' : path.extname(entry.name).toLowerCase().replace('.', '')

    items.push({
      name:      entry.name,
      path:      fullPath,
      type:      isDir ? 'folder' : 'file',
      extension: ext,
      size:      isDir ? 0 : Math.round(stat.size / 1024 * 10) / 10,
      modified:  stat.mtime.toISOString(),
      isHidden:  false,
    })
  }

  return items
})

// ── IPC: organize-folder ──────────────────────────────────────────────────────
// Accepts plan: [{ fileName, sourcePath, targetFolder }]
// Also accepts legacy format: [{ file, folder, sourcePath }]

ipcMain.handle('organize-folder', async (_event, plan) => {
  if (!plan || plan.length === 0) {
    return { success: true, moved: 0, skipped: 0, errors: [], moveLog: [] }
  }

  for (const item of plan) {
    if (isSystemPath(item.sourcePath)) {
      throw new Error(`Cannot organize files from a system path: ${item.sourcePath}`)
    }
  }

  const moved   = []
  const skipped = []
  const errors  = []
  const moveLog = []

  const baseFolder = path.dirname(plan[0].sourcePath)

  for (const item of plan) {
    // Support both new { fileName, targetFolder } and legacy { file, folder } shapes
    const fileName    = item.fileName    || item.file
    const targetFolder = item.targetFolder || item.folder
    const sourcePath  = item.sourcePath

    try {
      const targetDir = path.join(baseFolder, targetFolder)

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      let dest = path.join(targetDir, fileName)

      if (fs.existsSync(dest)) {
        const ext  = path.extname(fileName)
        const base = path.basename(fileName, ext)
        let counter = 2
        while (fs.existsSync(dest)) {
          dest = path.join(targetDir, `${base}_${counter}${ext}`)
          counter++
        }
      }

      fs.renameSync(sourcePath, dest)
      moved.push(fileName)
      moveLog.push({ from: sourcePath, to: dest })
    } catch (err) {
      if (err.code === 'ENOENT') {
        skipped.push(fileName)
      } else {
        errors.push(`${fileName}: ${err.message}`)
      }
    }
  }

  // Save JSON undo log
  if (moveLog.length > 0) {
    const logData = {
      date:           new Date().toISOString(),
      folder:         baseFolder,
      moves:          moveLog,
      filesOrganized: moved.length,
      foldersCreated: new Set(moveLog.map((m) => path.dirname(m.to))).size,
    }
    try {
      fs.writeFileSync(
        path.join(baseFolder, 'taski_organize_log.json'),
        JSON.stringify(logData, null, 2),
        'utf8',
      )
    } catch { /* non-fatal */ }
  }

  return { success: true, moved: moved.length, skipped: skipped.length, errors, moveLog }
})

// ── IPC: get-special-folders ──────────────────────────────────────────────────

ipcMain.handle('get-special-folders', async () => ({
  downloads: app.getPath('downloads'),
  documents: app.getPath('documents'),
  desktop:   app.getPath('desktop'),
  pictures:  app.getPath('pictures'),
  music:     app.getPath('music'),
  videos:    app.getPath('videos'),
  home:      app.getPath('home'),
}))

// ── IPC: get-downloads-path (backward compat) ─────────────────────────────────

ipcMain.handle('get-downloads-path', async () => app.getPath('downloads'))

// ── IPC: create-folder ────────────────────────────────────────────────────────

ipcMain.handle('create-folder', async (_event, folderPath) => {
  fs.mkdirSync(folderPath, { recursive: true })
  return { success: true, path: folderPath }
})

// ── IPC: get-folder-stats ─────────────────────────────────────────────────────

ipcMain.handle('get-folder-stats', async (_event, folderPath) => {
  if (isSystemPath(folderPath)) throw new Error('Access to system folders is blocked.')

  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  let totalFiles   = 0
  let totalFolders = 0
  let totalSizeKB  = 0
  let largestFile  = null
  let oldestFile   = null
  let newestFile   = null

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(folderPath, entry.name)
    let stat
    try { stat = fs.statSync(fullPath) } catch { continue }

    if (entry.isDirectory()) {
      totalFolders++
    } else {
      totalFiles++
      const sizeKB = Math.round(stat.size / 1024 * 10) / 10
      totalSizeKB += sizeKB

      if (!largestFile || sizeKB > largestFile.sizeKB) {
        largestFile = { name: entry.name, sizeKB }
      }
      const mtime = stat.mtime
      if (!oldestFile || mtime < new Date(oldestFile.modified)) {
        oldestFile = { name: entry.name, modified: mtime.toISOString() }
      }
      if (!newestFile || mtime > new Date(newestFile.modified)) {
        newestFile = { name: entry.name, modified: mtime.toISOString() }
      }
    }
  }

  return {
    totalFiles,
    totalFolders,
    totalSizeKB: Math.round(totalSizeKB * 10) / 10,
    largestFile,
    oldestFile,
    newestFile,
  }
})

// ── IPC: undo-organize ────────────────────────────────────────────────────────

ipcMain.handle('undo-organize', async (_event, moves) => {
  if (!moves || moves.length === 0) return { success: true, restored: 0, errors: [] }

  let restored = 0
  const errors = []

  for (const move of moves) {
    try {
      if (!fs.existsSync(move.to)) continue

      const destDir = path.dirname(move.from)
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

      let dest = move.from
      if (fs.existsSync(dest)) {
        const ext  = path.extname(move.from)
        const base = path.basename(move.from, ext)
        let counter = 2
        while (fs.existsSync(dest)) {
          dest = path.join(destDir, `${base}_${counter}${ext}`)
          counter++
        }
      }

      fs.renameSync(move.to, dest)
      restored++
    } catch (err) {
      errors.push(err.message)
    }
  }

  return { success: true, restored, errors }
})

// ── IPC: show-notification ────────────────────────────────────────────────────

ipcMain.handle('show-notification', async (_event, title, body) => {
  if (Notification.isSupported()) new Notification({ title, body }).show()
})

// ── IPC: save-image-base64 ────────────────────────────────────────────────────

ipcMain.handle('save-image-base64', async (_event, base64Data, filename) => {
  try {
    const buffer = Buffer.from(base64Data, 'base64')
    const { filePath, canceled } = await dialog.showSaveDialog({
      title:       'Save Generated Image',
      defaultPath: filename || `taski-imagen-${Date.now()}.png`,
      filters:     [
        { name: 'PNG Image',  extensions: ['png'] },
        { name: 'JPEG Image', extensions: ['jpg'] },
      ],
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    fs.writeFileSync(filePath, buffer)
    return { success: true, path: filePath }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// ── IPC: todos (load / save) ──────────────────────────────────────────────────

const TODOS_PATH = path.join(app.getPath('documents'), 'Taski', 'todos.json')

ipcMain.handle('load-todos', async () => {
  try {
    if (!fs.existsSync(TODOS_PATH)) return []
    const raw = fs.readFileSync(TODOS_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch { return [] }
})

ipcMain.handle('save-todos', async (_event, todos) => {
  try {
    const dir = path.dirname(TODOS_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(TODOS_PATH, JSON.stringify(todos, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ── IPC: quicktodos (load / save) ────────────────────────────────────────────

const TODOS_FILE = path.join(app.getPath('documents'), 'Taski', 'quicktodos.json')

ipcMain.handle('quicktodos-load', async () => {
  try {
    if (!fs.existsSync(TODOS_FILE)) return []
    const raw = fs.readFileSync(TODOS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch (e) { return [] }
})

ipcMain.handle('quicktodos-save', async (_event, todos) => {
  try {
    const dir = path.dirname(TODOS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2))
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── IPC: chats (load / save / export) ────────────────────────────────────────

const CHATS_FILE = path.join(app.getPath('documents'), 'Taski', 'chats.json')

ipcMain.handle('chats-load', async () => {
  try {
    if (!fs.existsSync(CHATS_FILE)) return []
    const raw = fs.readFileSync(CHATS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch (e) { return [] }
})

ipcMain.handle('chats-save', async (_event, sessions) => {
  try {
    const dir = path.dirname(CHATS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CHATS_FILE, JSON.stringify(sessions, null, 2))
    return { success: true }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('chats-export-txt', async (_event, sessionId, text) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title:       'Export Chat',
      defaultPath: `taski-chat-${sessionId}.txt`,
      filters: [
        { name: 'Text', extensions: ['txt'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    })
    if (canceled || !filePath) return { canceled: true }
    fs.writeFileSync(filePath, text)
    return { success: true, path: filePath }
  } catch (e) { return { success: false, error: e.message } }
})

// ── IPC: load-skills ──────────────────────────────────────────────────────────

ipcMain.handle('load-skills', async () => {
  const skillsPath = path.join(__dirname, '../skills')
  if (!fs.existsSync(skillsPath)) return []
  const files = fs.readdirSync(skillsPath).filter((f) => f.endsWith('.md'))
  return files.map((file) => {
    const content = fs.readFileSync(path.join(skillsPath, file), 'utf-8')
    return { file, content }
  })
})
