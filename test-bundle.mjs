// Bundle smoke test for dsh-pretext client.js (Node, mock canvas).
// Verifies the WRAPPER logic (cache, API surface, truncate/fitWidth/layoutLines)
// — not pretext's own font measurement accuracy (that needs a real browser).
globalThis.OffscreenCanvas = class {
  constructor() {}
  getContext() {
    return {
      font: "",
      measureText: (s) => ({
        width: Array.from(s).reduce((acc, ch) => acc + (ch.codePointAt(0) > 0x2e80 ? 16 : 8), 0),
      }),
    };
  }
};

const captured = {};
globalThis.window = { __ModuleLoader__: { load: (m) => { captured.load = m; } } };

await import("/Users/longoo/dsh-pretext/client.js");
const mod = captured.load.factory((id) => { throw new Error("unexpected require: " + id); });

let failures = 0;
function assert(cond, label) {
  console.log((cond ? "  ✅ " : "  ❌ ") + label);
  if (!cond) failures++;
}

// --- cordis shape ---
assert(mod.name === "dsh-pretext", "exports.name");
assert(typeof mod.apply === "function", "exports.apply is function");
assert(mod.ready instanceof Promise, "exports.ready is Promise");

const api = await mod.ready;
console.log("  API keys:", Object.keys(api).join(", "));

// --- measure (use case 1) ---
const r = api.measure("AGI 春天到了 🚀", "16px Inter", 200, 20);
assert(Number.isFinite(r.height) && Number.isInteger(r.lineCount) && r.lineCount >= 1, `measure -> {height:${r.height}, lineCount:${r.lineCount}}`);
const rWrap = api.measure("这是一个非常长的中文测试字符串它一定会换行", "16px Inter", 100, 20);
assert(rWrap.lineCount > 1, `long CJK wraps at 100px (lineCount=${rWrap.lineCount})`);
assert(rWrap.height === rWrap.lineCount * 20, "height = lineCount * lineHeight");

// --- cache reuse: same text+font hits cache (no error, consistent result) ---
const r1 = api.measure("AGI 春天到了 🚀", "16px Inter", 200, 20);
assert(r.height === r1.height && r.lineCount === r1.lineCount, "cached measure identical");

// --- layoutLines (use case 2) ---
const r2 = api.layoutLines("hello world", "16px Inter", 100, 20);
assert(Array.isArray(r2.lines) && r2.lines.length === r2.lineCount, "layoutLines returns lines[]");
assert(r2.lines.every((l) => typeof l.text === "string" && Number.isFinite(l.width)), "lines have text+width");

// --- fitWidth (shrinkwrap) ---
const fw = api.fitWidth("hello", "16px Inter");
assert(Number.isFinite(fw) && fw > 0, `fitWidth -> ${fw}`);

// --- truncate (ellipsis) ---
const long = "这是一个很长的中文测试字符串用于截断验证";
const t = api.truncate(long, "16px Inter", 100);
assert(typeof t === "string" && t.endsWith("…"), `truncate ends with ellipsis: "${t}"`);
assert(t.length < long.length, "truncate shortened text");
const tShort = api.truncate("短", "16px Inter", 100);
assert(tShort === "短", "short text returned untouched");
const tCustom = api.truncate(long, "16px Inter", 100, { ellipsis: "..." });
assert(tCustom.endsWith("..."), "custom ellipsis honored");

// --- walkLineRanges / measureStats ---
let walked = 0;
api.walkLineRanges("aaa bbb ccc ddd eee", "16px Inter", 60, () => walked++);
assert(walked >= 2, `walkLineRanges visited ${walked} lines`);
const st = api.measureStats("aaa bbb ccc ddd eee", "16px Inter", 60);
assert(st.lineCount === walked && Number.isFinite(st.maxLineWidth), "measureStats matches walker");

// --- prepare memoization ---
const p1 = api.prepare("cache me", "16px Inter");
const p2 = api.prepare("cache me", "16px Inter");
assert(p1 === p2, "prepare memoized (same handle)");
api.setCacheSize(1);
const p3 = api.prepare("other text", "16px Inter");
const p4 = api.prepare("cache me", "16px Inter");
assert(p3 !== p4, "FIFO eviction works (different handles after evict)");
api.clearCache();
const p5 = api.prepare("cache me", "16px Inter");
assert(p5 !== p4, "clearCache drops entries");

// --- input validation ---
try { api.measure(123, "16px Inter", 100, 20); assert(false, "measure rejects non-string text"); }
catch { assert(true, "measure rejects non-string text"); }
try { api.measure("x", "", 100, 20); assert(false, "measure rejects empty font"); }
catch { assert(true, "measure rejects empty font"); }
try { api.layoutLines("x", "16px Inter", NaN, 20); assert(false, "layoutLines rejects NaN width"); }
catch { assert(true, "layoutLines rejects NaN width"); }

// --- raw escape hatch ---
assert(api.raw && api.raw.pretext && api.raw.pretext.layout, "raw.pretext exposed");
assert(api.raw.richInline && typeof api.raw.richInline.prepareRichInline === "function", "raw.richInline exposed");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
