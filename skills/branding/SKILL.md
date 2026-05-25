# SKILL.md — Taski Design System

## Brand identity
App name:    Taski
Tagline:     Smart todos, smarter scheduling
Theme:       Tron — Dark neon grid

## Color tokens
--color-bg-base:         #050a0e   (deep dark base — almost black)
--color-bg-muted:        #080f14   (panels, sidebar)
--color-bg-raised:       #0a1628   (cards, inputs)
--color-bg-overlay:      #0d1f35   (hover states)
--color-bg-grid:         #091520   (grid line background)

--color-text-primary:    #e0f4ff   (main text — cold white blue)
--color-text-secondary:  #4a9bbe   (muted labels, placeholders)
--color-text-dim:        #1e4d6b   (very muted, timestamps)

--color-neon-cyan:       #00d4ff   (primary accent — Tron blue)
--color-neon-cyan-dim:   #0099bb   (hover, active states)
--color-neon-cyan-glow:  rgba(0,212,255,0.15)  (glow backgrounds)
--color-neon-cyan-border: rgba(0,212,255,0.3)  (glowing borders)

--color-neon-orange:     #ff6b00   (secondary accent — Tron orange)
--color-neon-orange-dim: #cc5500   (orange hover)
--color-neon-orange-glow: rgba(255,107,0,0.12) (orange glow)

--color-grid-line:       rgba(0,212,255,0.06)  (subtle grid lines)
--color-border:          rgba(0,212,255,0.2)   (all borders)
--color-border-bright:   rgba(0,212,255,0.5)   (focused borders)

--color-success:         #00ff88   (neon green — completed)
--color-warning:         #ff6b00   (orange — conflicts)
--color-danger:          #ff2d55   (red — errors, delete)

## Typography
Font family:   'Rajdhani', 'Orbitron', sans-serif
               Load from Google Fonts:
               Orbitron for headings (futuristic)
               Rajdhani for body (clean techy)
Base size:     16px
Base weight:   400
Line height:   1.6
Letter spacing: 0.03em on all text (wide spaced — Tron feel)

Scale:
  xs:   11px   timestamps, micro labels
  sm:   13px   secondary text, tags
  md:   16px   body, default UI
  lg:   18px   card titles
  xl:   24px   section headings
  2xl:  32px   page title
  3xl:  48px   hero/display

Weight scale:
  300  light    body paragraphs
  400  regular  UI text
  500  medium   labels, buttons
  700  bold     headings, app name

## Spacing scale
  space-1:   4px
  space-2:   8px
  space-3:   12px
  space-4:   16px
  space-5:   24px
  space-6:   32px
  space-7:   48px
  space-8:   64px

## Border radius
  radius-none:  0px     sharp Tron edges (use most)
  radius-xs:    2px     very slight bevel
  radius-sm:    4px     inputs, small elements
  radius-md:    6px     cards, panels
  radius-pill:  100px   badges only

## Motion
  duration-instant:  150ms  micro interactions
  duration-fast:     250ms  hover glows, focus
  duration-normal:   400ms  panel transitions
  duration-slow:     600ms  page level
  easing:            cubic-bezier(0.16, 1, 0.3, 1)

## Global background
- Page background: --color-bg-base (#050a0e)
- Subtle grid overlay on the page background:
  background-image: 
    linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)
  background-size: 40px 40px
  (creates the Tron grid floor effect)

## Component rules

### Page layout
- Background: --color-bg-base with grid overlay
- Two column: left form panel + right task list
- Max width: 1200px centered
- Padding: space-6 (32px)

### Header / navbar
- Background: --color-bg-muted (#080f14)
- Border-bottom: 1px solid --color-border
- Bottom glow: box-shadow 0 1px 20px rgba(0,212,255,0.1)
- App name: Orbitron font, --color-neon-cyan, 
            weight 700, xl size
            text-shadow: 0 0 20px rgba(0,212,255,0.8)
- Tagline: Rajdhani, --color-text-secondary, sm
- Pending badge: neon cyan pill

### Cards and panels
- Background: --color-bg-raised (#0a1628)
- Border: 1px solid --color-border
- Border radius: radius-md (6px)
- Padding: space-5 (24px)
- Hover: border-color → --color-border-bright
         box-shadow: 0 0 20px --color-neon-cyan-glow
- Transition: 250ms cubic-bezier(0.16,1,0.3,1)
- Left accent border on active cards:
  border-left: 2px solid --color-neon-cyan

### Inputs and form fields
- Background: --color-bg-raised (#0a1628)
- Border: 1px solid --color-border
- Border radius: radius-sm (4px)
- Text: --color-text-primary
- Placeholder: --color-text-dim
- Letter spacing: 0.03em
- Padding: 10px 14px
- Focus: border → --color-border-bright
         box-shadow: 0 0 0 3px --color-neon-cyan-glow
                     0 0 15px rgba(0,212,255,0.2)
- Transition: 250ms

### Primary button (Add task)
- Background: transparent
- Border: 1px solid --color-neon-cyan
- Color: --color-neon-cyan
- Font: Rajdhani, weight 500, letter-spacing 0.1em
- Text: uppercase
- Border radius: radius-sm (4px)
- Padding: 12px 24px
- Hover: background → --color-neon-cyan-glow
         box-shadow: 0 0 20px rgba(0,212,255,0.4)
                     inset 0 0 20px rgba(0,212,255,0.1)
- Active: scale(0.98)
- Transition: 250ms
- Full width inside form panel

### Task list items
- Background: --color-bg-raised (#0a1628)
- Border: 1px solid --color-border
- Border radius: radius-md (6px)
- Padding: space-4 (16px)
- Gap between items: space-3 (12px)
- Left border: 2px solid transparent (default)
- Hover: left border → --color-neon-cyan
         box-shadow: 0 0 15px --color-neon-cyan-glow
         background → --color-bg-overlay
- Completed: 
  text-decoration: line-through
  color: --color-text-dim
  left border: 2px solid --color-success
  opacity: 0.5

### Checkbox
- Size: 18x18px
- Border: 1px solid --color-border
- Border radius: radius-none (0px — sharp Tron style)
- Unchecked: transparent background
- Checked: background → --color-neon-cyan
           border → --color-neon-cyan
           box-shadow: 0 0 10px rgba(0,212,255,0.6)
           checkmark: #050a0e (dark)
- Transition: 150ms

### Delete button
- Color: --color-text-dim
- Only visible on task item hover
- Hover: color → --color-danger
         text-shadow: 0 0 8px rgba(255,45,85,0.8)
- Transition: 150ms

### Badges and tags
- Background: --color-neon-cyan-glow
- Border: 1px solid --color-neon-cyan-border
- Color: --color-neon-cyan
- Border radius: radius-pill (100px)
- Font: Rajdhani, sm (13px), letter-spacing 0.05em
- Padding: 3px 12px
- Text: uppercase

### Pending count badge (header)
- Same as badges above
- Glow: box-shadow 0 0 10px rgba(0,212,255,0.3)

### Success confirmation (Added to Google Calendar)
- Color: --color-success (#00ff88)
- Text-shadow: 0 0 8px rgba(0,255,136,0.6)
- Font size: xs (11px)
- Uppercase, letter-spacing 0.05em

### Warning banner (calendar conflict)
- Background: --color-neon-orange-glow
- Border-left: 2px solid --color-neon-orange
- Color: --color-neon-orange (#ff6b00)
- Text-shadow: 0 0 8px rgba(255,107,0,0.6)
- Border radius: radius-sm (4px)

### Chatbot bubble (bottom right)
- Size: 52x52px circle
- Background: transparent
- Border: 2px solid --color-neon-cyan
- Icon: --color-neon-cyan
- Box-shadow: 0 0 20px rgba(0,212,255,0.5)
             inset 0 0 20px rgba(0,212,255,0.1)
- Hover: box-shadow: 0 0 30px rgba(0,212,255,0.8)
- Transition: 250ms
- Pulse animation: subtle glow pulse 2s infinite

### Chatbot panel
- Background: --color-bg-muted (#080f14)
- Border: 1px solid --color-border
- Border radius: radius-md (6px)
- Width: 340px
- Max height: 500px
- Header: 
  background: --color-bg-raised
  border-bottom: 1px solid --color-border
  title: Orbitron font, --color-neon-cyan
  box-shadow: 0 1px 15px --color-neon-cyan-glow
- User messages:
  background: rgba(0,212,255,0.08)
  border: 1px solid --color-neon-cyan-border
  border-radius: radius-sm
  color: --color-text-primary
- Assistant messages:
  background: --color-bg-raised
  border: 1px solid --color-border
  border-radius: radius-sm
  color: --color-text-primary
- Input area:
  background: --color-bg-raised
  border-top: 1px solid --color-border
- Send button:
  color: --color-neon-cyan
  hover glow: 0 0 10px rgba(0,212,255,0.5)

### Scrollbars (custom)
- Track: --color-bg-base
- Thumb: --color-border
- Thumb hover: --color-neon-cyan-dim
- Width: 4px

### Focus styles (accessibility)
- Outline: 2px solid --color-neon-cyan
- Outline offset: 2px
- Box-shadow: 0 0 0 4px --color-neon-cyan-glow

## Animations
### Glow pulse (chatbot bubble)
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(0,212,255,0.5); }
  50%       { box-shadow: 0 0 35px rgba(0,212,255,0.9); }
}
animation: glowPulse 2s ease-in-out infinite

### Scan line (optional subtle effect on cards)
@keyframes scanLine {
  0%   { transform: translateY(-100%); opacity: 0; }
  50%  { opacity: 0.03; }
  100% { transform: translateY(100%); opacity: 0; }
}

## Accessibility
- Target: WCAG 2.2 AA
- All neon colors must meet 4.5:1 contrast on dark bg
- Focus ring always visible — neon cyan outline
- Never rely on glow alone for state indication
- Minimum touch target: 44x44px

## Anti-patterns — never do these
- No light or white backgrounds anywhere
- No solid filled primary buttons — use outline 
  with glow instead
- No rounded corners above radius-md (6px) — 
  keep edges sharp and angular
- No warm colors except --color-neon-orange 
  for warnings only
- No font sizes below 11px
- No transitions faster than 150ms
- No glow effects on text below sm size