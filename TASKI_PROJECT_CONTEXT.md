# TASKI APP — Project Context File
> Paste this at the start of every new Claude Code or Claude chat session
> Last updated: July 2026

---

## What is Taski?
A personal AI productivity **Electron desktop app** (React 18 + Vite + Electron).  
Think Jarvis/Iron Man HUD — dark Tron theme, floating panels, voice control.  
GitHub: `sasikaadesh/taski-app` | Branch: `dev` | Run: `npm run electron:dev`

---

## Tech Stack
- **Frontend:** React 18 + Vite
- **Desktop:** Electron (NOT a web app — Electron features matter)
- **Styling:** Tron/Jarvis dark theme (see Design System below)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514)
- **Voice Input:** MediaRecorder + OpenAI Whisper (Web Speech API broken in Electron)
- **Voice Output:** TTS via ttsManager.js (OpenAI TTS or Web Speech fallback)
- **Auth:** Google OAuth2 with refresh tokens (Electron popup window)

---

## Environment Variables (.env)
```
VITE_ANTHROPIC_API_KEY=
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_SECRET=
VITE_GOOGLE_AI_API_KEY=       # AI Studio key for Imagen/Gemini
VITE_OPENAI_API_KEY=          # Whisper voice input + OpenAI TTS output
VITE_TELEGRAM_BOT_TOKEN=
```

---

## Project File Structure
```
taski-app/
├── rag.py                        # Python RAG system (ChromaDB + Claude)
├── skills/                       # 22 slash command skill .md files
├── electron/
│   ├── main.js                   # IPC handlers, OAuth, file system, TTS bridge
│   └── preload.js                # contextBridge API (window.taskiAPI)
└── src/
    ├── components/
    │   ├── ChatPanel.jsx          # Main chatbot UI (floating, draggable)
    │   ├── CalendarTasksPanel.jsx # Google Calendar events (floating, draggable)
    │   ├── QuickTodoList.jsx      # Todo list (floating, draggable)
    │   ├── JarvisVisualizer.jsx   # Central animated HUD rings
    │   ├── WebsiteGeneratorPanel.jsx # AI website builder
    │   ├── RAGPanel.jsx           # Knowledge base UI
    │   └── ChatMessage.jsx        # Markdown-rendered chat messages
    ├── lib/
    │   ├── claude.js              # callClaude() — main Claude API function
    │   ├── ttsManager.js          # Text-to-speech (OpenAI TTS + Web Speech)
    │   ├── googleAuth.js          # OAuth refresh token manager
    │   ├── calendarService.js     # Google Calendar API (getTodayEvents etc)
    │   ├── gmail.js               # Gmail API with buildGmailQuery()
    │   ├── morningBriefing.js     # Weather + calendar + todos + email briefing
    │   ├── websiteGenerator.js    # AI website generation (Claude API)
    │   ├── mcpFileService.js      # MCP filesystem integration
    │   ├── n8nTodoSync.js         # N8N webhook todo sync
    │   ├── ambientSound.js        # Background music singleton (single source of truth, emits 'taski-ambient-changed')
    │   └── researchMode.js        # Deep research system prompt
    └── hooks/
        ├── useDraggable.js        # Draggable panel hook (saves position)
        ├── useSpeechRecognition.js # MediaRecorder + Whisper
        └── useTodos.js            # Todo CRUD with JSON file persistence
```

---

## Claude Subagents (`.claude/agents/`)
Two Claude Code subagents auto-delegate for specialized work (markdown definitions only — no app code):
- **website-generator-expert** — triggers on any change to the `/website` builder pipeline: `websiteGenerator.js`, generated Next.js output, content JSON schema (site/hero/sections), scaffold templates, semantic theming, self-check, or iterate mode. Tools: Read/Grep/Glob/Edit (no Bash — never runs builds).
- **hero-library-curator** — triggers when adding/converting a 21st.dev hero, editing `src/lib/heroLibrary/catalog.json`, or auditing `heroes/*.jsx.txt`. Enforces the Phase 2 conversion contract (strip deps, CSS-only motion, semantic theme classes, props-driven copy, honest catalog entry + author credit) and STOPS instead of silently stripping unconvertible effects. Tools: Read/Grep/Glob/Edit/WebFetch.

---

## Key Architecture Decisions

### Chatbot Message Routing (5 routes in order)
```
processMessage(userMessage) {
  1. if isResearchRequest → DEEP RESEARCH (10 web searches, structured output)
  2. if webSearchMode ON  → WEB SEARCH (Claude + web_search tool)
  3. if isEmailQuery      → GMAIL API
  4. if isCalendarQuery   → GOOGLE CALENDAR API
  5. if isAmbiguousQuery  → Ask user (3 choice buttons)
  default                 → Normal Claude API chat
}
```

### TTS System
- **ttsManager.js** is the single source of truth
- Prefers OpenAI TTS (`tts-1`, voice: `onyx`) if `VITE_OPENAI_API_KEY` exists
- Falls back to Web Speech API
- Storage key: `localStorage['taski_tts_enabled']` (true = unmuted)
- Events: `taski-tts-changed`, `taski-tts-speaking`
- **Removed (July 2026):** the `taski-audio-pause`/`taski-audio-resume` events and the `audioPausedBySystem` flag are gone. Only the STOP button, the mute toggle, or a new reply stops speech — nothing else may.

### Voice Input
- Web Speech API is **permanently broken** in Electron (Google shutdown)
- Uses `MediaRecorder` → sends `.ogg` to OpenAI Whisper API
- Header in Whisper call: `anthropic-dangerous-direct-browser-access: true`
- Auto-submits after 3-second countdown with CANCEL option

### Google OAuth
- Opens Electron BrowserWindow popup (NOT system browser)
- Intercepts redirect to `localhost:5173/auth/callback`
- Refresh token saved to localStorage permanently
- Silent refresh every 45 minutes via `getValidToken()`

### Floating Panels
- All 3 panels (Chat, Calendar, Todo) are freely draggable
- Use `useDraggable` hook — positions saved to localStorage
- Default state: Calendar and Todo COLLAPSED, Chat EXPANDED
- Auto-expand via custom events: `taski-panel-expand`
- Header buttons: `[−]` collapse, `[+]` create new item

---

## Features Completed

### Core Chat
- Claude API with markdown rendering (Tron-styled CSS)
- Web search via Claude's native `web_search_20250305` tool
- Deep Research Mode (multi-source, structured output, 10 searches)
- Skill system: 22 slash commands (`/youtube`, `/essay`, `/research` etc)
- Skills + web search can combine simultaneously
- Ambiguous queries ask user: Email / Calendar / Claude buttons

### Google Integrations
- **Gmail:** search, read, smart keyword detection
- **Calendar:** read/write events, week pagination, date-range queries
- Both show correct data for today/tomorrow/this week/next week

### Voice
- **Input:** MediaRecorder → Whisper transcription → auto-submit
- **Output:** ttsManager (OpenAI TTS preferred) speaks every reply
- TASKI SPEAKING banner with equalizer animation
- ⏹ STOP button while speaking
- 🔊/🔇 toggle in chat header

### Panels
- **Calendar Tasks:** week view with `[‹][›]` navigation, add events, compact rows
- **Todo List:** day view with `[‹][›]` navigation (yesterday/today/tomorrow)
- Both panels: drag anywhere, collapse/expand, `[−][+]` buttons

### Morning Briefing
- Trigger: "morning briefing", "good morning", "start my day"
- Fetches: weather (wttr.in), calendar events, todos, important emails in parallel
- Auto-runs once per day between 6am–11am
- 🌅 button in header triggers manually

### RAG Knowledge Base
- `rag.py` runs as Python subprocess via Electron IPC
- ChromaDB + local embeddings (all-MiniLM-L6-v2, ~22MB first run)
- Supports PDF, TXT, MD
- 📎 upload button in chat input + drag-and-drop
- Sources cited below responses with ⚡ MCP tag
- Requires: `pip install anthropic chromadb pypdf`

### Website Generator (`/website`)
- Full-screen overlay with left panel (controls) + right panel (preview)
- **Hero types:** Static (Unsplash bg) / Carousel (4 slides) / 3D Motion (Canvas particles)
- **Themes:** 8 presets + custom color picker
- **Contact section:** optional with form + details
- Single prompt box for both generate and iterate (UPDATE mode)
- **Archive:** auto-saves to `Documents/Taski/websites/` via IPC
- **Export:** ZIP (index.html + style.css + script.js + README) via JSZip
- **Export PNG:** html2canvas screenshot
- **Fullscreen preview:** Escape to exit
- Sound toggle (🔊/🔇) in generator header = TTS only (not ambient)

### Ambient Music
- `ambientSound.js` singleton — independent from TTS, single source of truth for playback state
- Emits `taski-ambient-changed` on every transition; buttons subscribe via `useAmbientPlaying()` hook (never local guessed state)
- AMBIENT ▐▐/▶ button + volume slider in header; own ▶/❚❚ AMBIENT button in the website generator top bar
- Does NOT pause when website generator opens

### N8N Integration
- ⚡ WORKFLOWS button in footer
- Webhook-based: Taski calls N8N → N8N does automation → returns result
- Todo list syncs to N8N webhook → Google Sheets
- Workflow detection from chat phrases

### Telegram Bot
- Polls Telegram API every 3 seconds
- Voice messages → Whisper transcription → Taski pipeline → reply
- TG status indicator in footer (green dot, message count)
- All routes work: calendar, email, briefing, Claude chat

### MCP Filesystem
- `/files` slash skill using `@modelcontextprotocol/server-filesystem`
- Claude reads/organizes actual files on computer via MCP
- ⚡ MCP ACTIVE badge while running
- `npm install -g @modelcontextprotocol/server-filesystem`

### Imagen / Image Generation
- Nano Banana (gemini-2.5-flash-image) — FREE
- Pollinations.ai fallback
- `/imagen` slash command

---

## Design System (Tron Dark Theme)
```css
--color-bg-base:      #050a0e
--color-neon-cyan:    #00d4ff
--color-neon-orange:  #ff6b00
--color-text-primary: #e0f4ff
--color-border:       rgba(0,212,255,0.2)
Font headings: Orbitron
Font body:     Rajdhani
```
- Never use bold/bullets/headers in conversational responses
- All panels: `rgba(2,15,35,0.88)` background + `rgba(0,212,255,0.25)` borders
- Cyan glow on interactive elements
- Scrollbars: 3px, cyan tinted

---

## Data Storage Locations
```
Documents/Taski/quicktodos.json       # Todo items
Documents/Taski/chats.json            # Chat history
Documents/Taski/websites/             # Generated websites archive
Documents/Taski/websites/index.json   # Website metadata index
./chroma_db/                          # RAG vector database
```

---

## Known Issues / Things to Be Careful About
- `navigator.onLine` always returns false in Electron — override in main.js
- Web Speech API completely broken in Electron — always use Whisper for input
- TTS mute state stored in `localStorage['taski_tts_enabled']`
  - `'true'` or `null` = unmuted (default)
  - `'false'` = muted
  - Past bug: website generator could leave it stuck at `'false'`
- Unsplash images need `?w=800&q=80&auto=format&fit=crop` for reliability
- Claude API max_tokens for website generation: 16000 (two-pass if needed)
- Google Calendar `timeMin` must be start of day (00:00:00) not current time

---

## How to Run
```bash
npm run electron:dev       # Main development command (ALWAYS use this)
npm run dev                # Browser only — limited features, not recommended
npm install                # After pulling changes or adding packages
pip install anthropic chromadb pypdf  # Python RAG (one time)
npm install -g @modelcontextprotocol/server-filesystem  # MCP (one time)
npx n8n                    # Start N8N locally at localhost:5678
```

---

## Pending / Ideas Discussed But Not Yet Built
- Telegram voice integration (architecture planned — polling + Whisper)
- Export todos to CSV
- Proactive N8N notifications (morning briefing even when Taski closed)
- Deploy web version to Vercel (without Electron features)

---

## How to Use This File in New Chats
Start every new Claude conversation with:
> "I'm continuing development of the Taski app.
> Here is the project context: [paste this file]
> Today I want to work on: [your specific task]"

This replaces reading hundreds of chat messages and costs far fewer tokens.
