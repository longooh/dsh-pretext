<div align="center">

**English** · [简体中文](README.zh-CN.md)

</div>

# dsh-pretext

Integrates [@chenglou/pretext](https://github.com/chenglou/pretext) (fast,
accurate & comprehensive text measurement & layout, canvas-based, zero reflow)
into the DeepSeek Harness Web GUI as a **client module**, wrapped around the
library's documented best practices ([chenglou.me/pretext](https://chenglou.me/pretext/)).

- **Host side**: no-op loader entry (feature lives in the browser half).
- **Client side**: `require("dsh-pretext")` returns `{ ready }`; `await ready`
  yields the full `DshPretext` API surface. The surface is also exposed
  synchronously on the module itself.
- **Scripts (host / agent side)**: `@chenglou/pretext` is installed as a
  dependency of this package and hoisted by pnpm, so Node/agent code can
  `import("@chenglou/pretext")` directly.

## Why this wrapper (best-practice mapping)

Pretext's own docs stress two rules, both enforced here:

1. **`prepare()` once, `layout()` hot-path.** `prepare()` is the expensive
   one-time pass (normalize whitespace, segment, apply glue rules, measure
   with canvas); `layout()` is cheap pure arithmetic over cached widths.
   Re-running `prepare()` for the same text+font defeats that precomputation.
   → Every high-level helper here is **cache-backed** (FIFO, default 200
   entries, `setCacheSize(n)` / `clearCache()` to tune). Call `measure()`
   repeatedly on resize; the prepared analysis is reused.
2. **Two use-case layers.** The library serves two shapes of consumers, both
   exposed:

   - **Use case 1 — height without touching the DOM**
     (virtualization, masonry, JS-driven layout, dev-time overflow checks,
     scroll re-anchoring):
     ```js
     const { measure } = require("dsh-pretext")
     const { height, lineCount } = measure('AGI 春天到了. بدأت الرحلة 🚀', '16px Inter', 320, 20)
     ```
   - **Use case 2 — manual line layout** (canvas/SVG/WebGL rendering,
     float-around, per-line variable width):
     ```js
     const { layoutLines, fitWidth } = require("dsh-pretext")
     const { lines } = layoutLines(text, '18px "Helvetica Neue"', 320, 26)
     lines.forEach((l, i) => ctx.fillText(l.text, 0, i * 26))
     // tightest container that still fits the text:
     const tight = fitWidth(text, '18px "Helvetica Neue"')
     ```

## API surface (`await ready`)

### High-level, cache-backed helpers

| API | Description |
| --- | --- |
| `measure(text, font, maxWidth, lineHeight?, opts?)` | `{ height, lineCount }` — paragraph height, pure arithmetic after cached prepare. |
| `layoutLines(text, font, maxWidth, lineHeight?, opts?)` | `{ height, lineCount, lines }` — full line info for fixed-width manual layout. |
| `walkLineRanges(text, font, maxWidth, onLine, opts?)` | Walk per-line `{ width, start, end }` ranges without building strings (speculative width probing, shrinkwrap). |
| `measureStats(text, font, maxWidth, opts?)` | `{ lineCount, maxLineWidth }` — allocation-free stats. |
| `fitWidth(text, font, opts?)` | `number` — `measureNaturalWidth()`: widest forced line; the tightest container width that still fits. |
| `truncate(text, font, maxWidth, opts?)` | `string` — single-line ellipsis; binary-searches the longest prefix that fits (grapheme-safe). `opts.ellipsis` defaults to `…`. |
| `prepare(text, font, opts?)` / `prepareWithSegments(...)` | Memoized entry points returning the opaque prepared handle for low-level use. |

`opts` mirrors pretext: `{ whiteSpace?: 'normal' | 'pre-wrap', wordBreak?: 'normal' | 'keep-all', letterSpacing?: number }`.
**`font` and `letterSpacing` must stay synced with the CSS you measure against**
(`font` is the same shorthand as `ctx.font = ...`). Pass
`whiteSpace: 'pre-wrap'` for textarea-like text.

### Rich-inline flow (atomic chips, mentions, code spans)

Pretext's narrow inline helper, passthrough here:
`prepareRichInline(items)` → `walkRichInlineLineRanges` /
`measureRichInlineStats` / `materializeRichInlineLineRange` /
`layoutNextRichInlineLineRange`, plus the `richInline` namespace directly.
Items support `break: 'never'` (atomic, like a chip/mention) and
`extraWidth` (caller-owned chrome such as pill padding).

### Control & escape hatches

- `clearCache()` — drop prepared entries **and** pretext's internal caches.
- `setLocale(locale?)` — locale for word segmentation (affects breaking).
- `setCacheSize(n)` — cap the prepared cache (default 200).
- `raw.pretext` / `raw.richInline` — the raw namespaces, for one-off advanced
  calls (e.g. `layoutNextLineRange` variable-width flow with cursors).

### Manual hyphenation

Insert soft hyphens (`\u00AD`) into the text **before** any prepare/measure
call. Pretext treats them as optional break points: unchosen soft hyphens
stay invisible; chosen breaks materialize as a trailing `-`.

## Hacker text effects (configurable, opt-in)

`api.hacker` adds hacker/terminal-style text effects to the chat. A
bottom-right `>_` button opens a **terminal console** — type commands like a
hacker:

```
❯ all on            # master switch (theme + typewriter + rain + glow + cursor)
❯ theme amber       # matrix | amber | mono (phosphor themes)
❯ tw on             # typewriter text reveal (overlay, React-safe)
❯ speed 60          # typewriter speed (1-200)
❯ rain on           # Matrix rain canvas background
❯ scanlines on      # CRT scanline overlay
❯ cursor off        # blinking block caret
❯ glow off          # phosphor text glow
❯ console off       # hide this console button
❯ status            # show current config
❯ reset             # restore defaults
❯ help              # this list
```

- **Config** persists to `localStorage["dsh-pretext:hacker"]`; defaults:
  `enabled:true, theme:matrix, typewriter:false, rain:false,
  scanlines:false, cursor:true, glow:true, console:true`.
- **Programmatic control** from any other client plugin:
  `api.hacker.patchConfig({ typewriter: true })` /
  `api.hacker.execCommand("theme amber")` / `api.hacker.getConfig()`.
- **Typewriter notes**: it reveals by a mask + clipped clone overlay, so it
  never touches the React-managed text node (no reconciliation breakage) and
  the layout does not shift while typing. Only texts longer than
  `typewriterMinLen` (default 24) trigger it; tweak via `patchConfig`.
- Effects are a pure style/overlay layer — safe against unknown DSH DOM
  structure, and every effect can be switched off.

## Notes

- The bundle has **no UI** — it is a capability other client plugins or the
  GUI consume. Nothing visible changes by installing it.
- `client.js` is a build artifact (`bun build src/client.js --outfile=client.js
  --format=cjs --target=browser`, see `npm run build`). Do not hand-edit it.
  The build **statically inlines** both pretext entry points (`@chenglou/pretext`
  and `@chenglou/pretext/rich-inline`) — a bare dynamic `import(...)` would fail
  to resolve in the DSH web shell (no importmap).
