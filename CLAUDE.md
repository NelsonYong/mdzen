# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run in development (no build step needed — Node strips types natively)
pnpm start

# Type check only
pnpm typecheck

# Run tests (node:test, no extra deps)
pnpm test

# Build to dist/ for publishing
pnpm build
```

The package is named `mdzen` everywhere — package, binary, and CLI output. The legacy name `mdpeek` is fully retired (one-time `localStorage` migration is performed client-side in `theme.ts`).

`engines.node` requires **>=22.6.0** because `--experimental-strip-types` rejects parameter properties / decorators below that line.

## Architecture

This is a zero-runtime-dependency local Markdown preview server. Entry point: `src/server.ts`, plain `node:http`, no framework.

### Request routing (`server.ts`)
All paths are decoded via `decodeUrlPath()` (rejects malformed encoding + null bytes) before dispatch:
- `GET /sse` — Server-Sent Events for HMR (`sse.ts`)
- `GET /api/content/:file` — JSON: rendered HTML + TOC, used by HMR
- `GET /` — File tree index page (`pages.renderIndex`)
- `GET /view/:file` — Full preview page (`pages.renderMarkdown`); falls back to `serveStaticFile` for non-markdown extensions
- `GET /logo.svg` — inline-themable SVG asset
- Static assets via `serveStaticFile` for any extension in `MIME_TYPES`

Every handler is wrapped in `try/catch` returning 500. Path-based reads route through `safeResolve` (`src/utils/security.ts`) which checks `path.resolve` prefix + `realpathSync` to defeat traversal *and* symlink escape.

### Security utilities (`src/utils/security.ts`)
- `escapeHtml(s)` — entity-escapes `&<>"'`
- `html\`...\`` — tagged template that auto-escapes interpolations; use `raw(s)` to opt-out for trusted HTML
- `safeJsonForScript(value)` — JSON.stringify + escapes `<`, `-->`, ` `, ` ` so output is safe inside `<script>...</script>`
- `safeResolve(root, userPath)` — strict + realpath check; throws `PathTraversalError`
- `decodeUrlPath(rawUrlPath)` — null on malformed/null-byte; otherwise decoded

The `html` tagged template is the load-bearing XSS defense. Any new server-rendered HTML should go through it (or `escapeHtml` for individual values).

### Rendering pipeline (`markdown.ts`)
1. `parseFrontmatter()` normalizes CRLF → LF, splits YAML frontmatter from body
2. `createRenderContext()` returns a fresh `Marked` instance + closure-scoped `usedIds` and `lineMapping` — **per-render, not module-global**, so concurrent requests cannot corrupt each other
3. `preWalkForToc()` lexes once and emits TOC entries (deterministic, same `generateUniqueId` algorithm as the heading renderer → IDs always align with anchors)
4. `lineMapping.reset(body, lineOffset)` records source-line per top-level block token
5. `marked.parse(body)` runs custom renderers that call `lineMapping.consume(tokenType)` to inject `data-source-line=` attrs (powers editor jump)

### Line mapping (`line-mapping.ts`)
`createLineMapping(marked)` returns `{ reset, consume }`. The queue is a closure variable — no module state. Because marked renders container children *before* the container itself, a nested element finds the wrong type at the queue front and skips consumption — that is by design.

### HMR flow
- `watcher.ts` uses `fs.watch({recursive:true})` (Node 22+ stable on macOS/Linux/Windows). On error or unsupported filesystem it falls back to a 500 ms mtime poll.
- File events are debounced (50 ms) and dispatched as `update`/`add`/`delete`/`reload` events to all connected SSE clients.
- The structure-change branch invalidates `getCachedMdFiles()` so the next render rebuilds the file list.
- Browser HMR script (in `templates.ts.hmrScript`) reconnects with **exponential backoff** (1 s → 30 s cap), pauses on `document.hidden`, preserves `scrollY` across content swaps, and restores `location.hash` if present.

### Page assembly (`templates.ts`)
- `getHtmlTemplate(title, content)` — index / 404 layout, includes search modal
- `getPreviewTemplate(...)` — sidebar layout (right TOC, left file nav, top mobile toggles)
- All inline styles + scripts come from focused modules:
  - `theme.ts` — light/dark + theme panel
  - `editor-link.ts` — `buildEditorLinkScript(editor)` produces deep-link script for the configured editor (cursor / vscode / idea / webstorm / vim / none)
  - `features.ts` — copy-code, mobile-nav drawer, Cmd-K search, Mermaid lazy loader, frontmatter neutral colors, reduced-motion
- A11y: keyboard parity with hover (`:focus-within` on every hover-driven panel), `aria-expanded` / `aria-pressed` / `aria-current`, focus trap on Esc-closable modals
- Filenames are ALWAYS escaped before HTML interpolation. `window.__allFiles` is serialized via `safeJsonForScript`.

### Process lifecycle (`config.ts`)
- `parseArgs()` validates `-p` (1–65535) and `--editor` strictly; bad values exit 1 with a message
- `--version` / `-v` / `--help` / `-h` short-circuit before server start
- Multi-instance registry at `$TMPDIR/mdzen-registry.json` is written via temp-file + `rename` (atomic — defeats the read-modify-write race between concurrent starts)
- `mdzen list` / `mdzen stop [-p PORT|--all]` — pid-aware; auto-cleans dead entries

## TypeScript setup
- `tsconfig.json` — `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `noEmit`
- `tsconfig.build.json` — extends above, emits to `dist/`, sets `rewriteRelativeImportExtensions` so `.ts` imports become `.js` in output
- Dev runs via `node --experimental-strip-types` — no build step, no parameter-properties allowed
- All imports use `.ts` extensions explicitly (required by `verbatimModuleSyntax`)

## Testing
`node:test` + `node:assert` (zero new deps). Cover:
- `src/utils/security.test.ts` — escape, html tag, safeResolve (incl. symlink escape), decodeUrlPath, safeJsonForScript
- `src/markdown.test.ts` — frontmatter parsing (CRLF, malformed, quoted, boolean), TOC extraction, ID disambiguation, frontmatter HTML escape
- `src/line-mapping.test.ts` — instance isolation (concurrency proof)
- `src/files.test.ts` — tree building, recursive count
- `src/server.test.ts` — full HTTP integration (spawned server: index, /api/content/, /view/, /sse, traversal denied, filename escape)

`pnpm test` runs the whole suite under strip-types.

## Adding a new client-side feature
1. Add a `*Styles` and `*Script` (and optional `*Markup`) export to `src/features.ts`. Keep handlers idempotent (HMR re-runs them).
2. If the feature should react to HMR content swap, expose a `window.__functionName` and call it from `hmrScript.fetchAndUpdate`.
3. Wire the styles into `getPreviewTemplate` (or `getHtmlTemplate` for index).
4. Add markup / scripts at the bottom of the template body in the same order the existing ones are wired.
