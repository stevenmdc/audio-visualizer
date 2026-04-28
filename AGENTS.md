<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS - Quick Architecture Context

## Project intent
Single-page audio visualizer app (Next.js App Router) focused on fast local media import (audio + optional background video), animated mirrored bars, minimal transport controls, and live visual settings.

## Stack
- Next.js App Router + React + TypeScript
- Tailwind CSS (v4 style import via `@import "tailwindcss"`)
- `framer-motion` for motion
- `lucide-react` for icons
- Web Audio API (`AudioContext`, `AnalyserNode`)

## Key files
- `components/AudioVisualizer.tsx`: main and only interactive feature surface
- `app/page.tsx`: mounts `AudioVisualizer`
- `app/globals.css`: global styles + custom range slider styles
- `PLAN.md`: compact delivery status and remaining QA

## Runtime architecture (AudioVisualizer)
- Client component (`"use client"`)
- Internal state drives full UI (no backend/data layer)
- Audio pipeline:
  - local audio files -> object URLs
  - `HTMLAudioElement` as playback source
  - `AudioContext.createMediaElementSource(audio)` -> `AnalyserNode` -> destination
  - RAF loop updates frequency bars and current time
- Cleanup on unmount:
  - cancel RAF
  - close AudioContext
  - revoke object URLs (audio + background video)

## Current UX behavior
- Mirrored bars are anchored from center (`left-1/2` and `right-1/2`)
- Transport controls: previous, rewind 10s, play/pause, forward 10s, next
- Upload audio button appears only when playlist is empty
- Background video upload is optional and looped/muted/inline
- `Hide/Show` toggles all timeline markers:
  - top rolling timeline ticks
  - center vertical cursor
  - center horizontal line
- Right fixed zoom nav:
  - zoom slider (persists position on scroll)
  - settings button above slider

## Settings modal (live)
- Video Opacity
- Overlay Intensity
- Video Fit (`cover`/`contain`)
- Video Scale
- Bars Count
- Bars Width

Default settings:
- Video Opacity `100%`
- Overlay Intensity `0%`
- Video Fit `cover`
- Video Scale `100%`
- Bars Count `14`
- Bars Width `8px`

## Editing rules for future agents
- Keep visualizer center anchoring logic intact unless explicitly asked
- Do not reintroduce old “hide bottom-half bars” behavior
- If changing bar count behavior, preserve smooth resizing of the `bars` array
- Preserve object URL cleanup to avoid memory leaks
- Run `npm run lint` after edits
- Update `PLAN.md` when behavior/features materially change

## Known follow-up work
- Manual QA desktop/mobile still pending
- Potential settings presets + reset defaults
- Potential Remotion export backlog
