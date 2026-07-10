# Generated Site

Built by Taski's AI website generator (Next.js App Router, static export).

## Develop
```bash
npm install
npm run dev
```

## Build static export
```bash
npm run build
```
Output goes to `out/`. Deploy that folder to any static host.

## Preview the built site locally
```bash
npm run start
```
(`next start` does not work with static export — this serves `out/` with the
`serve` package instead.)

## Edit content
All copy lives in `content/site.json`, `content/hero.json`, and `content/sections.json`.
Edit those and rebuild — no component changes are needed for copy or theme edits.
