import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";

test("lowers object fit utilities into ScaleType on image hosts", () => {
	const result = transform(
		`export const A = () => <imagelabel className="object-cover" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/ScaleType=\{Enum\.ScaleType\.Crop\}/);

	const tile = transform(
		`export const B = () => <imagebutton className="object-tile" />;`,
		null,
	);
	expect(tile.code).toMatch(/ScaleType=\{Enum\.ScaleType\.Tile\}/);

	const invalid = transform(
		`export const C = () => <imagelabel className="object-left" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-object-fit-value" }),
	]);
});

test("lowers pointer events into Interactable", () => {
	const result = transform(
		`export const A = () => <frame className="pointer-events-none" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/Interactable=\{false\}/);

	const auto = transform(
		`export const B = () => <frame className="pointer-events-auto" />;`,
		null,
	);
	expect(auto.code).toMatch(/Interactable=\{true\}/);
});

test("lowers overscroll utilities into ElasticBehavior on scrolling frames", () => {
	const result = transform(
		`export const A = () => <scrollingframe className="overscroll-none" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/ElasticBehavior=\{Enum\.ElasticBehavior\.Never\}/,
	);

	const contain = transform(
		`export const B = () => <scrollingframe className="overscroll-contain" />;`,
		null,
	);
	expect(contain.code).toMatch(
		/ElasticBehavior=\{Enum\.ElasticBehavior\.WhenScrollable\}/,
	);
});

test("lowers scroll utilities into ScrollingDirection and ScrollingEnabled", () => {
	const result = transform(
		`export const A = () => <scrollingframe className="scroll-y" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/ScrollingDirection=\{Enum\.ScrollingDirection\.Y\}/,
	);

	const disabled = transform(
		`export const B = () => <scrollingframe className="scroll-none" />;`,
		null,
	);
	expect(disabled.code).toMatch(/ScrollingEnabled=\{false\}/);

	const invalid = transform(
		`export const C = () => <scrollingframe className="scroll-smooth" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-scroll-value" }),
	]);
});

test("lowers scrollbar utilities into thickness and image color", () => {
	const result = transform(
		`export const A = () => <scrollingframe className="scrollbar-w-2 scrollbar-slate-500" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/ScrollBarThickness=\{__VelaRem\.scale\(8, \d+\)\}/,
	);
	expect(result.code).toMatch(
		/ScrollBarImageColor3=\{Color3\.fromRGB\(98, 116, 142\)\}/,
	);

	const faded = transform(
		`export const B = () => <scrollingframe className="scrollbar-slate-500/50" />;`,
		null,
	);
	expect(faded.code).toMatch(/ScrollBarImageTransparency=\{0\.5\}/);

	const hidden = transform(
		`export const C = () => <scrollingframe className="scrollbar-none" />;`,
		null,
	);
	expect(hidden.code).toMatch(/ScrollBarThickness=\{0\}/);

	const invalid = transform(
		`export const D = () => <scrollingframe className="scrollbar-w-thin" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-scrollbar-thickness" }),
	]);
});

test("lowers canvas utilities into AutomaticCanvasSize", () => {
	const result = transform(
		`export const A = () => <scrollingframe className="canvas-auto-y" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/AutomaticCanvasSize=\{Enum\.AutomaticSize\.Y\}/);

	const none = transform(
		`export const B = () => <scrollingframe className="canvas-none" />;`,
		null,
	);
	expect(none.code).toMatch(
		/AutomaticCanvasSize=\{Enum\.AutomaticSize\.None\}/,
	);

	const invalid = transform(
		`export const C = () => <scrollingframe className="canvas-full" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-canvas-size-value" }),
	]);
});
