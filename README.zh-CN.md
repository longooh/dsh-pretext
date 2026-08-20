<div align="center">

[English](README.md) · **简体中文**

</div>

# dsh-pretext

将 [@chenglou/pretext](https://github.com/chenglou/pretext)（快速、精准、全面的
文本测量与排版库，基于 canvas，零回流）以 **client module** 形式集成进 DeepSeek
Harness Web GUI，并按官方最佳实践（[chenglou.me/pretext](https://chenglou.me/pretext/)）
做了封装。

- **宿主端（host）**：无操作加载入口（功能都在浏览器端）。
- **客户端（client）**：`require("dsh-pretext")` 返回 `{ ready }`；`await ready`
  得到完整的 `DshPretext` API 面。API 面同时也同步暴露在模块自身。
- **脚本端（宿主 / agent）**：`@chenglou/pretext` 作为本包依赖被 pnpm 提升
  （hoisted），Node / agent 代码可直接 `import("@chenglou/pretext")`。

## 为什么要包一层（最佳实践映射）

pretext 官方文档强调两条规则，这里都落实了：

1. **`prepare()` 只做一次，`layout()` 走热路径。** `prepare()` 是一次性重活
   （空白归一化、分词、粘连规则、canvas 测量）；`layout()` 是基于缓存宽度的
   纯算术，很便宜。同一文本+字体重复 `prepare()` 会浪费预计算。
   → 这里所有高层 helper **都有缓存兜底**（FIFO，默认 200 条，可
   `setCacheSize(n)` / `clearCache()` 调整）。resize 时反复调 `measure()`，
   prepared 分析结果会被复用。
2. **两个用例分层。** 库为两类消费形态设计，这里都暴露了：

   - **用例 1 —— 不碰 DOM 量高度**
     （虚拟化、瀑布流、JS 驱动的布局、开发期溢出检查、滚动锚定）：
     ```js
     const { measure } = require("dsh-pretext")
     const { height, lineCount } = measure('AGI 春天到了. بدأت الرحلة 🚀', '16px Inter', 320, 20)
     ```
   - **用例 2 —— 手动逐行排版**（canvas/SVG/WebGL 渲染、绕图、变宽流式排版）：
     ```js
     const { layoutLines, fitWidth } = require("dsh-pretext")
     const { lines } = layoutLines(text, '18px "Helvetica Neue"', 320, 26)
     lines.forEach((l, i) => ctx.fillText(l.text, 0, i * 26))
     // 能容纳这段文字的最紧容器宽度：
     const tight = fitWidth(text, '18px "Helvetica Neue"')
     ```

## API 面（`await ready`）

### 高层、带缓存 helper

| API | 说明 |
| --- | --- |
| `measure(text, font, maxWidth, lineHeight?, opts?)` | `{ height, lineCount }` —— 段落高度；缓存 prepared 之后的纯算术。 |
| `layoutLines(text, font, maxWidth, lineHeight?, opts?)` | `{ height, lineCount, lines }` —— 固定宽度手动排版的完整行信息。 |
| `walkLineRanges(text, font, maxWidth, onLine, opts?)` | 逐行回调 `{ width, start, end }` 范围，不拼字符串（试探宽度、shrinkwrap 用）。 |
| `measureStats(text, font, maxWidth, opts?)` | `{ lineCount, maxLineWidth }` —— 无分配的开销最小统计。 |
| `fitWidth(text, font, opts?)` | `number` —— `measureNaturalWidth()`：最宽的强制行宽，即能容纳文字的最紧容器宽度。 |
| `truncate(text, font, maxWidth, opts?)` | `string` —— 单行省略号截断；二分搜索最长可放下前缀（grapheme 安全）。`opts.ellipsis` 默认 `…`。 |
| `prepare(text, font, opts?)` / `prepareWithSegments(...)` | 记忆化入口，返回不透明 prepared 句柄供底层使用。 |

`opts` 与 pretext 一致：`{ whiteSpace?: 'normal' | 'pre-wrap', wordBreak?: 'normal' | 'keep-all', letterSpacing?: number }`。
**`font` 与 `letterSpacing` 必须和你测量的 CSS 保持一致**（`font` 就是
`ctx.font = ...` 的简写）。textarea 风格文本传 `whiteSpace: 'pre-wrap'`。

### 富文本内联流（原子 chip、mention、代码片段）

pretext 的窄接口内联 helper，这里透传：
`prepareRichInline(items)` → `walkRichInlineLineRanges` /
`measureRichInlineStats` / `materializeRichInlineLineRange` /
`layoutNextRichInlineLineRange`，另外直接暴露 `richInline` 命名空间。
item 支持 `break: 'never'`（原子项，如 chip/mention）和
`extraWidth`（调用方自有的横向留白，如胶囊 padding）。

### 控制与逃生门

- `clearCache()` —— 清空 prepared 条目 **和** pretext 内部缓存。
- `setLocale(locale?)` —— 分词 locale（影响断行）。
- `setCacheSize(n)` —— 限制 prepared 缓存容量（默认 200）。
- `raw.pretext` / `raw.richInline` —— 原始命名空间，一次性高级调用用
  （如带游标的 `layoutNextLineRange` 变宽流式排版）。

### 手动断词（hyphenation）

在 **任何 prepare/measure 调用之前**，往文本里插入软连字符（`\u00AD`）。
pretext 将其视为可选断点：未选中的软连字符不可见，选中的断点会物化为尾部 `-`。

## 注意事项

- 本 bundle **没有 UI** —— 它只是供其他 client 插件或 GUI 消费的能力。
  装上后看不到任何可见变化。
- `client.js` 是构建产物（`bun build src/client.js --outfile=client.js
  --format=cjs --target=browser`，即 `npm run build`）。不要手改。
  构建会**静态内联** pretext 两个入口（`@chenglou/pretext` 与
  `@chenglou/pretext/rich-inline`）——裸的动态 `import(...)` 在 DSH web shell
  里解析不了（没有 importmap）。
