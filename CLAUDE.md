# CLAUDE.md — project instructions for Claude Code

## What this project is
A React todo app with Google Calendar MCP integration and an AI chatbot.
See PRD.md for full feature spec.

## How to behave
- Always read PRD.md and SKILL.md before writing any component
- Keep components small and single-purpose
- Use Tailwind utility classes only — no custom CSS files
- All Claude API calls go in /src/lib/claude.js
- All MCP config lives in .claude/settings.json — never hardcode MCP URLs

## Code style
- Functional components with hooks only (no class components)
- Name files: PascalCase for components, camelCase for utils
- Every component file gets a one-line comment at the top explaining its role

## API key rule
- NEVER commit the API key. Use import.meta.env.VITE_ANTHROPIC_API_KEY
- Remind the user to add it to .env if it's missing

## File structure to maintain
src/
  components/    # UI components
  lib/           # claude.js, mcp.js
  hooks/         # custom hooks
  App.jsx
  main.jsx