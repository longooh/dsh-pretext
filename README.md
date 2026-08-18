# dsh-pretext

Integrates [@chenglou/pretext](https://github.com/chenglou/pretext) (fast,
accurate & comprehensive text measurement & layout, canvas-based) into the
DeepSeek Harness Web GUI as a client module.

- **Host side**: no-op loader entry (feature lives in the browser half).
- **Client side**: `require("dsh-pretext")` returns `{ ready }`; `await ready`
  yields the pretext module namespace (`measureText`, `layout`, `rich-inline`).
- **Scripts (host / agent side)**: `@chenglou/pretext` is installed as a
  dependency of this package and hoisted by pnpm, so Node/agent code can
  `import("@chenglou/pretext")` directly.
