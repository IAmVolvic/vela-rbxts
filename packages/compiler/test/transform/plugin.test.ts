import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig, plugin } from "../../../config/src/index";
import { runtimeSource, withPluginUtilities } from "./helpers";

test("expands a plugin utility into the utilities it stands for", () => {
	const result = transform('<frame className="btn" />', withPluginUtilities);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/BackgroundColor3=\{\(Color3\.fromRGB\(21, 93, 252\) as never\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingLeft=\{\(__VelaRem\.scale\(new UDim\(0, 16\), \d+\) as never\)\}/,
	);
	expect(result.code).toMatch(/<uicorner\b/i);

	const style = JSON.parse(result.ir[0]);
	expect(style.runtimeRules[0].condition).toEqual({ kind: "hover" });
	expect(style.runtimeRules[0].effects.props).toContainEqual({
		name: "BackgroundColor3",
		value: "Color3.fromRGB(20, 71, 230)",
	});
});

test("a plugin utility carries the variant it was written with", () => {
	const result = transform(
		'<frame className="md:btn hover:panel" />',
		withPluginUtilities,
	);

	expect(result.diagnostics).toEqual([]);

	const style = JSON.parse(result.ir[0]);
	const conditions = style.runtimeRules.map(
		(rule: { condition: unknown }) => rule.condition,
	);
	expect(conditions).toContainEqual(
		expect.objectContaining({ kind: "width", alias: "md" }),
	);
	// `hover:` inside the plugin body composes with the `md:` at the use site.
	expect(conditions).toContainEqual({
		kind: "all",
		conditions: [
			expect.objectContaining({ kind: "width", alias: "md" }),
			{ kind: "hover" },
		],
	});
	expect(
		style.runtimeRules.find(
			(rule: { condition: { kind: string } }) =>
				rule.condition.kind === "hover",
		).effects.props,
	).toEqual([
		{ name: "BackgroundColor3", value: "Color3.fromRGB(29, 41, 61)" },
		{ name: "BorderSizePixel", value: "0" },
	]);
});

test("a plugin utility names Roblox properties directly", () => {
	const result = transform('<frame className="panel" />', withPluginUtilities);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toMatch(
		/BackgroundColor3=\{Color3\.fromRGB\(29, 41, 61\)\}/,
	);
	expect(result.code).toMatch(/BorderSizePixel=\{0\}/);
});

test("a plugin utility reaches through another plugin utility", () => {
	const result = transform('<frame className="stack" />', withPluginUtilities);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/<uilistlayout\b/i);
	expect(result.code).toMatch(
		/BackgroundColor3=\{\(Color3\.fromRGB\(21, 93, 252\) as never\)\}/,
	);
});

test("a class the plugin body cannot resolve is reported on the class the author wrote", () => {
	const result = transform('<frame className="btn" />', {
		configJson: JSON.stringify(
			defineConfig({
				plugins: [
					plugin(({ addUtilities }) => addUtilities({ btn: "bg-nope-500" })),
				],
			}),
		),
	});

	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0].token).toBe("btn");
	expect(result.diagnostics[0].message).toContain('Plugin utility "btn"');
	expect(result.diagnostics[0].message).toContain('expands to "bg-nope-500"');
});

test("resolves plugin utilities on the runtime path too", () => {
	const result = transform(
		"<frame className={variant} />",
		withPluginUtilities,
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("pluginUtilities");
	expect(result.code).toContain(
		'"bg-blue-600 rounded-lg px-4 hover:bg-blue-700"',
	);
	expect(runtimeSource).toContain("MAX_PLUGIN_EXPANSION_DEPTH");
});
