// folderOrganizer — AI-powered file organization logic. Used by FolderOrganizer.jsx and ChatBot.jsx.

import { callClaude } from './claude';

const ORGANIZER_SYSTEM = `You are an expert file organization AI assistant integrated into the Taski desktop app. Analyze a list of files and assign each one to the best folder category.

Standard categories:
- Images           jpg jpeg png gif webp heic bmp svg tiff
- Images/Screenshots  PNG/JPG files with "screenshot", "screen", "capture" in name
- Images/Photos    HEIC files, or files with "photo", "img", "camera", "pic" in name
- Videos           mp4 mov avi mkv webm flv wmv
- Documents        pdf doc docx txt rtf odt
- Documents/Invoices  files with "invoice", "bill", "receipt", "statement" in name
- Documents/Reports   files with "report", "analysis", "summary" in name
- Spreadsheets     xls xlsx csv
- Presentations    ppt pptx key
- Audio            mp3 wav ogg flac m4a aac wma
- Archives         zip rar 7z tar gz bz2
- Installers       exe msi pkg deb appimage dmg iso
- Code             js ts py html css json jsx tsx java cpp c cs go rb php
- Design           psd ai fig sketch xd
- Fonts            ttf otf woff woff2
- Ebooks           epub mobi azw
- Others           anything that doesn't fit above

Rules:
- Use subcategory paths (e.g. "Images/Screenshots") only when the name clearly signals it
- Keep depth to maximum 2 levels
- Every file must get exactly one assignment
- Never suggest deleting files

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "moves": [
    { "file": "photo.jpg", "folder": "Images" },
    { "file": "screenshot.png", "folder": "Images/Screenshots" },
    { "file": "invoice.pdf", "folder": "Documents/Invoices" }
  ],
  "summary": "One sentence describing the overall organization plan."
}`;

// Sanitize a file name so it is safe to appear inside a JSON string value.
// Claude echoes the names back — this prevents unescaped characters from
// producing invalid JSON in the response.
function sanitizeName(name) {
  return name
    .replace(/\\/g, '/')          // backslash → forward slash
    .replace(/"/g, "'")           // double-quote → single-quote
    .replace(/[\n\r\t]/g, ' ')    // whitespace control chars → space
    .replace(/[\x00-\x1f]/g, '')  // strip remaining control chars
    .trim()
}

// Extract move pairs from Claude's response using multiple strategies.
// Returns an array of { file, folder } objects or null if nothing could be parsed.
function parseMoves(raw) {
  const stripped = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()

  // Strategy 1 — object with moves array: {"moves":[...],"summary":"..."}
  try {
    const m = stripped.match(/\{[\s\S]*\}/)
    if (m) {
      const parsed = JSON.parse(m[0])
      if (Array.isArray(parsed.moves) && parsed.moves.length > 0) {
        return { moves: parsed.moves, summary: parsed.summary || '' }
      }
      // Claude sometimes wraps the array in an extra object key
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) && val[0]?.file && val[0]?.folder) {
          return { moves: val, summary: '' }
        }
      }
    }
  } catch { /* fall through */ }

  // Strategy 2 — bare array: [{"file":"...","folder":"..."}]
  try {
    const m = stripped.match(/\[[\s\S]*\]/)
    if (m) {
      const arr = JSON.parse(m[0])
      if (Array.isArray(arr) && arr.length > 0 && arr[0]?.file) {
        return { moves: arr, summary: '' }
      }
    }
  } catch { /* fall through */ }

  // Strategy 3 — regex extraction (works even on truncated / malformed JSON).
  // Matches both {"file":"...","folder":"..."} and {"folder":"...","file":"..."} orderings.
  const moves = []
  const pattern = /["']file["']\s*:\s*["']((?:[^"'\\]|\\.)*)["']\s*,\s*["']folder["']\s*:\s*["']((?:[^"'\\]|\\.)*)["']/g
  const pattern2 = /["']folder["']\s*:\s*["']((?:[^"'\\]|\\.)*)["']\s*,\s*["']file["']\s*:\s*["']((?:[^"'\\]|\\.)*)["']/g
  let m
  while ((m = pattern.exec(stripped))  !== null) moves.push({ file: m[1], folder: m[2] })
  if (moves.length === 0) {
    while ((m = pattern2.exec(stripped)) !== null) moves.push({ file: m[2], folder: m[1] })
  }
  if (moves.length > 0) return { moves, summary: '' }

  return null
}

/**
 * analyzeAndPlanOrganization
 * Sends the file list to Claude and converts the response into a flat move plan.
 *
 * @param {Array<{name,path,type,extension,size,modified}>} files  - items from scan-folder
 * @param {string} folderPath  - the folder being organized (for context in prompt)
 * @returns {{ plan: Array<{fileName,sourcePath,targetFolder}>, summary: string }}
 */
export async function analyzeAndPlanOrganization(files, folderPath) {
  const fileOnly = files.filter((f) => f.type === 'file')

  // Build lookup maps using sanitized names (Claude echoes them back)
  const nameMap = new Map()   // sanitizedName → { originalName, sourcePath }
  for (const f of fileOnly) {
    const key = sanitizeName(f.name)
    if (!nameMap.has(key)) nameMap.set(key, { originalName: f.name, sourcePath: f.path })
  }

  const fileItems = fileOnly
    .map((f) => `${sanitizeName(f.name)} (${f.extension || 'no ext'}, ${f.size}KB)`)
    .join('\n')

  // 4096 tokens — enough for 100+ file assignments without truncation
  const raw = await callClaude(
    [{
      role:    'user',
      content: `Organize these ${fileOnly.length} files:\n${fileItems}`,
    }],
    { system: ORGANIZER_SYSTEM, maxTokens: 4096 },
  )

  const result = parseMoves(raw)
  if (!result || result.moves.length === 0) {
    throw new Error('Could not parse the AI organization plan. Please try again.')
  }

  // Resolve sanitized names back to originals
  const plan = []
  for (const m of result.moves) {
    if (!m.file || !m.folder) continue

    // Exact match first, then case-insensitive fallback
    let entry = nameMap.get(m.file)
    if (!entry) {
      const lower = m.file.toLowerCase()
      for (const [key, val] of nameMap) {
        if (key.toLowerCase() === lower) { entry = val; break }
      }
    }
    if (!entry) continue

    plan.push({
      fileName:     entry.originalName,
      sourcePath:   entry.sourcePath,
      targetFolder: m.folder,
    })
  }

  return { plan, summary: result.summary }
}

/**
 * groupByFolder
 * Converts the flat plan into a nested tree for the preview UI.
 *
 * @param {Array<{fileName,targetFolder}>} plan
 * @returns {{ [topFolder]: { count, files, subfolders: { [sub]: string[] } } }}
 */
export function groupByFolder(plan) {
  const groups = {}

  for (const item of plan) {
    const parts     = item.targetFolder.split('/')
    const topFolder = parts[0]

    if (!groups[topFolder]) {
      groups[topFolder] = { count: 0, files: [], subfolders: {} }
    }

    groups[topFolder].count++

    if (parts.length === 1) {
      groups[topFolder].files.push(item.fileName)
    } else {
      const sub = parts.slice(1).join('/')
      if (!groups[topFolder].subfolders[sub]) {
        groups[topFolder].subfolders[sub] = []
      }
      groups[topFolder].subfolders[sub].push(item.fileName)
    }
  }

  return groups
}

/**
 * generateOrganizeLog
 * Builds a human-readable text log of what was organized.
 */
export function generateOrganizeLog(plan, results, folderPath) {
  const lines = [
    'TASKI FILE ORGANIZER LOG',
    `Date:             ${new Date().toLocaleString()}`,
    `Folder:           ${folderPath}`,
    `Files organized:  ${results.moved}`,
    results.skipped ? `Files skipped:    ${results.skipped}` : '',
    '',
    'MOVES:',
    ...plan.map((item) => `  ${item.fileName}  →  ${item.targetFolder}/`),
  ].filter((l) => l !== undefined)

  if (results.errors && results.errors.length > 0) {
    lines.push('', 'ERRORS:')
    results.errors.forEach((e) => lines.push(`  ${e}`))
  }

  return lines.join('\n')
}
