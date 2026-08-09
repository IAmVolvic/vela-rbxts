import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";

test("lowers className on multiple supported Roblox host elements", () => {
	const config = defineConfig({
		theme: {
			colors: {
				surface: "Color3.fromRGB(10, 20, 30)",
			},
		},
	});
	const result = transform(
		'<frame><textlabel className="bg-surface" /><textbutton className="rounded-md" /><canvasgroup className="px-2 py-3 pt-1.5 pl-0.5" /><scrollingframe className="bg-surface" /><imagebutton className="rounded-md" /></frame>',
		{ configJson: JSON.stringify(config) },
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<textlabel\b[^>]*BackgroundColor3=\{Color3\.fromRGB\(10, 20, 30\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<scrollingframe\b[^>]*BackgroundColor3=\{Color3\.fromRGB\(10, 20, 30\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<textbutton\b[^>]*><uicorner\b[^>]*CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}[^>]*\/><\/textbutton>/i,
	);
	expect(result.code).toMatch(
		/<imagebutton\b[^>]*><uicorner\b[^>]*CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}[^>]*\/><\/imagebutton>/i,
	);
	expect(result.code).toMatch(/<uipadding\b[^>]*\/>/i);
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 12\), \d+\)\}/,
	);
});

test("removes className even when only diagnosed utilities remain", () => {
	const result = transform('<frame className="bg-card rounded-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "bg-card",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "rounded-card",
			}),
		]),
	);
});

test("keeps static-only className fully compile-time without runtime helper injection", () => {
	const result = transform(
		'<frame className="rounded-md bg-slate-700 px-4 py-3" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("@vela-rbxts/runtime");
	expect(result.code).not.toContain("vela-rbxts/runtime");
	expect(result.code).not.toContain("__vela__");
});

test("warns about className on unsupported host elements", () => {
	const result = transform(
		`export const A = () => <screengui className="bg-slate-700" />;`,
		null,
	);

	expect(result.code).toContain(`className="bg-slate-700"`);
	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "classname-on-unsupported-host" }),
	]);
});

test("anchors diagnostics to the offending className token", () => {
	const source = [
		`// a comment that mentions tracking-wide first`,
		`const unrelated = "tracking-wide in a string";`,
		`export const A = () => <frame className="bg-slate-700 tracking-wide" />;`,
	].join("\n");
	const result = transform(source, null);
	const [diagnostic] = result.diagnostics;

	expect(diagnostic.code).toBe("no-roblox-equivalent");
	expect(diagnostic.range).toBeDefined();
	const { start, end } = diagnostic.range as { start: number; end: number };
	expect(source.slice(start, end)).toBe("tracking-wide");
	expect(start).toBeGreaterThan(source.indexOf("className"));
});
