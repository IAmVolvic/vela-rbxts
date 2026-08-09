import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";

test("lowers width spacing utilities to a direct Size prop", () => {
	const result = transform('<frame className="w-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(16, 0\), \d+\)\}/,
	);
	expect(result.code).not.toMatch(/<uisize\b/i);
});

test("lowers height spacing utilities to a direct Size prop", () => {
	const result = transform('<frame className="h-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(0, 16\), \d+\)\}/,
	);
	expect(result.code).not.toMatch(/<uisize\b/i);
});

test("lowers square size spacing utilities to both Size axes", () => {
	const result = transform('<frame className="size-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(16, 16\), \d+\)\}/,
	);
});

test("lowers square pixel size utilities to both Size axes", () => {
	const result = transform('<frame className="size-px" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(1, 1\), \d+\)\}/,
	);
});

test("lowers square full size utilities to both Size axes", () => {
	const result = transform('<frame className="size-full" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(1, 1\)\}/);
});

test("lowers square fractional size utilities to both Size axes", () => {
	const result = transform('<frame className="size-1/2" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(0\.5, 0\.5\)\}/);
});

test("lets width utilities override only the width axis after size", () => {
	const result = transform('<frame className="size-4 w-8" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(32, 16\), \d+\)\}/,
	);
});

test("lets height utilities override only the height axis after size", () => {
	const result = transform('<frame className="size-4 h-8" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(16, 32\), \d+\)\}/,
	);
});

test("resolves width and height numeric spacing fallback tokens", () => {
	const result = transform('<frame className="w-2 h-3" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(8, 12\), \d+\)\}/,
	);
});

test("lowers pixel width and height utilities to one offset pixel", () => {
	const result = transform('<frame className="w-px h-px" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(1, 1\), \d+\)\}/,
	);
});

test("lowers full width and height utilities to full scale", () => {
	const result = transform('<frame className="w-full h-full" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(1, 1\)\}/);
});

test("lowers fractional width and height utilities to scale axes", () => {
	const result = transform('<frame className="w-1/2 h-3/4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(0\.5, 0\.75\)\}/);
});

test("lowers twelfth fractional width utilities", () => {
	const result = transform('<frame className="w-5/12" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(0\.4166666667, 0\)\}/);
});

test("lets full width override only the width axis after size", () => {
	const result = transform('<frame className="size-4 w-full" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(new UDim2\(1, 0, 0, 16\), \d+\)\}/,
	);
});

test("lets height spacing utilities override only the height axis after full size", () => {
	const result = transform('<frame className="size-full h-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(new UDim2\(1, 0, 0, 16\), \d+\)\}/,
	);
});

test("lets fractional height override only the height axis after size", () => {
	const result = transform('<frame className="size-4 h-1/2" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(new UDim2\(0, 16, 0\.5, 0\), \d+\)\}/,
	);
});

test("keeps each size axis separate across variant rules", () => {
	const result = transform('<frame className="w-32 md:h-32 md:w-64" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);

	const style = JSON.parse(result.ir[0]);
	expect(style.base.props).toContainEqual({
		name: "Size",
		value: "UDim2.fromOffset(128, 0)",
	});
	expect(
		style.runtimeRules.map(
			(rule: { effects: { props: unknown[] } }) => rule.effects.props,
		),
	).toEqual([
		[{ name: "SizeY", value: "new UDim(0, 128)" }],
		[{ name: "SizeX", value: "new UDim(0, 256)" }],
	]);
});

test("splits both axes of a variant size utility", () => {
	const result = transform('<frame className="md:size-8" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);

	const style = JSON.parse(result.ir[0]);
	expect(style.runtimeRules[0].effects.props).toEqual([
		{ name: "SizeX", value: "new UDim(0, 32)" },
		{ name: "SizeY", value: "new UDim(0, 32)" },
	]);
});

test("prefers explicit spacing config for size utilities", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
				"3": "new UDim(0, 111)",
			},
		},
	});

	const result = transform('<frame className="size-2 h-3" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(99, 111\), \d+\)\}/,
	);
});

test("prefers the same explicit spacing override across padding and size utilities", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
			},
		},
	});

	const paddingResult = transform('<frame className="p-2 px-2 pt-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(paddingResult.changed).toBe(true);
	expect(paddingResult.diagnostics).toEqual([]);
	expect(paddingResult.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(paddingResult.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(paddingResult.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(paddingResult.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);

	const sizeResult = transform('<frame className="w-2 h-2 size-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(sizeResult.changed).toBe(true);
	expect(sizeResult.diagnostics).toEqual([]);
	expect(sizeResult.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(99, 99\), \d+\)\}/,
	);
});

test("warns when size utilities resolve to non-offset spacing values", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0.5, 0)",
			},
		},
	});

	const result = transform('<frame className="w-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-size-spacing-value",
				token: "w-2",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects invalid numeric spacing fallback tokens", () => {
	const result = transform('<frame className="px--1 px-2.3 px-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px--1",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px-2.3",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/PaddingLeft=/);
	expect(result.code).not.toMatch(/PaddingRight=/);
});

test("rejects invalid padding shorthand spacing fallback tokens", () => {
	const result = transform('<frame className="p-card p-2.3" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "p-card",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "p-2.3",
			}),
		]),
	);
	expect(result.code).not.toMatch(/PaddingLeft=/);
	expect(result.code).not.toMatch(/PaddingRight=/);
	expect(result.code).not.toMatch(/PaddingTop=/);
	expect(result.code).not.toMatch(/PaddingBottom=/);
});

test("rejects invalid spacing tokens consistently across padding and size utilities", () => {
	const result = transform(
		'<frame className="p-card px-2.3 w-2.3 size-card" />',
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "p-card",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px-2.3",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "w-2.3",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "size-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Padding=/);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects unknown gap spacing tokens", () => {
	const result = transform('<frame className="gap-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "gap-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/<uilistlayout\b/i);
	expect(result.code).not.toMatch(/Padding=/);
});

test("rejects unknown size spacing tokens", () => {
	const result = transform('<frame className="w-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "w-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects unknown square size spacing tokens", () => {
	const result = transform('<frame className="size-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "size-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects invalid numeric size spacing fallback tokens", () => {
	const result = transform('<frame className="h-2.3" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "h-2.3",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects invalid numeric square size spacing fallback tokens", () => {
	const result = transform('<frame className="size-2.3" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "size-2.3",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("lowers fit size modes to AutomaticSize instead of misleading sizing", () => {
	const result = transform('<frame className="w-fit h-fit" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/AutomaticSize=\{Enum\.AutomaticSize\.XY\}/);
	expect(result.code).not.toMatch(/ Size=/);
});

test("lowers square fit size mode to AutomaticSize instead of misleading sizing", () => {
	const result = transform('<frame className="size-fit" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/AutomaticSize=\{Enum\.AutomaticSize\.XY\}/);
	expect(result.code).not.toMatch(/ Size=/);
});

test("lowers aspect utilities to a UIAspectRatioConstraint helper", () => {
	const result = transform(
		'<frame><frame className="aspect-square" /><frame className="aspect-video" /><frame className="aspect-[4/3]" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<uiaspectratioconstraint\b[^>]*AspectRatio=\{1\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uiaspectratioconstraint\b[^>]*AspectRatio=\{1\.7777777778\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uiaspectratioconstraint\b[^>]*AspectRatio=\{1\.3333333333\}[^>]*\/>/i,
	);
});

test("warns on unsupported aspect values", () => {
	const result = transform('<frame className="aspect-auto" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toMatch(/<uiaspectratioconstraint\b/i);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-aspect-value",
				token: "aspect-auto",
			}),
		]),
	);
});

test("lowers basis utilities like the width axis", () => {
	const fractional = transform(
		`export const A = () => <frame className="basis-1/2" />;`,
		null,
	);
	expect(fractional.diagnostics).toEqual([]);
	expect(fractional.code).toMatch(/Size=\{UDim2\.fromScale\(0\.5, 0\)\}/);

	const auto = transform(
		`export const B = () => <frame className="basis-auto" />;`,
		null,
	);
	expect(auto.code).toMatch(/AutomaticSize=\{Enum\.AutomaticSize\.X\}/);
});
