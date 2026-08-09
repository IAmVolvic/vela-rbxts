import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defaultConfig, defineConfig } from "../../../config/src/index";
import { withoutPreflight } from "./helpers";

function buildColorPalette(entries: Record<string, string>) {
	return entries;
}

test("resolves normalized shade tokens from config colors", () => {
	const config = defineConfig({
		theme: {
			colors: {
				surface: "Color3.fromRGB(40, 48, 66)",
				slate: {
					50: "Color3.fromRGB(1, 2, 3)",
					500: "Color3.fromRGB(4, 5, 6)",
					700: "Color3.fromRGB(4, 5, 6)",
				},
			},
		},
	});

	expect(config.theme.colors.surface).toBe("Color3.fromRGB(40, 48, 66)");
	expect(config.theme.colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(1, 2, 3)",
			500: "Color3.fromRGB(4, 5, 6)",
			700: "Color3.fromRGB(4, 5, 6)",
		}),
	);

	const result = transform(
		'<frame><frame className="bg-surface" /><frame className="bg-slate-700" /></frame>',
		{
			configJson: JSON.stringify(config),
		},
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(40, 48, 66)} BorderSizePixel={0}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(4, 5, 6)} BorderSizePixel={0}/>",
	);
});

test("merges extend colors without inventing fake singleton shades", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					slate: buildColorPalette({
						500: "Color3.fromRGB(100, 116, 139)",
					}),
					blue: buildColorPalette({
						600: "Color3.fromRGB(37, 99, 235)",
					}),
					rose: buildColorPalette({
						400: "Color3.fromRGB(251, 113, 133)",
					}),
				},
			},
		},
	});

	const result = transform(
		'<frame><frame className="bg-slate-500" /><frame className="bg-slate-700" /><frame className="bg-blue-600" /><frame className="bg-rose-400" /></frame>',
		{
			configJson: JSON.stringify(config),
		},
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	const defaultSlate700 = (
		defaultConfig.theme.colors.slate as Record<string, string>
	)["700"];
	expect(result.code).toContain(
		`<frame BackgroundColor3={${defaultSlate700}} BorderSizePixel={0}/>`,
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(100, 116, 139)} BorderSizePixel={0}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(37, 99, 235)} BorderSizePixel={0}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(251, 113, 133)} BorderSizePixel={0}/>",
	);
});

test("rejects unshaded palette access and invalid singleton shade access", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: buildColorPalette({
					500: "Color3.fromRGB(12, 34, 56)",
					700: "Color3.fromRGB(78, 90, 123)",
				}),
				surface: "Color3.fromRGB(40, 48, 66)",
			},
		},
	});

	const result = transform(
		'<frame><frame className="bg-brand" /><frame className="bg-brand-700" /><frame className="bg-surface-700" /></frame>',
		{
			configJson: JSON.stringify(config),
		},
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "color-missing-shade",
				token: "bg-brand",
			}),
			expect.objectContaining({
				level: "warning",
				code: "color-invalid-shade",
				token: "bg-surface-700",
			}),
		]),
	);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(78, 90, 123)} BorderSizePixel={0}/>",
	);
	expect(result.code).not.toContain("Color3.fromRGB(12, 34, 56)");
});

test("resolves normalized default background colors and transparent keywords", () => {
	const result = transform(
		'<frame><frame className="bg-slate-700" /><frame className="bg-transparent" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	const defaultSlate700 = (
		defaultConfig.theme.colors.slate as Record<string, string>
	)["700"];
	expect(
		result.code.split(`BackgroundColor3={${defaultSlate700}}`),
	).toHaveLength(2);
	expect(result.code).toContain(
		"<frame BackgroundTransparency={1} BorderSizePixel={0}/>",
	);
});

test("warns on unknown background color keys unless config defines them", () => {
	const result = transform(
		'<frame className="bg-surface" />',
		withoutPreflight,
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "bg-surface",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Background(Color3|Transparency)=/);
});

test("does not pretend to support unsupported color keywords", () => {
	const result = transform(
		'<frame className="bg-current bg-inherit" />',
		withoutPreflight,
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-color-key",
				token: "bg-current",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-color-key",
				token: "bg-inherit",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Background(Color3|Transparency)=/);
});

test("shares the color resolver across text image and placeholder utilities", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					slate: {
						500: "Color3.fromRGB(100, 116, 139)",
					},
					blue: {
						600: "Color3.fromRGB(37, 99, 235)",
					},
					rose: {
						400: "Color3.fromRGB(251, 113, 133)",
					},
				},
			},
		},
	});

	const result = transform(
		'<frame><textlabel className="text-slate-500 text-transparent" /><imagelabel className="image-blue-600 image-transparent" /><textbox className="placeholder-rose-400" /></frame>',
		{
			configJson: JSON.stringify(config),
		},
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain(
		"<textlabel TextTransparency={1} BorderSizePixel={0} BackgroundTransparency={1}/>",
	);
	expect(result.code).toContain(
		"<imagelabel ImageTransparency={1} BorderSizePixel={0} BackgroundTransparency={1}/>",
	);
	expect(result.code).toContain(
		"<textbox PlaceholderColor3={Color3.fromRGB(251, 113, 133)} BorderSizePixel={0} BackgroundTransparency={1}/>",
	);
	expect(result.code).not.toContain("TextColor3=");
	expect(result.code).not.toContain("ImageColor3=");
});

test("resolves a bare palette name through its DEFAULT shade", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate" />;`,
		null,
	);

	expect(result.code).toContain("Color3.fromRGB(98, 116, 142)");
	expect(result.code).not.toContain("className");
	expect(result.diagnostics).toEqual([]);
});

test("still requires a shade when the palette has no DEFAULT", () => {
	const config = defineConfig({
		theme: {
			extend: { colors: { brand: { 700: "Color3.fromRGB(1, 2, 3)" } } },
		},
	});
	const result = transform(
		`export const A = () => <frame className="bg-brand" />;`,
		{ configJson: JSON.stringify(config) },
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "color-missing-shade" }),
	]);
});
