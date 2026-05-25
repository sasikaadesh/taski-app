# Smart Todo App — Product Requirements

## Overview
A clean, modern React todo application with Google Calendar integration
and an AI chatbot assistant. Built with Vite + React.

## Tech stack
- React 18 + Vite
- Tailwind CSS for styling
- Anthropic Claude API (claude-sonnet-4-20250514)
- Google Calendar MCP for schedule awareness
- localStorage for todo persistence

## Features

### 1. Todo list (main panel)
- Add a todo with: title, date (calendar picker), time (time picker)
- Mark todos complete / delete todos
- When adding a todo, Claude checks Google Calendar via MCP and warns
  if the chosen time conflicts with an existing event

### 2. AI schedule awareness
- On todo creation, call Claude API with Google Calendar MCP attached
- Claude reads real calendar events for that day and responds with
  a smart suggestion (e.g. "You have a meeting at 3pm — try 4pm instead")
- Show Claude's response as a soft banner below the add form

### 3. Chatbot (bottom-right corner)
- Floating chat bubble, expands to a small chat panel
- Uses Claude API (no MCP needed, just LLM)
- System prompt: helpful assistant that knows about this todo app
- Keeps last 10 messages in memory per session

## Design
- Follow SKILL.md for all colors, fonts, and spacing
- Clean minimal layout: left sidebar (todo list) + right main (calendar view)
- Mobile friendly

## Out of scope (v1)
- User accounts / auth
- Backend database
- Push notifications