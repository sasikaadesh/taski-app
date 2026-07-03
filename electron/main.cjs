// Electron main process — app window + all IPC file-system handlers.

const { app, BrowserWindow, ipcMain, dialog, Notification, session, shell } = require('electron')
const path  = require('path')
const fs    = require('fs')
const { spawn } = require('child_process')

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
      preload:                     path.join(__dirname, 'preload.cjs'),
      contextIsolation:            true,
      nodeIntegration:             false,
      webSecurity:                 false,
      allowRunningInsecureContent: true,
      experimentalFeatures:        true,
    },
  })

  win.on('enter-full-screen', () => {
    win.webContents.send('fullscreen-changed', true)
  })
  win.on('leave-full-screen', () => {
    win.webContents.send('fullscreen-changed', false)
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Electron reports navigator.onLine as false even with real internet, which
  // causes Chrome's Web Speech API to throw a spurious 'network' error.
  // Override it so the browser always sees itself as online.
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      Object.defineProperty(navigator, 'onLine', {
        get: function() { return true; },
        configurable: true
      });
    `).catch(() => {});
  })

  return win
}

app.whenReady().then(() => {
  // Allow all content in iframes (CDN scripts, fonts, etc.)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
        ],
      },
    })
  })

  // Allow microphone / media permissions (required for Web Speech API in Electron)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'mediaKeySystem']
    callback(allowed.includes(permission))
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture']
    return allowed.includes(permission)
  })

  // Spoof Origin header so Google's speech endpoint accepts the request from Electron
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        'Origin': 'https://www.google.com',
      },
    })
  })

  const mainWindow = createWindow()

  // Also grant permissions on the window's own session (belt-and-suspenders)
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true)
  })

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

// ── IPC: open-external ───────────────────────────────────────────────────────

ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url)
  }
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

// ── IPC: download-website ─────────────────────────────────────────────────────

ipcMain.handle('download-website', async (_event, { html, projectName, singleFile }) => {
  const safeName = (projectName || 'taski-website')
    .replace(/[^a-z0-9\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'taski-website'

  if (singleFile) {
    // Save as a single self-contained HTML file — open in any browser, no setup needed
    const { filePath, canceled } = await dialog.showSaveDialog({
      title:       'Save Website',
      defaultPath: safeName + '.html',
      buttonLabel: 'Save HTML',
      filters:     [{ name: 'HTML File', extensions: ['html'] }],
    })
    if (canceled || !filePath) return { canceled: true }
    fs.writeFileSync(filePath, html, 'utf-8')
    return { success: true, path: filePath }
  }

  // Multi-file project folder (legacy / multi-page support)
  const { filePath, canceled } = await dialog.showSaveDialog({
    title:       'Save Website Project Folder',
    defaultPath: safeName,
    buttonLabel: 'Save Project',
    properties:  ['createDirectory'],
  })
  if (canceled || !filePath) return { canceled: true }

  const projectDir = filePath
  fs.mkdirSync(projectDir, { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'index.html'), html, 'utf-8')
  fs.writeFileSync(path.join(projectDir, 'README.md'),
    `# ${projectName || 'Taski Website'}\n\nGenerated by Taski UI/UX Pro Max · Powered by Claude AI + GSAP\n\n## Quick Open\n\nDouble-click **index.html** to open in any browser — no build step needed.\n\n## Deploy\n\nDrop the index.html file onto any web host (Netlify, Vercel, GitHub Pages).\n`)

  return { success: true, path: projectDir }
})

// ── IPC: window fullscreen ────────────────────────────────────────────────────

ipcMain.handle('window-fullscreen', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) win.setFullScreen(true)
})

ipcMain.handle('window-restore', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.setFullScreen(false)
    win.restore()
  }
})

ipcMain.handle('window-get-fullscreen', () => {
  const win = BrowserWindow.getFocusedWindow()
  return win ? win.isFullScreen() : false
})

// ── Helper: read Vite env vars not exposed to Electron main process ───────────

function readDotEnv(name) {
  if (process.env[name]) return process.env[name]
  try {
    const envPath = path.join(app.getAppPath(), '.env')
    const content = fs.readFileSync(envPath, 'utf-8')
    const match   = content.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm'))
    if (match) return match[1].trim().replace(/['"]/g, '')
  } catch { /* .env not found */ }
  return null
}

async function exchangeCodeForTokens(code, redirectUri, clientId, clientSecret) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }).toString(),
  })
  const tokens = await response.json()
  if (tokens.error) return { success: false, error: tokens.error_description || tokens.error }
  return {
    success:      true,
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn:    tokens.expires_in,
    scope:        tokens.scope,
  }
}

// ── IPC: Google OAuth ─────────────────────────────────────────────────────────

ipcMain.handle('google-auth-start', async () => {
  const clientId     = readDotEnv('VITE_GOOGLE_CLIENT_ID')
  const clientSecret = readDotEnv('VITE_GOOGLE_CLIENT_SECRET')
  if (!clientId)     return { success: false, error: 'VITE_GOOGLE_CLIENT_ID not set in .env' }
  if (!clientSecret) return { success: false, error: 'VITE_GOOGLE_CLIENT_SECRET not set in .env' }

  const redirectUri = 'http://localhost:5173/auth/callback'
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' ')

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         scopes,
    access_type:   'offline',
    prompt:        'consent',
  })

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString()

  const authWindow = new BrowserWindow({
    width:  500,
    height: 650,
    show:   true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
    title:           'Sign in to Google',
    autoHideMenuBar: true,
  })

  authWindow.loadURL(authUrl)

  return new Promise((resolve) => {
    // 'done' must be set to true BEFORE close() is called — otherwise the 'closed'
    // event fires synchronously and resolves the promise with a failure before
    // exchangeCodeForTokens() has a chance to complete.
    let done = false

    function handleCallback(url) {
      try {
        if (!url.startsWith('http://localhost:5173/auth/callback')) return
        if (done) return
        done = true  // lock out the 'closed' handler immediately

        const urlObj = new URL(url)
        const code   = urlObj.searchParams.get('code')
        const error  = urlObj.searchParams.get('error')

        if (!authWindow.isDestroyed()) authWindow.close()

        if (error) {
          resolve({ success: false, error })
          return
        }
        if (code) {
          exchangeCodeForTokens(code, redirectUri, clientId, clientSecret)
            .then(resolve)
            .catch((err) => resolve({ success: false, error: err.message }))
        } else {
          resolve({ success: false, error: 'No auth code received' })
        }
      } catch (e) {
        console.error('[google-auth] callback parse error:', e.message)
      }
    }

    authWindow.webContents.on('will-redirect', (_e, url) => handleCallback(url))
    authWindow.webContents.on('will-navigate',  (_e, url) => handleCallback(url))
    authWindow.webContents.on('did-navigate',   (_e, url) => handleCallback(url))
    authWindow.on('closed', () => {
      if (!done) resolve({ success: false, error: 'Window closed by user' })
    })
  })
})

ipcMain.handle('google-auth-exchange', async (_event, { code, redirectUri }) => {
  const clientId     = readDotEnv('VITE_GOOGLE_CLIENT_ID')
  const clientSecret = readDotEnv('VITE_GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return { success: false, error: 'Missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_SECRET in .env' }
  }
  try {
    return await exchangeCodeForTokens(code, redirectUri, clientId, clientSecret)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('google-auth-refresh', async (_event, refreshToken) => {
  const clientId     = readDotEnv('VITE_GOOGLE_CLIENT_ID')
  const clientSecret = readDotEnv('VITE_GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return { success: false, error: 'Missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_SECRET in .env' }
  }
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
      }).toString(),
    })
    const tokens = await response.json()
    if (tokens.error) return { success: false, error: tokens.error_description || tokens.error }
    return {
      success:     true,
      accessToken: tokens.access_token,
      expiresIn:   tokens.expires_in,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
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

// ── RAG helpers ───────────────────────────────────────────────────────────────

function getRagScript() {
  // Look for rag.py next to the project root (works in dev and packaged)
  const candidates = [
    path.join(app.getAppPath(), 'rag.py'),
    path.join(__dirname, '../rag.py'),
    path.join(process.cwd(), 'rag.py'),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

function getPythonExecutables() {
  return process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python']
}

function runPython(event, args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const ragScript = getRagScript()
    if (!ragScript) {
      resolve({ error: 'rag.py not found. Make sure it is in the project root directory.' })
      return
    }

    const apiKey = readDotEnv('VITE_ANTHROPIC_API_KEY') || ''
    const pythons = getPythonExecutables()
    let tried = 0

    function tryNext() {
      if (tried >= pythons.length) {
        resolve({ error: 'Python not found. Install Python from python.org and try again.' })
        return
      }
      const python = pythons[tried++]

      const proc = spawn(python, [ragScript, ...args], {
        env: { ...process.env, ANTHROPIC_API_KEY: apiKey, PYTHONUNBUFFERED: '1' },
        cwd: path.dirname(ragScript),
      })

      let lastJson = ''
      let stderr   = ''
      const timer  = setTimeout(() => { proc.kill(); resolve({ error: 'Python process timed out.' }) }, timeoutMs)

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          const t = line.trim()
          if (!t) continue
          try {
            const parsed = JSON.parse(t)
            if (parsed.progress) {
              event?.sender?.send('rag-progress', parsed)
            } else {
              lastJson = t
            }
          } catch { /* not JSON — ignore */ }
        }
      })

      proc.stderr.on('data', (data) => { stderr += data.toString() })

      proc.on('error', () => tryNext())

      proc.on('close', (code) => {
        clearTimeout(timer)
        if (lastJson) {
          try { resolve(JSON.parse(lastJson)); return } catch { /* fall through */ }
        }
        if (stderr.includes('ModuleNotFoundError') || stderr.includes('No module named')) {
          resolve({ error: 'Python packages missing. Run: pip install anthropic chromadb pypdf' })
        } else if (code !== 0) {
          resolve({ error: stderr.trim() || `Python exited with code ${code}` })
        } else {
          resolve({ error: 'No output from rag.py' })
        }
      })
    }

    tryNext()
  })
}

// ── IPC: rag-open-files ───────────────────────────────────────────────────────

ipcMain.handle('rag-open-files', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title:      'Select Documents for Knowledge Base',
    filters:    [{ name: 'Documents', extensions: ['pdf', 'txt', 'md'] }],
    properties: ['openFile', 'multiSelections'],
  })
  if (canceled) return { canceled: true }
  return { filePaths }
})

// ── IPC: rag-ingest ───────────────────────────────────────────────────────────

ipcMain.handle('rag-ingest', async (event, filePaths) => {
  return runPython(event, ['--ingest', '--files', filePaths.join(',')])
})

// ── IPC: rag-ask ──────────────────────────────────────────────────────────────

ipcMain.handle('rag-ask', async (event, question) => {
  return runPython(event, ['--ask', question])
})

// ── IPC: rag-status ───────────────────────────────────────────────────────────

ipcMain.handle('rag-status', async (event) => {
  return runPython(event, ['--status'])
})

// ── IPC: rag-list ─────────────────────────────────────────────────────────────

ipcMain.handle('rag-list', async (event) => {
  return runPython(event, ['--list'])
})

// ── IPC: rag-delete ───────────────────────────────────────────────────────────

ipcMain.handle('rag-delete', async (event, filename) => {
  return runPython(event, ['--delete', filename])
})

// ── IPC: save-and-open-html ───────────────────────────────────────────────────

ipcMain.handle('save-and-open-html', async (_event, html, filename) => {
  try {
    const tmpPath = path.join(app.getPath('temp'), filename || 'taski-website.html')
    fs.writeFileSync(tmpPath, html, 'utf-8')
    await shell.openExternal('file:///' + tmpPath.replace(/\\/g, '/'))
    return { success: true, path: tmpPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ── IPC: website archive ──────────────────────────────────────────────────────

const WEBSITES_DIR   = path.join(app.getPath('documents'), 'Taski', 'websites')
const WEBSITES_INDEX = path.join(WEBSITES_DIR, 'index.json')

function ensureWebsitesDir() {
  if (!fs.existsSync(WEBSITES_DIR)) fs.mkdirSync(WEBSITES_DIR, { recursive: true })
}

function readWebsiteIndex() {
  try {
    if (fs.existsSync(WEBSITES_INDEX)) return JSON.parse(fs.readFileSync(WEBSITES_INDEX, 'utf-8'))
  } catch (e) {}
  return []
}

function writeWebsiteIndex(index) {
  fs.writeFileSync(WEBSITES_INDEX, JSON.stringify(index, null, 2), 'utf-8')
}

ipcMain.handle('websites-save', async (_event, { html, prompt, name }) => {
  try {
    ensureWebsitesDir()
    const id       = 'site_' + Date.now()
    const filename = id + '.html'
    const filepath = path.join(WEBSITES_DIR, filename)
    fs.writeFileSync(filepath, html, 'utf-8')

    const siteName = name ||
      (prompt || '').split(' ').slice(0, 5).join(' ').substring(0, 40) +
      ((prompt || '').length > 40 ? '...' : '')

    const entry = {
      id,
      name:        siteName || 'Untitled Site',
      prompt:      prompt || '',
      heroType:    data.heroType || 'normal',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      filename,
      size:        html.length,
      previewText: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 150).trim(),
    }

    const index = readWebsiteIndex()
    index.unshift(entry)
    writeWebsiteIndex(index)
    return { success: true, id, entry }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('websites-list', async () => {
  try {
    return { success: true, sites: readWebsiteIndex() }
  } catch (e) {
    return { success: true, sites: [] }
  }
})

ipcMain.handle('websites-load', async (_event, id) => {
  try {
    const index = readWebsiteIndex()
    const entry = index.find((s) => s.id === id)
    if (!entry) return { success: false, error: 'Not found' }
    const filepath = path.join(WEBSITES_DIR, entry.filename)
    const html     = fs.readFileSync(filepath, 'utf-8')
    return { success: true, html, entry }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('websites-delete', async (_event, id) => {
  try {
    const index = readWebsiteIndex()
    const entry = index.find((s) => s.id === id)
    if (entry) {
      const filepath = path.join(WEBSITES_DIR, entry.filename)
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath)
      writeWebsiteIndex(index.filter((s) => s.id !== id))
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('websites-rename', async (_event, { id, name }) => {
  try {
    const index = readWebsiteIndex()
    const entry = index.find((s) => s.id === id)
    if (entry) {
      entry.name      = name
      entry.updatedAt = new Date().toISOString()
      writeWebsiteIndex(index)
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('websites-update', async (_event, { id, html, prompt }) => {
  try {
    ensureWebsitesDir()
    const index = readWebsiteIndex()
    const entry = index.find((s) => s.id === id)
    if (!entry) return { success: false, error: 'Not found' }
    const filepath = path.join(WEBSITES_DIR, entry.filename)
    fs.writeFileSync(filepath, html, 'utf-8')
    entry.updatedAt = new Date().toISOString()
    entry.size      = html.length
    if (prompt) entry.prompt = prompt
    writeWebsiteIndex(index)
    return { success: true, entry }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('websites-open-folder', async () => {
  ensureWebsitesDir()
  shell.openPath(WEBSITES_DIR)
  return { success: true }
})
