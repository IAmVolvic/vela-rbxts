import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { emitted, runtimeSource } from "./helpers";

test("lowers flex and alignment utilities onto a shared UIListLayout helper", () => {
	const result = transform(
		'<frame className="flex-row justify-center items-end gap-4" />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Horizontal\}/,
	);
	expect(result.code).toMatch(
		/HorizontalAlignment=\{Enum\.HorizontalAlignment\.Center\}/,
	);
	expect(result.code).toMatch(
		/VerticalAlignment=\{Enum\.VerticalAlignment\.Bottom\}/,
	);
	expect(result.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code.match(/<uilistlayout\b/gi) ?? []).toHaveLength(1);
});

test("treats bare flex as a horizontal UIListLayout", () => {
	const result = transform('<frame className="flex" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<uilistlayout\b[^>]*FillDirection=\{Enum\.FillDirection\.Horizontal\}[^>]*\/>/i,
	);
});

test("sorts UIListLayout children by LayoutOrder so order-* applies", () => {
	const flex = transform(
		`export const A = () => (
			<frame className="flex">
				<textbutton className="order-2" />
				<textlabel className="order-1" />
			</frame>
		);`,
		null,
	);

	expect(flex.diagnostics).toEqual([]);
	expect(flex.code).toMatch(
		/<uilistlayout\b[^>]*SortOrder=\{Enum\.SortOrder\.LayoutOrder\}[^>]*\/>/i,
	);

	const gap = transform('<frame className="gap-4" />');

	expect(gap.code).toMatch(
		/<uilistlayout\b[^>]*SortOrder=\{Enum\.SortOrder\.LayoutOrder\}[^>]*\/>/i,
	);

	const space = transform('<frame className="space-y-2" />');

	expect(space.code).toMatch(
		/<uilistlayout\b[^>]*SortOrder=\{Enum\.SortOrder\.LayoutOrder\}[^>]*\/>/i,
	);
});

test("warns on unsupported flex directions while lowering flex distribution", () => {
	const result = transform(
		'<frame className="flex-row-reverse justify-between items-stretch" />',
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/HorizontalFlex=\{Enum\.UIFlexAlignment\.SpaceBetween\}/,
	);
	expect(result.code).toMatch(/VerticalFlex=\{Enum\.UIFlexAlignment\.Fill\}/);
	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-flex-direction",
			token: "flex-row-reverse",
		}),
	]);
});

test("lowers justify-stretch onto the horizontal flex axis", () => {
	const result = transform(
		'<frame className="flex-col justify-stretch items-stretch" />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/HorizontalFlex=\{Enum\.UIFlexAlignment\.Fill\}/);
	expect(result.code).toMatch(/VerticalFlex=\{Enum\.UIFlexAlignment\.Fill\}/);
});

test("carries flex utilities through the runtime variant path with enum parsing", () => {
	const result = transform('<frame className="flex-row md:flex-col" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain('startsWith(value, "Enum.")');

	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			// A rule overwrites this layout, so the base one joins the
			// resolution rather than arriving as a second instance.
			base: expect.objectContaining({ helpers: [] }),
			runtimeRules: expect.arrayContaining([
				expect.objectContaining({
					condition: { kind: "all", conditions: [] },
					effects: expect.objectContaining({
						helpers: expect.arrayContaining([
							expect.objectContaining({
								tag: "uilistlayout",
								props: expect.arrayContaining([
									expect.objectContaining({
										name: "FillDirection",
										value: "Enum.FillDirection.Horizontal",
									}),
								]),
							}),
						]),
					}),
				}),
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "width",
						alias: "md",
					}),
					effects: expect.objectContaining({
						helpers: expect.arrayContaining([
							expect.objectContaining({
								tag: "uilistlayout",
								props: expect.arrayContaining([
									expect.objectContaining({
										name: "FillDirection",
										value: "Enum.FillDirection.Vertical",
									}),
								]),
							}),
						]),
					}),
				}),
			]),
		}),
	);
});

test("lowers order utilities into LayoutOrder", () => {
	const result = transform(
		`export const A = () => (
			<frame>
				<frame className="order-2" />
				<frame className="order-first" />
				<frame className="-order-3" />
				<frame className="order-none" />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/LayoutOrder=\{2\}/);
	expect(result.code).toMatch(/LayoutOrder=\{-9999\}/);
	expect(result.code).toMatch(/LayoutOrder=\{-3\}/);
	expect(result.code).toMatch(/LayoutOrder=\{0\}/);
});

test("rejects non-integer order values with a diagnostic", () => {
	const result = transform(
		`export const A = () => <frame className="order-firstish" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-layout-order-value" }),
	]);
});

test("lowers content utilities into UIListLayout cross-axis packing", () => {
	const flex = transform(
		`export const A = () => <frame className="content-between" />;`,
		null,
	);
	expect(flex.diagnostics).toEqual([]);
	expect(flex.code).toMatch(
		/VerticalFlex=\{Enum\.UIFlexAlignment\.SpaceBetween\}/,
	);

	const stretch = transform(
		`export const B = () => <frame className="content-stretch" />;`,
		null,
	);
	expect(stretch.code).toMatch(/VerticalFlex=\{Enum\.UIFlexAlignment\.Fill\}/);

	const aligned = transform(
		`export const C = () => <frame className="content-center" />;`,
		null,
	);
	expect(aligned.code).toMatch(
		/VerticalAlignment=\{Enum\.VerticalAlignment\.Center\}/,
	);
});

test("lowers self utilities into UIFlexItem.ItemLineAlignment", () => {
	const result = transform(
		`export const A = () => <frame className="self-center" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/<uiflexitem\b[^>]*ItemLineAlignment=\{Enum\.ItemLineAlignment\.Center\}[^>]*\/>/i,
	);

	const invalid = transform(
		`export const B = () => <frame className="self-baseline" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-alignment-value" }),
	]);
});

test("reports unlowered grid subtokens as known Tailwind without an equivalent", () => {
	const result = transform(
		`export const A = () => <frame className="grid-flow-row" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "no-roblox-equivalent" }),
	]);
});

test("lowers grid utilities into UIGridLayout", () => {
	const result = transform(
		`export const A = () => <frame className="grid grid-cols-3 gap-2" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/<uigridlayout\b[^>]*SortOrder=\{Enum\.SortOrder\.LayoutOrder\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Horizontal\}/,
	);
	expect(result.code).toMatch(/FillDirectionMaxCells=\{3\}/);
	expect(result.code).toMatch(
		/CellPadding=\{__VelaRem\.scale\(UDim2\.fromOffset\(8, 8\), \d+\)\}/,
	);

	const rows = transform(
		`export const B = () => <frame className="grid-rows-2" />;`,
		null,
	);
	expect(rows.code).toMatch(/FillDirection=\{Enum\.FillDirection\.Vertical\}/);
	expect(rows.code).toMatch(/FillDirectionMaxCells=\{2\}/);
});

test("sizes grid cells so tracks divide the container instead of collapsing", () => {
	// UIGridLayout overrides each child's own Size with CellSize, so a grid that
	// names no cell size pins every cell to Roblox's 100x100 default and wide
	// content spills over its neighbours.
	const columns = transform(
		`export const A = () => <frame className="grid grid-cols-2 gap-2.5" />;`,
		null,
	);

	expect(columns.diagnostics).toEqual([]);
	// Two tracks, each giving back its share of the single 10px gap.
	expect(columns.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0\.5, -5, 0, 100\), \d+\)\}/,
	);

	const gapless = transform(
		`export const B = () => <frame className="grid grid-cols-3" />;`,
		null,
	);

	expect(gapless.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0\.3333333333, 0, 0, 100\), \d+\)\}/,
	);

	// `grid-rows-*` fills vertically, so it divides the other axis.
	const rows = transform(
		`export const C = () => <frame className="grid grid-rows-4 gap-2" />;`,
		null,
	);

	expect(rows.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0, 100, 0\.25, -6\), \d+\)\}/,
	);
});

test("names the grid cross axis with auto-rows/auto-cols", () => {
	// `grid-cols-N` only sizes the axis it fills; UIGridLayout still needs a
	// number for the other one, so Tailwind's auto-track utilities supply it.
	const rows = transform(
		`export const A = () => <frame className="grid grid-cols-2 gap-2.5 auto-rows-37.5" />;`,
		null,
	);

	expect(rows.diagnostics).toEqual([]);
	expect(rows.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0\.5, -5, 0, 150\), \d+\)\}/,
	);

	const columns = transform(
		`export const B = () => <frame className="grid grid-rows-3 auto-cols-20" />;`,
		null,
	);

	expect(columns.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0, 80, 0\.3333333333, 0\), \d+\)\}/,
	);
});

test("keeps gap on UIListLayout when no grid is present", () => {
	const result = transform(
		`export const A = () => <frame className="flex gap-2" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).not.toContain("uigridlayout");
	expect(emitted(result.code)).not.toContain("CellPadding");
});

test("rejects out-of-range grid cell counts", () => {
	const result = transform(
		`export const A = () => <frame className="grid-cols-0 grid-rows-13" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-grid-value" }),
		expect.objectContaining({ code: "unsupported-grid-value" }),
	]);
});
