// DOM integration tests for the dsh-pretext browser bundle (happy-dom).
// Loads the built client.js through a fake __ModuleLoader__, drives the
// hacker engine (typewriter overlay, console, theme) and asserts on the DOM.
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/" });
globalThis.window = window;
globalThis.document = window.document;
globalThis.navigator = window.navigator;
globalThis.HTMLElement = window.HTMLElement;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.MutationObserver = window.MutationObserver;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

let failures = 0;
function assert(cond, label) {
  console.log((cond ? "  ✅ " : "  ❌ ") + label);
  if (!cond) failures++;
}

// --- load the bundle ---
const captured = {};
window.__ModuleLoader__ = { load: (m) => { captured.load = m; } };
await import("./client.js");
const mod = captured.load.factory(() => { throw new Error("no require"); });
const api = await mod.ready;
assert(typeof api.hacker === "object", "api.hacker exposed");

// --- theme + console are applied immediately on init ---
assert(document.documentElement.dataset.dshHacker === "on", "theme attr applied at init");
assert(document.getElementById("dsh-hk-console-btn") !== null, "console button created at init");

// --- typewriter: insert a long text via element (React-style) ---
api.hacker.execCommand("tw on");
assert(api.hacker.getConfig().typewriter === true, "typewriter enabled via command");
console.log("  [debug] right after tw on:", window.localStorage.getItem("dsh-pretext:hacker"));
const msg = document.createElement("div");
msg.textContent = "这是一个用于触发打字机覆盖层效果的很长的中文黑客风格测试文本它会逐字显示并且保持布局稳定不抖动。";
// happy-dom returns 0-sized rects; mock a real width so reveal can start
Object.defineProperty(msg, "getBoundingClientRect", {
  configurable: true,
  value: () => ({ width: 480, height: 24, top: 0, left: 0, right: 480, bottom: 24 })
});
document.body.appendChild(msg);

await new Promise((r) => setTimeout(r, 120));
const masks = document.querySelectorAll(".dsh-hk-twmask");
const clones = document.querySelectorAll(".dsh-hk-twclone");
assert(masks.length === 1, `typewriter mask created (got ${masks.length})`);
assert(clones.length === 1, `typewriter clone created (got ${clones.length})`);
if (masks.length === 1) {
  const w = parseFloat(masks[0].style.width) || 0;
  assert(w > 0 && w < 480, `mask width partially revealed (${w}px of 480)`);
}
const maskWidthNow = masks.length ? parseFloat(masks[0].style.width) : null;

// --- typewriter: React-style NESTED element tree (text at depth) ---
const nested = document.createElement("div");
const inner1 = document.createElement("div");
const inner2 = document.createElement("div");
const span = document.createElement("span");
span.textContent = "嵌套深度三层的中文文本用于验证递归收集逻辑是否真的能触发打字机覆盖层效果。";
inner2.appendChild(span);
inner1.appendChild(inner2);
nested.appendChild(inner1);
Object.defineProperty(nested, "getBoundingClientRect", {
  configurable: true,
  value: () => ({ width: 460, height: 24, top: 0, left: 0, right: 460, bottom: 24 })
});
document.body.appendChild(nested);
await new Promise((r) => setTimeout(r, 120));
const masksNested = document.querySelectorAll(".dsh-hk-twmask");
assert(masksNested.length === 1, `nested element tree (text at depth 3) triggers reveal (got ${masksNested.length})`);

// --- typewriter completes and cleans up ---
await new Promise((r) => setTimeout(r, 12000)); // speed 28 * 0.02/tick → ~0.56px/50ms → ~43s for 480px… speed it up instead
// faster: bump speed via command, wait, expect cleanup
api.hacker.execCommand("speed 200");
api.hacker.execCommand("tw on"); // re-arm? observer still active; reveal continues on the existing entry
await new Promise((r) => setTimeout(r, 2000));
// The reveal loop reads cfg.typewriterSpeed live; with 200 → 4px/50ms → 480px in ~6s
await new Promise((r) => setTimeout(r, 6000));
const remainingMasks = document.querySelectorAll(".dsh-hk-twmask").length;
assert(remainingMasks === 0, `reveal completed, mask removed (left ${remainingMasks})`);

// --- console command output ---
document.getElementById("dsh-hk-console-btn").click();
const box = document.getElementById("dsh-hk-console-box");
assert(box.classList.contains("dsh-hk-open"), "console opens on button click");
const field = document.getElementById("dsh-hk-console-field");
field.value = "status";
field.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
assert(document.getElementById("dsh-hk-console-out").textContent.includes("theme"), "status output lists config");

// --- persistence ---
const saved = window.localStorage.getItem("dsh-pretext:hacker");
console.log("  [debug] saved raw:", saved);
console.log("  [debug] localStorage len:", window.localStorage.length);
assert(saved !== null && JSON.parse(saved).typewriter === true, "config persisted to localStorage");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
