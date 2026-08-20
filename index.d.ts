/**
 * dsh-pretext — client module type declarations.
 *
 * Consumed in the DSH web shell via:
 *   const { ready } = require("dsh-pretext");
 *   const pretext = await ready;   // resolves to DshPretext
 */

export interface PrepareOptions {
	whiteSpace?: "normal" | "pre-wrap";
	wordBreak?: "normal" | "keep-all";
	letterSpacing?: number;
}

export interface LayoutResult {
	height: number;
	lineCount: number;
}

export interface LayoutCursor {
	segmentIndex: number;
	graphemeIndex: number;
}

export interface LayoutLine {
	text: string;
	width: number;
	start: LayoutCursor;
	end: LayoutCursor;
}

export interface LayoutLineRange {
	width: number;
	start: LayoutCursor;
	end: LayoutCursor;
}

export interface LineStats {
	lineCount: number;
	maxLineWidth: number;
}

export interface RichInlineItem {
	text: string;
	font: string;
	letterSpacing?: number;
	break?: "normal" | "never";
	extraWidth?: number;
}

export interface DshPretext {
	readonly version: string;

	// Use case 1 — paragraph height without DOM measurement (cache-backed).
	measure(text: string, font: string, maxWidth: number, lineHeight?: number, opts?: PrepareOptions): LayoutResult;

	// Use case 2 — manual line layout (cache-backed).
	layoutLines(text: string, font: string, maxWidth: number, lineHeight?: number, opts?: PrepareOptions): LayoutResult & { lines: LayoutLine[] };
	walkLineRanges(text: string, font: string, maxWidth: number, onLine: (line: LayoutLineRange) => void, opts?: PrepareOptions): number;
	measureStats(text: string, font: string, maxWidth: number, opts?: PrepareOptions): LineStats;

	// Shrinkwrap helpers.
	fitWidth(text: string, font: string, opts?: PrepareOptions): number;
	truncate(text: string, font: string, maxWidth: number, opts?: PrepareOptions & { ellipsis?: string }): string;

	// Memoized prepare entry points.
	prepare(text: string, font: string, opts?: PrepareOptions): unknown;
	prepareWithSegments(text: string, font: string, opts?: PrepareOptions): unknown;

	// Rich-inline flow.
	prepareRichInline(items: RichInlineItem[]): unknown;
	walkRichInlineLineRanges(prepared: unknown, maxWidth: number, onLine: (line: unknown) => void): number;
	materializeRichInlineLineRange(prepared: unknown, line: unknown): unknown;
	measureRichInlineStats(prepared: unknown, maxWidth: number): LineStats;
	layoutNextRichInlineLineRange(prepared: unknown, maxWidth: number, start?: unknown): unknown;
	readonly richInline: unknown;

	// Control.
	clearCache(): void;
	setLocale(locale?: string): void;
	setCacheSize(n: number): void;

	// Escape hatch: raw pretext namespaces.
	readonly raw: { pretext: unknown; richInline: unknown };
}

declare const dshPretext: {
	name: string;
	apply(): void;
	ready: Promise<DshPretext>;
	// Synchronous surface mirrors DshPretext.
	readonly measure: DshPretext["measure"];
	readonly layoutLines: DshPretext["layoutLines"];
	readonly fitWidth: DshPretext["fitWidth"];
	readonly truncate: DshPretext["truncate"];
	readonly raw: DshPretext["raw"];
};

export = dshPretext;
