# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run in development (no build step needed — Node strips types natively)
pnpm start

# Type check only
pnpm typecheck

# Build to dist/ for publishing
pnpm build
```

The package is named `mdzen` in `package.json` but the CLI binary and README still use `mdpeek` — the binary name in `package.json` is `mdzen`.

## Architecture

This is a zero-dependency (runtime) local Markdown preview server. The entry point is `src/server.ts`, which spins up a plain `node:http` server with no framework.

**Request routing** (all in `server.ts`):
- `GET /sse` — Server-Sent Events for HMR; delegates to `sse.ts`
- `GET /api/content/:file` — JSON endpoint that returns rendered HTML + TOC, used by HMR fetch-and-swap
- `GET /` — File tree index page
- `GET /view/:file` — Full markdown preview page
- Static assets (images, etc.) from the doc root

**Rendering pipeline** (`markdown.ts`):
1. `parseFrontmatter()` splits YAML frontmatter from body
2. `resetBlockLineQueue()` pre-walks `marked`'s token list to record source line numbers per block token
3. `marked.parse()` runs with custom renderers that call `consumeLineAttr()` to inject `data-source-line` attributes into HTML elements (enables the Cursor editor link buttons)
4. `extractToc()` / `renderToc()` produce the sidebar TOC

**Line mapping** (`line-mapping.ts`): A FIFO queue maps each top-level block token to its source line. Custom marked renderers consume from the front of this queue — the queue type-check ensures nested elements (rendered before their container) correctly skip consumption. This enables the editor-jump feature.

**HMR flow**:
- `watcher.ts` polls `DOC_ROOT` every 500ms using `mtime` comparison (no `fs.watch`)
- On change, `sse.ts`'s `notifyClients()` pushes an SSE event to all connected browsers
- The browser HMR script (inlined in `templates.ts`) fetches `/api/content/:file` and swaps `.content` innerHTML in-place, then re-injects editor buttons

**Page assembly** (`templates.ts`):
- `getHtmlTemplate()` — simple full-page layout (index, 404)
- `getPreviewTemplate()` — sidebar layout with collapsible TOC (right) and back-nav (left)
- All CSS, scripts (HMR, TOC scroll-spy, theme, editor links) are inlined strings — no external assets

**Theme** (`theme.ts`): Light/dark toggle stored in `localStorage`. Uses CSS variables; syntax highlighting colors are also CSS-variable-based so they adapt automatically.

**Process lifecycle**: On startup, writes PID to `$TMPDIR/mdpeek-{port}.pid`. `mdpeek stop` reads this file, sends SIGTERM, and cleans up.

## TypeScript setup

- `tsconfig.json` — for type-checking (`noEmit: true`, `allowImportingTsExtensions: true`)
- `tsconfig.build.json` — extends the above, enables emit to `dist/`, sets `rewriteRelativeImportExtensions: true` to rewrite `.ts` imports to `.js` in output
- Dev runs via `node --experimental-strip-types` — no build step needed during development
- All imports use `.ts` extensions explicitly (required by `verbatimModuleSyntax`)
