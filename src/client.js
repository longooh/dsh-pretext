// dsh-pretext — browser half (client plugin bundle), SOURCE.
//
// Exposes @chenglou/pretext (fast, accurate text measurement & layout,
// canvas-based, zero reflow) as a DSH client module. pretext ships ESM-only,
// so the module surface is an async accessor:
//
//   const { ready } = require("dsh-pretext");
//   const pretext = await ready;      // -> pretext module namespace
//   pretext.measureText(ctx, text, font, opts) ...
//
// The bundle itself has no UI: it is a capability the GUI or other client
// plugins can consume for precise text measurement / SVG layout.
//
// Build: this file is STATICALLY importing pretext so the bundler inlines it
// (bun build --format=cjs, see package.json "build"). The shipped client.js
// is the build artifact. Do NOT hand-edit client.js — a bare dynamic
// `import("@chenglou/pretext")` in a browser bundle fails to resolve (no
// importmap in the DSH web shell), which is what previously left the module
// permanently un-ready.
import * as pretext from "@chenglou/pretext";

window.__ModuleLoader__.load({
	id: "dsh-pretext",
	factory: (require) => {
		'use strict';
		var module = { exports: {} };
		var exports = module.exports;

		// Cordis plugin shape: the browser-side runner applies every client
		// bundle through apply(ctx); a bundle whose export has no "apply"
		// method is rejected ("invalid plugin"). This module has no UI, so
		// apply is a no-op — the value it carries is the `ready` accessor.
		exports.name = "dsh-pretext";
		exports.apply = function () {};

		exports.ready = Promise.resolve(pretext);
		return module.exports;
	}
});
