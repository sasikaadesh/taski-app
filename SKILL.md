# SKILL.md — Tron Design System Tokens

## Color tokens (defined in `src/index.css` as CSS custom properties)

### Backgrounds
| Token | Value | Use |
|---|---|---|
| `--color-bg-base` | `#050a0e` | Page background |
| `--color-bg-muted` | `#080f14` | Panel/card background |
| `--color-bg-raised` | `#0a1628` | Elevated surfaces, inputs |
| `--color-bg-overlay` | `#0d1f35` | Hover overlays |
| `--color-bg-grid` | `#091520` | Grid tints |

### Text
| Token | Value | Use |
|---|---|---|
| `--color-text-primary` | `#e0f4ff` | Main readable text |
| `--color-text-secondary` | `#4a9bbe` | Labels, captions |
| `--color-text-dim` | `#1e4d6b` | Very dim / disabled |

### Neon Cyan — primary accent
| Token | Value | Use |
|---|---|---|
| `--color-neon-cyan` | `#00d4ff` | Borders, icons, active states |
| `--color-neon-cyan-dim` | `#0099bb` | Scrollbar, hover dim |
| `--color-neon-cyan-glow` | `rgba(0,212,255,0.15)` | Glow fill / badge bg |
| `--color-neon-cyan-border` | `rgba(0,212,255,0.3)` | Subtle borders |

### Neon Orange — warnings & processing
| Token | Value | Use |
|---|---|---|
| `--color-neon-orange` | `#ff6b00` | Conflict banners, warnings |
| `--color-neon-orange-dim` | `#cc5500` | Dimmed orange |
| `--color-neon-orange-glow` | `rgba(255,107,0,0.12)` | Warning backgrounds |

### Grid & Borders
| Token | Value |
|---|---|
| `--color-grid-line` | `rgba(0,212,255,0.04)` |
| `--color-border` | `rgba(0,212,255,0.2)` |
| `--color-border-bright` | `rgba(0,212,255,0.5)` |

### Semantic
| Token | Value |
|---|---|
| `--color-success` | `#00ff88` |
| `--color-warning` | `#ff6b00` |
| `--color-danger` | `#ff2d55` |

## Typography
- **Headings / Logo**: `'Orbitron', sans-serif` — wide, futuristic
- **Body / UI**: `'Rajdhani', sans-serif` — clean, techy
- Both loaded via Google Fonts in `index.html`

## Named animations (keyframes in `index.css`)
| Name | Effect |
|---|---|
| `glowPulse` | Box-shadow breathe for interactive elements |
| `scanLine` | Vertical scan-line sweep |
| `recordPulse` | Mic-recording dot blink |
| `rotateRingCW` | Clockwise ring rotation |
| `rotateRingCCW` | Counter-clockwise ring rotation |
| `jarvisGlowPulse` | SVG opacity breathing |
| `sonarPing` | Expanding circle ping |
| `loadingArcSpin` | 360° loading arc |
| `speakingScale` | Scale pulse for speaking state |
| `startupFadeIn` | Fade + slide up for startup overlay |
| `startupRingDraw` | Stroke-dashoffset ring draw |
