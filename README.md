# Design Guardian

Design Guardian is a Figma plugin that scans a selected frame for UI inconsistencies and creates a cleaned duplicate instead of modifying the original.

## What It Does

- Scans only the selected frame and its children
- Detects typography scale violations
- Detects line-height inconsistencies
- Detects spacing values off the 8pt grid
- Detects visible solid fills without local color styles
- Duplicates the original frame and fixes issues in the copy
- Supports optional design-system-aware fixes using local text and paint styles

## How It Works

1. Select a frame in Figma
2. Click `Scan Frame`
3. Review the detected issues
4. Optionally enable `Check with Design System`
5. Click `Resolve All Issues`

The plugin creates a new frame named:

`Original Name – Guardian Clean`

and places it to the right of the original.

## Project Structure

```text
design-guardian-plugin/
  manifest.json
  code.ts
  code.js
  ui.html
  ui.ts
  fav.png
  README.md
```

## Install In Figma

1. Open Figma
2. Go to `Plugins` -> `Development` -> `Import plugin from manifest...`
3. Select `design-guardian-plugin/manifest.json`

## Tech Stack

- Figma Plugin API
- TypeScript
- HTML UI

## Versions

- `v1.0.0`
- `v1.2.0`
