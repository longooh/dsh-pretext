// dsh-pretext — browser half (client plugin bundle).
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
window.__ModuleLoader__.load({
	id: "dsh-pretext",
	factory: (require) => {
		'use strict';
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// pretext is ESM-only; dynamic import resolves through the profile's
		// node_modules (hoisted by pnpm). `ready` settles with the module
		// namespace once loaded.
		module.exports = {
			id: "dsh-pretext",
			ready: import("@chenglou/pretext")
		};
		return module.exports;
	}
});
