// dsh-pretext — Hacker text-effect engine (browser half).
//
// Adds configurable "hacker / terminal" text effects to the DSH Web GUI chat:
//
//   - Phosphor themes: matrix (green), amber, mono — applied via CSS custom
//     properties on <html data-dsh-hacker="<theme>"> so the effect is a pure
//     style layer; safe against unknown DOM structure.
//   - Typewriter reveal: DOM-agnostic overlay technique. A MutationObserver
//     spots long text insertions, then a pair of absolutely-positioned
//     siblings — a solid mask + a clipped text clone — reveal the text left
//     to right WITHOUT touching the React-managed text node (inserting spans
//     would break React reconciliation). Off by default.
//   - Matrix rain canvas overlay + CRT scanline overlay (both opt-in,
//     pointer-events: none).
//   - Terminal command console (bottom-right `>_`): type commands like a
//     hacker to toggle/configure effects. Config persists to localStorage
//     under "dsh-pretext:hacker".
//
// Pure logic (parseCommand / resolveConfig / applyCommand) is exported for
// Node testing; initHacker() guards for browser-only APIs and returns a
// functional no-op surface in non-DOM environments.

export var VERSION = "0.3.0";
export var STORAGE_KEY = "dsh-pretext:hacker";

export var DEFAULT_CONFIG = {
	enabled: true,
	theme: "matrix", // matrix | amber | mono
	typewriter: false, // overlay reveal (opt-in; see notes)
	typewriterSpeed: 28, // reveal width % per tick, ~chars/s feel
	typewriterMinLen: 24, // min inserted-text length to trigger reveal
	cursor: true, // blinking block cursor on active message
	rain: false, // Matrix rain canvas overlay
	scanlines: false, // CRT scanline overlay
	glow: true, // phosphor text glow
	console: true // terminal console button (bottom-right)
};

var THEMES = {
	matrix: { bg: "#050805", fg: "#00ff66", dim: "#0a6b34", accent: "#00ffcc", caret: "#00ff66" },
	amber: { bg: "#0a0700", fg: "#ffb000", dim: "#6b4a0a", accent: "#ffd166", caret: "#ffb000" },
	mono: { bg: "#0a0a0a", fg: "#d0d0d0", dim: "#555555", accent: "#ffffff", caret: "#d0d0d0" }
};

// ---- pure logic (testable without DOM) ----

/** Merge a partial config over DEFAULTS, coercing known keys to their types. */
export function resolveConfig(partial) {
	var cfg = {};
	for (var k in DEFAULT_CONFIG) cfg[k] = DEFAULT_CONFIG[k];
	if (partial && typeof partial === "object") {
		for (var key in partial) {
			if (!(key in DEFAULT_CONFIG)) continue;
			var v = partial[key];
			switch (key) {
				case "theme":
					if (THEMES[v]) cfg.theme = v;
					break;
				case "typewriterSpeed":
					cfg.typewriterSpeed = Math.max(1, Math.min(200, Number(v) || 28));
					break;
				case "typewriterMinLen":
					cfg.typewriterMinLen = Math.max(8, Math.min(2000, Number(v) || 24));
					break;
				default:
					cfg[key] = Boolean(v);
			}
		}
	}
	return cfg;
}

var BOOL_CMDS = { typewriter: "typewriter", tw: "typewriter", rain: "rain", scanlines: "scanlines", glow: "glow", cursor: "cursor", console: "console" };

/** Parse one console command line into a structured command. */
export function parseCommand(line) {
	if (typeof line !== "string") return { ok: false, error: "input must be a string" };
	var text = line.trim();
	if (!text) return { ok: false, error: "empty command" };
	var parts = text.split(/\s+/);
	var name = parts[0].toLowerCase();
	var args = parts.slice(1);
	switch (name) {
		case "help": case "?": return { ok: true, name: "help", args };
		case "status": return { ok: true, name: "status", args };
		case "reset": return { ok: true, name: "reset", args };
		case "all":
			if (args.length !== 1 || !/^(on|off)$/i.test(args[0])) return { ok: false, error: "usage: all <on|off>" };
			return { ok: true, name: "all", args: [args[0].toLowerCase()] };
		case "theme":
			if (args.length !== 1 || !THEMES[args[0].toLowerCase()]) return { ok: false, error: "usage: theme <matrix|amber|mono>" };
			return { ok: true, name: "theme", args: [args[0].toLowerCase()] };
		case "speed":
			if (args.length !== 1 || !/^\d+$/.test(args[0])) return { ok: false, error: "usage: speed <1-200>" };
			return { ok: true, name: "speed", args: [args[0]] };
		case "typewriter": case "tw":
		case "rain": case "scanlines": case "glow": case "cursor": case "console":
			if (args.length !== 1 || !/^(on|off)$/i.test(args[0])) return { ok: false, error: "usage: " + name + " <on|off>" };
			return { ok: true, name: BOOL_CMDS[name], args: [args[0].toLowerCase()] };
		default:
			return { ok: false, error: "unknown command '" + name + "' (try 'help')" };
	}
}

/** Apply a parsed command to a config snapshot; returns { cfg, reply }. */
export function applyCommand(cfg, parsed) {
	if (!parsed.ok) return { cfg: cfg, reply: "ERR: " + parsed.error };
	var next = resolveConfig(cfg);
	switch (parsed.name) {
		case "help":
			return { cfg: cfg, reply: HELP_TEXT };
		case "status": {
			var lines = ["status:"];
			for (var k in DEFAULT_CONFIG) lines.push("  " + k + " = " + next[k]);
			return { cfg: cfg, reply: lines.join("\n") };
		}
		case "reset":
			return { cfg: resolveConfig({}), reply: "config reset to defaults" };
		case "all": {
			var on = parsed.args[0] === "on";
			next.enabled = on;
			next.typewriter = on;
			next.rain = on;
			next.scanlines = on;
			next.glow = on;
			next.cursor = on;
			return { cfg: next, reply: (on ? "all effects ON — welcome to the matrix" : "all effects OFF — back to normal") };
		}
		case "theme":
			next.theme = parsed.args[0];
			return { cfg: next, reply: "theme -> " + next.theme + " (" + Object.keys(THEMES).join("|") + ")" };
		case "speed":
			next.typewriterSpeed = resolveConfig({ typewriterSpeed: parsed.args[0] }).typewriterSpeed;
			return { cfg: next, reply: "typewriter speed -> " + next.typewriterSpeed };
		case "typewriter":
			next.typewriter = parsed.args[0] === "on";
			return { cfg: next, reply: "typewriter -> " + (next.typewriter ? "on" : "off") };
		case "rain":
			next.rain = parsed.args[0] === "on";
			return { cfg: next, reply: "matrix rain -> " + (next.rain ? "on" : "off") };
		case "scanlines":
			next.scanlines = parsed.args[0] === "on";
			return { cfg: next, reply: "scanlines -> " + (next.scanlines ? "on" : "off") };
		case "glow":
			next.glow = parsed.args[0] === "on";
			return { cfg: next, reply: "glow -> " + (next.glow ? "on" : "off") };
		case "cursor":
			next.cursor = parsed.args[0] === "on";
			return { cfg: next, reply: "block cursor -> " + (next.cursor ? "on" : "off") };
		case "console":
			next.console = parsed.args[0] === "on";
			return { cfg: next, reply: "console button -> " + (next.console ? "on" : "off") };
		default:
			return { cfg: cfg, reply: "ERR: unhandled command" };
	}
}

export var HELP_TEXT = [
	"dsh-pretext hacker console",
	"  theme <matrix|amber|mono>  phosphor theme",
	"  typewriter <on|off>        overlay text reveal",
	"  speed <1-200>              typewriter speed",
	"  rain <on|off>              matrix rain canvas",
	"  scanlines <on|off>         CRT scanlines",
	"  glow <on|off>              text glow",
	"  cursor <on|off>            block caret",
	"  console <on|off>           this console button",
	"  all <on|off>               master switch",
	"  status                     show config",
	"  reset                      restore defaults",
	"  help                       this list"
].join("\n");

// ---- browser half ----

function isBrowser() {
	return typeof window !== "undefined" && typeof document !== "undefined";
}

var injectedStyle = null;

function injectStyles() {
	if (injectedStyle !== null) return injectedStyle;
	var css = [
		"html[data-dsh-hacker] { color-scheme: dark; }",
		// Overlay layers are always present (display toggled by config).
		"#dsh-hk-rain, #dsh-hk-scan, #dsh-hk-caret, #dsh-hk-console { display: none; }",
		"#dsh-hk-rain { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; opacity: .55; }",
		"#dsh-hk-scan { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; ",
		"  background: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px); }",
		"#dsh-hk-caret { position: absolute; z-index: 2147483645; width: .6em; height: 1.1em; ",
		"  pointer-events: none; animation: dsh-hk-blink 1s steps(1) infinite; }",
		"@keyframes dsh-hk-blink { 50% { opacity: 0; } }",
		// Theme-driven chrome.
		"#dsh-hk-console { position: fixed; right: 14px; bottom: 14px; z-index: 2147483647; }",
		"#dsh-hk-console-btn { display: block; width: 44px; height: 44px; border: 1px solid var(--dsh-hk-fg); ",
		"  background: var(--dsh-hk-bg); color: var(--dsh-hk-fg); font: 700 16px/1 'SF Mono', ui-monospace, monospace; ",
		"  cursor: pointer; box-shadow: 0 0 12px color-mix(in srgb, var(--dsh-hk-fg) 45%, transparent); }",
		"#dsh-hk-console-btn:hover { background: color-mix(in srgb, var(--dsh-hk-fg) 14%, var(--dsh-hk-bg)); }",
		"#dsh-hk-console-box { display: none; position: absolute; right: 0; bottom: 52px; width: 400px; max-width: 86vw; ",
		"  border: 1px solid var(--dsh-hk-fg); background: color-mix(in srgb, var(--dsh-hk-bg) 96%, black); ",
		"  box-shadow: 0 0 24px color-mix(in srgb, var(--dsh-hk-fg) 30%, transparent); font: 12px/1.5 'SF Mono', ui-monospace, monospace; }",
		"#dsh-hk-console-box.dsh-hk-open { display: block; }",
		"#dsh-hk-console-head { padding: 6px 10px; border-bottom: 1px solid color-mix(in srgb, var(--dsh-hk-fg) 40%, transparent); ",
		"  color: var(--dsh-hk-dim); letter-spacing: .08em; text-transform: uppercase; }",
		"#dsh-hk-console-out { height: 180px; overflow-y: auto; padding: 8px 10px; white-space: pre-wrap; ",
		"  color: var(--dsh-hk-fg); }",
		"#dsh-hk-console-in { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-top: 1px solid ",
		"  color-mix(in srgb, var(--dsh-hk-fg) 40%, transparent); }",
		"#dsh-hk-console-prompt { color: var(--dsh-hk-accent); }",
		"#dsh-hk-console-field { flex: 1; background: transparent; border: 0; outline: 0; color: var(--dsh-hk-fg); ",
		"  font: inherit; caret-color: var(--dsh-hk-caret, var(--dsh-hk-fg)); }",
		// Typewriter reveal overlay (created per message, styled here).
		".dsh-hk-twmask, .dsh-hk-twclone { position: absolute; top: 0; bottom: 0; right: 0; }",
		".dsh-hk-twmask { left: 0; z-index: 1; }",
		".dsh-hk-twclone { overflow: hidden; z-index: 2; }"
	].join("\n");
	injectedStyle = document.createElement("style");
	injectedStyle.id = "dsh-hk-style";
	injectedStyle.textContent = css;
	(document.head || document.documentElement).appendChild(injectedStyle);
	return injectedStyle;
}

function applyTheme(theme) {
	var t = THEMES[theme] || THEMES.matrix;
	var root = document.documentElement;
	root.style.setProperty("--dsh-hk-bg", t.bg);
	root.style.setProperty("--dsh-hk-fg", t.fg);
	root.style.setProperty("--dsh-hk-dim", t.dim);
	root.style.setProperty("--dsh-hk-accent", t.accent);
	root.style.setProperty("--dsh-hk-caret", t.caret);
	root.style.setProperty("--dsh-hk-glow", t.fg + "66");
	root.dataset.dshHacker = "on";
	root.classList.add("dsh-hacker");
}

function clearTheme() {
	var root = document.documentElement;
	delete root.dataset.dshHacker;
	root.classList.remove("dsh-hacker");
}

function applyConfig(cfg, ui) {
	if (!cfg.enabled) {
		clearTheme();
		ui.rain.style.display = "none";
		ui.scan.style.display = "none";
		ui.caret.style.display = "none";
		ui.btn.style.display = "none";
		ui.box.classList.remove("dsh-hk-open");
		return;
	}
	applyTheme(cfg.theme);
	ui.rain.style.display = cfg.rain ? "block" : "none";
	ui.scan.style.display = cfg.scanlines ? "block" : "none";
	ui.caret.style.display = cfg.cursor ? "block" : "none";
	ui.btn.style.display = cfg.console ? "block" : "none";
}

// ---- Matrix rain ----

function startRain(canvas) {
	var ctx = canvas.getContext("2d");
	var cols, drops;
	var glyphs = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>[]{}#$%&*+=;:";
	function resize() {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		cols = Math.floor(canvas.width / 16);
		drops = new Array(cols).fill(1);
	}
	function tick() {
		ctx.fillStyle = "rgba(5,8,5,.12)";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = "#00ff66";
		ctx.font = "14px monospace";
		for (var i = 0; i < cols; i++) {
			var ch = glyphs[Math.floor(Math.random() * glyphs.length)];
			ctx.fillText(ch, i * 16, drops[i] * 16);
			if (drops[i] * 16 > canvas.height && Math.random() > .975) drops[i] = 0;
			drops[i]++;
		}
		raf = requestAnimationFrame(tick);
	}
	var raf = 0;
	window.addEventListener("resize", resize);
	resize();
	tick();
	return function stop() {
		cancelAnimationFrame(raf);
		window.removeEventListener("resize", resize);
	};
}

// ---- Typewriter reveal (overlay, React-safe) ----

function startTypewriter(cfgRef, ui) {
	var active = new Map(); // blockEl -> { mask, clone, w, revealed }
	function revealTick(block) {
		var entry = active.get(block);
		if (!entry) return;
		entry.revealed += cfgRef.current.typewriterSpeed * 0.02; // per 50ms tick
		if (entry.revealed >= entry.w) {
			entry.revealed = entry.w;
			entry.mask.remove();
			entry.clone.remove();
			active.delete(block);
			return;
		}
		entry.mask.style.width = (entry.w - entry.revealed) + "px";
		entry.clone.style.clipPath = "inset(0 " + (entry.w - entry.revealed) + "px 0 0)";
		setTimeout(function () { revealTick(block); }, 50);
	}
	function handleTextNode(node) {
		if (!node.parentElement) return;
		var el = node.parentElement;
		if (el.closest("#dsh-hk-console-box, #dsh-hk-console, script, style, textarea, input")) return;
		var text = node.nodeValue || "";
		if (text.trim().length < cfgRef.current.typewriterMinLen) return;
		// block-ish ancestor that we can position against
		var block = el;
		while (block && block !== document.body && getComputedStyle(block).display === "inline") block = block.parentElement;
		if (!block || block === document.body || block === document.documentElement) return;
		if (active.has(block)) return;
		if (getComputedStyle(block).position === "static") block.style.position = "relative";
		var rect = block.getBoundingClientRect();
		var w = rect.width;
		if (!w || w <= 0) return;
		var bg = getComputedStyle(block).backgroundColor;
		if (!bg || bg === "rgba(0, 0, 0, 0)") bg = "var(--dsh-hk-bg)";
		var mask = document.createElement("div");
		mask.className = "dsh-hk-twmask";
		mask.style.background = bg;
		var clone = document.createElement("div");
		clone.className = "dsh-hk-twclone";
		clone.textContent = text;
		clone.style.color = "inherit";
		clone.style.font = getComputedStyle(el).font;
		clone.style.lineHeight = getComputedStyle(el).lineHeight;
		clone.style.clipPath = "inset(0 " + w + "px 0 0)";
		block.appendChild(mask);
		block.appendChild(clone);
		active.set(block, { mask: mask, clone: clone, w: w, revealed: 0 });
		revealTick(block);
	}
	var mo = new MutationObserver(function (muts) {
		for (var i = 0; i < muts.length; i++) {
			var m = muts[i];
			if (m.type === "childList") {
				for (var j = 0; j < m.addedNodes.length; j++) {
					// addedNodes may be element nodes whose text lives in
					// child text nodes (React-style) — collect direct text
					// children too, not just bare text nodes.
					var added = m.addedNodes[j];
					if (added.nodeType === 3) {
						handleTextNode(added);
					} else if (added.nodeType === 1) {
						var kids = added.childNodes;
						for (var k = 0; k < kids.length; k++) {
							if (kids[k].nodeType === 3) handleTextNode(kids[k]);
						}
					}
				}
			} else if (m.type === "characterData") {
				handleTextNode(m.target);
			}
		}
	});
	mo.observe(document.body, { childList: true, characterData: true, subtree: true });
	return function stop() {
		mo.disconnect();
		active.forEach(function (e) { e.mask.remove(); e.clone.remove(); });
		active.clear();
	};
}

// ---- caret ----

function startCaret(ui) {
	// Follow the most recently revealed text block: keep it simple, park the
	// caret next to the console button's target area is meaningless — instead
	// we place it at the bottom of the last typewriter block, or the message
	// area's end. Without DOM knowledge we anchor it to the last block that
	// got a reveal; otherwise it sits at the top-right of the viewport.
	var target = null;
	ui.caret.style.display = "block";
	function place() {
		var el = target || document.body;
		var r = el.getBoundingClientRect();
		ui.caret.style.left = (r.right + 2) + "px";
		ui.caret.style.top = (r.bottom - 4) + "px";
		ui.caret.style.background = "var(--dsh-hk-caret)";
	}
	place();
	var timer = setInterval(place, 400);
	return function stop() { clearInterval(timer); ui.caret.style.display = "none"; };
}

// ---- console ----

function buildConsole(api, cfgRef, applyUi) {
	var root = document.createElement("div");
	root.id = "dsh-hk-console";
	var btn = document.createElement("button");
	btn.id = "dsh-hk-console-btn";
	btn.type = "button";
	btn.title = "dsh-pretext hacker console";
	btn.textContent = ">_";
	var box = document.createElement("div");
	box.id = "dsh-hk-console-box";
	var head = document.createElement("div");
	head.id = "dsh-hk-console-head";
	head.textContent = "dsh-pretext v" + VERSION + " — hacker console (type 'help')";
	var out = document.createElement("div");
	out.id = "dsh-hk-console-out";
	var row = document.createElement("div");
	row.id = "dsh-hk-console-in";
	var prompt = document.createElement("span");
	prompt.id = "dsh-hk-console-prompt";
	prompt.textContent = "❯";
	var field = document.createElement("input");
	field.id = "dsh-hk-console-field";
	field.type = "text";
	field.autocomplete = "off";
	field.spellcheck = false;
	row.appendChild(prompt);
	row.appendChild(field);
	box.appendChild(head);
	box.appendChild(out);
	box.appendChild(row);
	root.appendChild(btn);
	root.appendChild(box);
	document.body.appendChild(root);

	btn.addEventListener("click", function () {
		var open = box.classList.toggle("dsh-hk-open");
		if (open) field.focus();
	});
	function print(s) {
		out.textContent = (out.textContent ? out.textContent + "\n" : "") + s;
		out.scrollTop = out.scrollHeight;
	}
	function submit() {
		var line = field.value;
		field.value = "";
		if (!line.trim()) return;
		print("❯ " + line);
		var parsed = parseCommand(line);
		var res = applyCommand(cfgRef.current, parsed);
		applyUi(res.cfg);
		print(res.reply);
	}
	field.addEventListener("keydown", function (e) {
		if (e.key === "Enter") submit();
		if (e.key === "Escape") box.classList.remove("dsh-hk-open");
	});
	print("dsh-pretext hacker console ready. type 'help'.");
	return { root: root, btn: btn, box: box };
}

// ---- entry ----

export function initHacker(api) {
	if (!isBrowser()) {
		// Non-DOM environment: functional no-op surface for tests.
		var ncfg = resolveConfig({});
		return {
			getConfig: function () { return resolveConfig(ncfg); },
			patchConfig: function (patch) { ncfg = resolveConfig(patch); return resolveConfig(ncfg); },
			execCommand: function (line) { return applyCommand(ncfg, parseCommand(line)).reply; },
			destroy: function () {}
		};
	}

	var cfg = resolveConfig({});
	try {
		var raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw) cfg = resolveConfig(JSON.parse(raw));
	} catch (e) { /* corrupted storage -> defaults */ }

	// Shared config reference: the typewriter engine and other long-lived
	// loops must observe LIVE config, not a snapshot taken at start.
	var cfgRef = { current: cfg };

	injectStyles();

	// Overlay layers.
	var rain = document.createElement("canvas");
	rain.id = "dsh-hk-rain";
	var scan = document.createElement("div");
	scan.id = "dsh-hk-scan";
	var caret = document.createElement("div");
	caret.id = "dsh-hk-caret";
	document.body.appendChild(rain);
	document.body.appendChild(scan);
	document.body.appendChild(caret);

	var stopRain = null;
	var stopTw = null;
	var consoleUi = null;

	function persist() {
		try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) { /* quota */ }
	}
	function applyUi(nextCfg) {
		cfg = nextCfg;
		cfgRef.current = nextCfg;
		persist();
		if (!consoleUi) consoleUi = buildConsole(api, cfgRef, applyUi);
		applyConfig(cfg, {
			rain: rain, scan: scan, caret: caret,
			btn: consoleUi.btn, box: consoleUi.box
		});
		if (cfg.rain && stopRain === null) stopRain = startRain(rain);
		if (!cfg.rain && stopRain !== null) { stopRain(); stopRain = null; rain.getContext("2d").clearRect(0, 0, rain.width, rain.height); }
		if (cfg.typewriter && stopTw === null) stopTw = startTypewriter(cfgRef, {});
		if (!cfg.typewriter && stopTw !== null) { stopTw(); stopTw = null; }
		// caret follows reveal activity: simple static anchor for now
		caret.style.background = THEMES[cfg.theme].caret;
		caret.style.display = cfg.cursor ? "block" : "none";
	}
	applyUi(cfg);

	return {
		getConfig: function () { return resolveConfig(cfg); },
		patchConfig: function (patch) { applyUi(resolveConfig(Object.assign({}, cfg, patch))); return resolveConfig(cfg); },
		execCommand: function (line) {
			var res = applyCommand(cfg, parseCommand(line));
			applyUi(res.cfg);
			return res.reply;
		},
		destroy: function () {
			if (stopRain) stopRain();
			if (stopTw) stopTw();
			if (consoleUi) { consoleUi.root.remove(); }
			rain.remove(); scan.remove(); caret.remove();
			if (injectedStyle) injectedStyle.remove();
			clearTheme();
		}
	};
}
