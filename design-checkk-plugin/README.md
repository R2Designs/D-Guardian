# Design Guardian

Design Guardian is a Figma plugin that scans a selected frame for design inconsistencies and creates a cleaned duplicate instead of modifying the original.

## Features

- Scans only the selected frame and its children
- Detects typography scale violations
- Detects line-height inconsistencies
- Detects spacing values off the 8pt grid
- Detects visible solid fills without local color styles
- Resolves issues in a duplicated frame named `Original Name – Guardian Clean`
- Supports optional design-system-based fixes using local text and paint styles

## Tech Stack

- Figma Plugin API
- TypeScript
- HTML UI

## Files

- `manifest.json`
- `code.ts`
- `code.js`
- `ui.html`
- `ui.ts`
- `fav.png`

## Local Install

1. Open Figma.
2. Go to `Plugins` -> `Development` -> `Import plugin from manifest...`
3. Select `manifest.json` from this folder.

## Usage

1. Select a frame.
2. Click `Scan Frame`.
3. Review the issue list.
4. Optionally enable `Check with Design System`.
5. Click `Resolve All Issues`.

The plugin creates a cleaned duplicate and leaves the original frame unchanged.
