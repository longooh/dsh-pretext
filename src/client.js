// dsh-pretext — browser half (client plugin bundle), SOURCE.
//
// Integrates @chenglou/pretext (fast, accurate & comprehensive text
// measurement & layout, canvas-based, zero reflow) into the DeepSeek Harness
// Web GUI as a client module, following the library's documented best
// practices (https://chenglou.me/pretext/):
//
//   - `prepare()` is the expensive one-time pass (normalize, segment, glue,
//     measure); `layout()` is the cheap pure-arithmetic hot path. NEVER
//     re-`prepare()` the same text+font — this module keeps a prepared cache
//     so hot-path consumers get exactly that contract for free.
//   - Two use-case layers:
//       * use case 1 — paragraph height without touching the DOM:
//         `measure(text, font, maxWidth, lineHeight)` -> { height, lineCount }
//       * use case 2 — manual line layout: `layoutLines()` / `walkLineRanges()`
//         / `layoutNextLineRange()` for variable-width flow (float-around,
//         virtualization), `materializeLineRange()` for the text back.
//   - shrinkwrap: `fitWidth()` returns the tightest container width via
//     `measureNaturalWidth()`; `truncate()` does single-line ellipsis by
//     binary-searching the longest prefix that still fits.
//   - rich-inline: `@chenglou/pretext/rich-inline` for atomic chips/mentions
//     (`break: 'never'`), caller-owned `extraWidth` chrome, and collapsed
//     boundary whitespace.
//   - `font` strings and `letterSpacing` MUST stay synced with the CSS you
//     measure against; `whiteSpace: 'pre-wrap'` for textarea-like text;
//     insert soft hyphens (`\u00AD`) before prepare for manual hyphenation.
//
// The module itself has no UI — it is a capability other client plugins (or
// the GUI) consume for precise text measurement / SVG / canvas layout.
//
// Build: this file STATICALLY imports both pretext entry points so the
// bundler inlines them (bun build --format=cjs, see package.json "build").
// The shipped client.js is the build artifact. Do NOT hand-edit client.js —
// a bare dynamic `import("@chenglou/pretext")` in a browser bundle fails to
// resolve (no importmap in the DSH web shell).
import * as pretext from "@chenglou/pretext";
import * as richInline from "@chenglou/pretext/rich-inline";
import { initHacker } from "./hacker.js";

window.__ModuleLoader__.load({
	id: "dsh-pretext",
	factory: (require) => {
		'use strict';
		var module = { exports: {} };
		var exports = module.exports;

		var VERSION = "0.3.0";

		// ---- prepared cache (best practice: prepare once, layout hot-path) ----
		// FIFO-evicting cache keyed by text|font|opts. `prepare()` and
		// `prepareWithSegments()` are memoized here; every high-level helper
		// below funnels through it.
		var cache = new Map();
		var cacheMax = 200;

		function cacheKey(text, font, opts) {
			return opts === undefined
				? text + "\u0001" + font
				: text + "\u0001" + font + "\u0001" + JSON.stringify(opts);
		}

		function getPrepared(text, font, opts, segments) {
			if (typeof text !== "string") throw new TypeError("dsh-pretext: text must be a string");
			if (typeof font !== "string" || font.length === 0)
				throw new TypeError("dsh-pretext: font must be a canvas font shorthand string (e.g. '16px Inter')");
			var key = cacheKey(text, font, opts);
			var entry = cache.get(key);
			if (entry === undefined) {
				entry = segments ? pretext.prepareWithSegments(text, font, opts) : pretext.prepare(text, font, opts);
				if (cache.size >= cacheMax) cache.delete(cache.keys().next().value);
				cache.set(key, entry);
			}
			return entry;
		}

		// ---- use case 1: height without DOM measurement ----
		function measure(text, font, maxWidth, lineHeight, opts) {
			if (!Number.isFinite(maxWidth)) throw new TypeError("dsh-pretext: measure maxWidth must be a number");
			return pretext.layout(getPrepared(text, font, opts, false), maxWidth, lineHeight === undefined ? 20 : lineHeight);
		}

		// ---- use case 2: manual line layout ----
		function layoutLines(text, font, maxWidth, lineHeight, opts) {
			if (!Number.isFinite(maxWidth)) throw new TypeError("dsh-pretext: layoutLines maxWidth must be a number");
			return pretext.layoutWithLines(getPrepared(text, font, opts, true), maxWidth, lineHeight === undefined ? 20 : lineHeight);
		}

		function walkLineRanges(text, font, maxWidth, onLine, opts) {
			if (typeof onLine !== "function") throw new TypeError("dsh-pretext: walkLineRanges onLine must be a function");
			return pretext.walkLineRanges(getPrepared(text, font, opts, true), maxWidth, onLine);
		}

		function measureStats(text, font, maxWidth, opts) {
			if (!Number.isFinite(maxWidth)) throw new TypeError("dsh-pretext: measureStats maxWidth must be a number");
			return pretext.measureLineStats(getPrepared(text, font, opts, true), maxWidth);
		}

		// ---- shrinkwrap: tightest container width that still fits ----
		function fitWidth(text, font, opts) {
			return pretext.measureNaturalWidth(getPrepared(text, font, opts, true));
		}

		// ---- single-line ellipsis truncation (binary search on prefix length) ----
		function truncate(text, font, maxWidth, opts) {
			if (!Number.isFinite(maxWidth)) throw new TypeError("dsh-pretext: truncate maxWidth must be a number");
			var ellipsis = (opts && opts.ellipsis) || "\u2026";
			var prepared = getPrepared(text, font, opts, true);
			if (pretext.measureLineStats(prepared, maxWidth).lineCount <= 1) return text;
			var firstLineText = "";
			pretext.walkLineRanges(prepared, maxWidth, function (line) {
				if (!firstLineText) firstLineText = pretext.materializeLineRange(prepared, line).text;
			});
			var chars = Array.from(firstLineText); // grapheme-ish safe iteration
			var ellipsisWidthOk = pretext.measureLineStats(getPrepared(ellipsis, font, undefined, true), maxWidth).lineCount <= 1;
			var lo = 0, hi = chars.length, best = "";
			while (lo <= hi) {
				var mid = (lo + hi) >> 1;
				var candidate = chars.slice(0, mid).join("") + ellipsis;
				if (pretext.measureLineStats(getPrepared(candidate, font, opts, true), maxWidth).lineCount <= 1) {
					best = candidate;
					lo = mid + 1;
				} else {
					hi = mid - 1;
				}
			}
			return ellipsisWidthOk && best ? best : ellipsis;
		}

		// ---- rich-inline passthrough ----
		function prepareRichInline(items) {
			if (!Array.isArray(items)) throw new TypeError("dsh-pretext: prepareRichInline items must be an array");
			return richInline.prepareRichInline(items);
		}
		function walkRichInlineLineRanges(prepared, maxWidth, onLine) {
			return richInline.walkRichInlineLineRanges(prepared, maxWidth, onLine);
		}
		function materializeRichInlineLineRange(prepared, line) {
			return richInline.materializeRichInlineLineRange(prepared, line);
		}
		function measureRichInlineStats(prepared, maxWidth) {
			return richInline.measureRichInlineStats(prepared, maxWidth);
		}
		function layoutNextRichInlineLineRange(prepared, maxWidth, start) {
			return richInline.layoutNextRichInlineLineRange(prepared, maxWidth, start);
		}

		// ---- cache / locale control ----
		function clearCache() {
			cache.clear();
			pretext.clearCache();
		}
		function setLocale(locale) {
			pretext.setLocale(locale);
		}
		function setCacheSize(n) {
			cacheMax = Math.max(1, n | 0);
			if (cache.size > cacheMax) {
				var it = cache.keys();
				while (cache.size > cacheMax) cache.delete(it.next().value);
			}
		}

		// ---- raw escape hatches (advanced / one-off use) ----
		var raw = {
			pretext: pretext,
			richInline: richInline
		};

		var api = {
			version: VERSION,
			// high-level, cache-backed helpers
			measure: measure,
			layoutLines: layoutLines,
			walkLineRanges: walkLineRanges,
			measureStats: measureStats,
			fitWidth: fitWidth,
			truncate: truncate,
			// memoized prepare entry points
			prepare: function (text, font, opts) { return getPrepared(text, font, opts, false); },
			prepareWithSegments: function (text, font, opts) { return getPrepared(text, font, opts, true); },
			// rich-inline
			prepareRichInline: prepareRichInline,
			walkRichInlineLineRanges: walkRichInlineLineRanges,
			materializeRichInlineLineRange: materializeRichInlineLineRange,
			measureRichInlineStats: measureRichInlineStats,
			layoutNextRichInlineLineRange: layoutNextRichInlineLineRange,
			richInline: richInline,
			// control
			clearCache: clearCache,
			setLocale: setLocale,
			setCacheSize: setCacheSize,
			// escape hatch
			raw: raw
		};

		// Hacker text-effect engine (configurable chat text effects, terminal
		// console control). Initialized in-browser; no-op surface otherwise.
		// Exposed as `api.hacker` so other plugins can toggle effects too.
		var hacker = initHacker(api);
		api.hacker = {
			getConfig: hacker.getConfig,
			patchConfig: hacker.patchConfig,
			execCommand: hacker.execCommand,
			destroy: hacker.destroy
		};

		// Cordis plugin shape: the browser-side runner applies every client
		// bundle through apply(ctx); a bundle whose export has no "apply"
		// method is rejected ("invalid plugin"). This module has no UI, so
		// apply is a no-op — the value it carries is the `ready` accessor.
		exports.name = "dsh-pretext";
		exports.apply = function () {};

		// `ready` resolves with the full API surface (compatible superset of
		// the v0.1.0 contract, which resolved to the bare pretext namespace).
		exports.ready = Promise.resolve(api);
		// Also expose the surface directly for synchronous `require` use.
		Object.assign(exports, api);
		return module.exports;
	}
});
