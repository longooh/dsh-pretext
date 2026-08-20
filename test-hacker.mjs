// Pure-logic tests for src/hacker.js (no DOM): config merge, command parsing,
// command application. DOM effects are verified in the browser.
import { resolveConfig, parseCommand, applyCommand, DEFAULT_CONFIG, HELP_TEXT } from "./src/hacker.js";

let failures = 0;
function assert(cond, label) {
  console.log((cond ? "  ✅ " : "  ❌ ") + label);
  if (!cond) failures++;
}

// --- resolveConfig ---
const d = resolveConfig({});
assert(d.theme === "matrix" && d.enabled === true && d.typewriter === false, "defaults applied");
const c1 = resolveConfig({ theme: "amber", typewriter: true, typewriterSpeed: 999, typewriterMinLen: 1 });
assert(c1.theme === "amber", "theme override");
assert(c1.typewriter === true, "bool override");
assert(c1.typewriterSpeed === 200, "speed clamped to 200");
assert(c1.typewriterMinLen === 8, "minLen floored at 8");
const c2 = resolveConfig({ theme: "nonsense", unknown: true, typewriterSpeed: "abc" });
assert(c2.theme === "matrix", "unknown theme ignored");
assert(c2.unknown === undefined, "unknown key ignored");
assert(c2.typewriterSpeed === 28, "garbage speed falls back");

// --- parseCommand ---
assert(!parseCommand("").ok, "empty rejected");
assert(!parseCommand(42).ok, "non-string rejected");
assert(parseCommand("help").name === "help", "help");
assert(parseCommand("?") .name === "help", "? alias");
assert(parseCommand("status").name === "status", "status");
assert(parseCommand("theme matrix").args[0] === "matrix", "theme matrix");
assert(!parseCommand("theme blue").ok, "theme blue rejected");
assert(parseCommand("tw on").name === "typewriter", "tw alias -> typewriter");
assert(!parseCommand("tw maybe").ok, "tw maybe rejected");
assert(parseCommand("rain on").name === "rain", "rain on");
assert(parseCommand("speed 50").args[0] === "50", "speed 50");
assert(!parseCommand("speed fast").ok, "speed fast rejected");
assert(parseCommand("all off").name === "all", "all off");
assert(!parseCommand("all").ok, "all without arg rejected");
assert(!parseCommand("hack").ok, "unknown command rejected");

// --- applyCommand ---
let cfg = resolveConfig({});
let r = applyCommand(cfg, parseCommand("theme amber"));
assert(r.cfg.theme === "amber", "apply theme amber");
r = applyCommand(r.cfg, parseCommand("tw on"));
assert(r.cfg.typewriter === true, "apply typewriter on");
r = applyCommand(r.cfg, parseCommand("speed 120"));
assert(r.cfg.typewriterSpeed === 120, "apply speed 120");
r = applyCommand(r.cfg, parseCommand("rain on"));
assert(r.cfg.rain === true, "apply rain on");
r = applyCommand(r.cfg, parseCommand("scanlines on"));
assert(r.cfg.scanlines === true, "apply scanlines on");
r = applyCommand(r.cfg, parseCommand("all off"));
assert(!r.cfg.enabled && !r.cfg.typewriter && !r.cfg.rain, "all off disables everything");
r = applyCommand(r.cfg, parseCommand("all on"));
assert(r.cfg.enabled && r.cfg.rain && r.cfg.glow && r.cfg.cursor, "all on enables everything");
r = applyCommand(r.cfg, parseCommand("status"));
assert(typeof r.reply === "string" && r.reply.includes("theme"), "status reply lists keys");
r = applyCommand(r.cfg, parseCommand("reset"));
assert(r.cfg.theme === DEFAULT_CONFIG.theme && !r.cfg.rain, "reset restores defaults");
r = applyCommand(r.cfg, parseCommand("help"));
assert(r.reply === HELP_TEXT, "help reply");
r = applyCommand(r.cfg, parseCommand("bogus"));
assert(r.reply.startsWith("ERR"), "error reply prefixed with ERR");
// error passthrough keeps cfg untouched
const before = JSON.stringify(r.cfg);
r = applyCommand(r.cfg, parseCommand(""));
assert(JSON.stringify(r.cfg) === before, "failed command does not mutate cfg");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
