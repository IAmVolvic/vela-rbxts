import { readFileSync } from "node:fs";
import { implementationKind, transform } from "@vela-rbxts/compiler";
import { expect, expectTypeOf, test } from "vitest";
import { defaultConfig, defineConfig, plugin } from "../../config/src/index";

// The runtime host ships as its own package, so what it resolves is asserted
// against its source rather than against a copy inlined into the emit. Most of
// what resolves a class value lives in the framework-neutral core the host is
// built on, and which of the two holds a given branch is not what these
// assertions are about.
const runtimeSource = [
	new URL("../../runtime/src/index.ts", import.meta.url),
	new URL("../../runtime-core/src/index.ts", import.meta.url),
]
	.map((url) => readFileSync(url, "utf8"))
	.join("\n");

function buildColorPalette(entries: Record<string, string>) {
	return entries;
}

// Preflight would put its own background props on every element, which hides
// what a token-resolution test is actually asserting.
const withoutPreflight = {
	configJson: JSON.stringify(defineConfig({ preflight: false })),
};

// What the compiler inlines sits above the file's own code and names Roblox
// properties of its own, so an assertion about what an element emitted has to
// read the declaration rather than the whole emit.
const emitted = (code: string) => code.trimEnd().split("\n").at(-1) ?? "";

test("applies theme.extend while top-level theme scales replace the family", () => {
	const config = defineConfig({
		theme: {
			colors: {
				primary: "Color3.fromRGB(99, 102, 241)",
			},
			extend: {
				colors: {
					secondary: "Color3.fromRGB(16, 185, 129)",
				},
				radius: {
					lg: "new UDim(0, 12)",
					xl: "new UDim(0, 16)",
				},
				spacing: {
					"6": "new UDim(0, 16)",
				},
			},
		},
	});

	expect(config).toEqual({
		preflight: true,
		framework: "react",
		theme: {
			colors: {
				primary: "Color3.fromRGB(99, 102, 241)",
			},
			radius: {
				DEFAULT: "new UDim(0, 4)",
				none: "new UDim(0, 0)",
				xs: "new UDim(0, 2)",
				sm: "new UDim(0, 4)",
				md: "new UDim(0, 6)",
				lg: "new UDim(0, 12)",
				xl: "new UDim(0, 16)",
				"2xl": "new UDim(0, 16)",
				"3xl": "new UDim(0, 24)",
				"4xl": "new UDim(0, 32)",
				full: "new UDim(0.5, 0)",
			},
			spacing: {
				"4": "new UDim(0, 16)",
				"6": "new UDim(0, 16)",
			},
			fontFamily: {
				sans: "rbxasset://fonts/families/SourceSansPro.json",
				serif: "rbxasset://fonts/families/Merriweather.json",
				mono: "rbxasset://fonts/families/RobotoMono.json",
			},
			rem: {
				base: 16,
				min: 8,
				max: 64,
				baseResolution: { x: 1920, y: 1020 },
			},
		},
		plugins: { utilities: {} },
	});

	const source =
		'<frame className="bg-primary rounded-md rounded-lg px-6 py-6 pt-6" />';
	const result = transform(source, { configJson: JSON.stringify(config) });

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.diagnostics).toEqual([]);
	expect(result.code.includes("className=")).toBe(false);
	expect(result.code).toMatch(
		/BackgroundColor3=\{Color3\.fromRGB\(99, 102, 241\)\}/,
	);
	expect(result.code).toMatch(
		/<uicorner\b[^>]*CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 12\), \d+\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(/<uipadding\b[^>]*\/>/i);
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).not.toContain("theme.");
});

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

test("lowers border utilities to UIStroke helpers", () => {
	const result = transform(
		'<frame><frame className="border border-slate-700" /><frame className="border-2 border-blue-600" /><frame className="border-4 border-transparent" /><frame className="rounded-md border border-rose-500 px-4" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{__VelaRem\.scale\(1, \d+\)\}[^>]*Color=\{Color3\.fromRGB\(49, 65, 88\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{__VelaRem\.scale\(2, \d+\)\}[^>]*Color=\{Color3\.fromRGB\(21, 93, 252\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{__VelaRem\.scale\(4, \d+\)\}[^>]*Transparency=\{1\}[^>]*\/>/i,
	);
	expect(runtimeSource).toContain("uicorner");
	expect(runtimeSource).toContain("uistroke");
});

test("reports unsupported border forms with a targeted diagnostic", () => {
	const result = transform(
		'<frame className="border-dashed border-x border-8 border-[3rem] border-opacity-50" />',
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-border-value",
				token: "border-dashed",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-border-value",
				token: "border-x",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-border-value",
				token: "border-8",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-arbitrary-value",
				token: "border-[3rem]",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-border-value",
				token: "border-opacity-50",
			}),
		]),
	);
	expect(result.code).not.toMatch(/<uistroke\b/i);
});

test("border static and runtime classifiers stay in parity", () => {
	const THICKNESS_KEYS = ["0", "1", "2", "4"] as const;
	const UNSUPPORTED_FORMS = [
		"dashed",
		"solid",
		"dotted",
		"double",
		"x",
		"y",
		"t",
		"r",
		"b",
		"l",
		"x-2",
		"opacity-50",
		"[3rem]",
		"500/50",
		"8",
	] as const;

	for (const key of THICKNESS_KEYS) {
		const result = transform(`<frame className="border-${key}" />`);
		const thickness = key === "0" ? key : `__VelaRem\\.scale\\(${key}, \\d+\\)`;
		expect(result.diagnostics).toEqual([]);
		expect(result.code).toMatch(
			new RegExp(`<uistroke\\b[^>]*Thickness=\\{${thickness}\\}`, "i"),
		);
	}

	for (const form of UNSUPPORTED_FORMS) {
		const result = transform(`<frame className="border-${form}" />`);
		expect(
			result.diagnostics.some((diagnostic: { code: string }) =>
				["unsupported-border-value", "unsupported-arbitrary-value"].includes(
					diagnostic.code,
				),
			),
		).toBe(true);
		expect(result.code).not.toMatch(/<uistroke\b/i);
	}

	const runtime = transform(
		'<frame className={["border", active && "border-blue-600"]} />',
	);
	expect(runtime.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain(
		`key === "${THICKNESS_KEYS.join('" || key === "')}"`,
	);
	for (const keyword of ["dashed", "solid", "dotted", "double"]) {
		expect(runtimeSource).toContain(`key === "${keyword}"`);
	}
	expect(runtimeSource).toContain('startsWith(key, "opacity-")');
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

test("resolves built-in radius presets out of the box", () => {
	const result = transform(
		'<frame><textbutton className="rounded-none" /><imagebutton className="rounded-sm" /><textbutton className="rounded-md" /><imagebutton className="rounded-lg" /><textbutton className="rounded-xl" /><imagebutton className="rounded-2xl" /><textbutton className="rounded-full" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0, 0)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 4), 0)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 6), 1)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 8), 2)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 12), 3)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 16), 4)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0.5, 0)}/></textbutton>",
	);
});

test("lowers supported z-index utilities to Roblox ZIndex", () => {
	const result = transform('<frame className="z-10" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/ZIndex=\{10\}/);
});

test("lets later z-index utilities win within the same className", () => {
	const result = transform('<frame className="z-10 z-30" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/ZIndex=\{30\}/);
	expect(result.code).not.toMatch(/ZIndex=\{10\}/);
});

test("mixes z-index lowering with existing direct prop utilities", () => {
	const result = transform('<frame className="rounded-md z-20 px-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}/,
	);
	expect(result.code).toMatch(/ZIndex=\{20\}/);
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
});

test("carries z-index utilities through the runtime variant path", () => {
	const result = transform('<frame className="z-10 md:z-20" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("__velaRules");
	expect(runtimeSource).toContain("const __velaStringLen = string.len;");
	expect(runtimeSource).toContain("const __velaStringSub = string.sub;");
	expect(runtimeSource).toContain("__velaStringLen(value)");
	expect(runtimeSource).toContain("__velaStringSub(value");
	expect(runtimeSource).toContain("value.size()");
	expect(result.code).not.toContain("string.len(value)");
	expect(result.code).not.toContain("string.sub(value");
	expect(result.code).not.toMatch(/string\.len\s*\(/);
	expect(result.code).not.toMatch(/string\.sub\s*\(/);
	expect(result.code).not.toMatch(/\btable\s*[.:]\s*getn\b/);
	expect(result.code).not.toContain("value.length");
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain("ZIndex={(10 as never)}");

	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				props: expect.arrayContaining([
					expect.objectContaining({
						name: "ZIndex",
						value: "10",
					}),
				]),
			}),
			runtimeRules: expect.arrayContaining([
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "width",
						alias: "md",
					}),
					effects: expect.objectContaining({
						props: expect.arrayContaining([
							expect.objectContaining({
								name: "ZIndex",
								value: "20",
							}),
						]),
					}),
				}),
			]),
		}),
	);
});

test("warns on unsupported z-index forms", () => {
	const result = transform('<frame className="z-auto -z-10 z-[1.5] z-999" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toMatch(/ZIndex=/);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-z-index-auto",
				token: "z-auto",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-negative-z-index",
				token: "-z-10",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-arbitrary-z-index",
				token: "z-[1.5]",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-z-index-value",
				token: "z-999",
			}),
		]),
	);
});

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

test("resolves valid numeric spacing fallback tokens", () => {
	const result = transform('<frame className="px-2 pt-1.5 pl-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}/,
	);
});

test("resolves padding shorthand numeric spacing fallback tokens", () => {
	const result = transform('<frame className="p-2" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
});

test("resolves fractional padding shorthand numeric spacing fallback tokens", () => {
	const result = transform('<frame className="p-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
});

test("resolves zero numeric spacing fallback tokens", () => {
	const result = transform('<frame className="pr-0" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 0\)\}/);
});

test("prefers explicit spacing config over numeric fallback", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
			},
		},
	});

	const result = transform('<frame className="px-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
});

test("prefers explicit spacing config over padding shorthand numeric fallback", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
			},
		},
	});

	const result = transform('<frame className="p-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
});

test("keeps spacing-backed padding and size utilities on the same resolver path", () => {
	const result = transform(
		'<frame className="p-2 px-2 pt-1.5 w-2 h-2 size-2" />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(8, 8\), \d+\)\}/,
	);
});

test("lowers gap spacing utilities to a UIListLayout helper", () => {
	const result = transform('<frame className="gap-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<frame\b[^>]*><uilistlayout\b[^>]*Padding=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}[^>]*\/><\/frame>/i,
	);
});

test("resolves fractional gap numeric spacing fallback tokens", () => {
	const result = transform('<frame className="gap-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/<uilistlayout\b[^>]*\/>/i);
	expect(result.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
});

test("prefers explicit spacing config for gap utilities", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
			},
		},
	});

	const result = transform('<frame className="gap-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/<uilistlayout\b[^>]*\/>/i);
	expect(result.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
});

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

test("warns on unknown radius keys without falling back to numeric radius resolution", () => {
	const result = transform('<frame className="rounded-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "rounded-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/CornerRadius=/);
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

test("rewrites dynamic array className through the runtime helper", () => {
	const result = transform(
		'<frame className={["bg-blue-600", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	// The branch names classes this pass can read, so it is resolved here and
	// the host is handed the test rather than the class list.
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*active \? true : false\s*\]\}/,
	);
	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			runtimeRules: [
				expect.objectContaining({
					condition: { kind: "test", index: 0, expected: true },
					effects: expect.objectContaining({
						helpers: [expect.objectContaining({ tag: "uicorner" })],
					}),
				}),
			],
		}),
	);
	expect(result.code).toContain(
		'import { createVelaRuntimeHost } from "@rbxts/vela-runtime";',
	);
	expect(result.code).not.toContain("../__vela__/runtime-host");
});

/// The config travels as the host factory's first argument, so it ends at the
/// only closing brace the emitter leaves at column zero.
const hostConfig = (code: string) =>
	JSON.parse(
		/createVelaRuntimeHost\((\{[\s\S]*?\n\})[,)]/.exec(code)?.[1] ?? "null",
	);

test("prunes the resolver's tables from a host that resolves no class value", () => {
	const result = transform(
		'<frame className="bg-slate-700 hover:bg-blue-600" />',
		withPluginUtilities,
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).not.toContain("className=");
	// The variant is already a rule, so nothing in this file is ever parsed
	// in-game. The scales travel empty *and* replaced, so the runtime uses the
	// empty tables rather than falling back on the defaults it carries.
	expect(hostConfig(result.code)).toEqual({
		preflight: false,
		theme: {
			colors: {},
			radius: {},
			spacing: {},
			fontFamily: {},
			rem: expect.objectContaining({ base: 16 }),
			replaced: ["colors", "radius", "spacing", "fontFamily"],
		},
		plugins: { utilities: {} },
	});
	expect(result.code).toContain("Color3.fromRGB(21, 93, 252)");
});

// The runtime carries the defaults, so an untouched scale travels as nothing at
// all — but it must be left mergeable rather than marked replaced.
test("leaves the resolver's tables to the defaults when a class value reaches the host", () => {
	const result = transform("<frame className={variant} />");

	expect(result.needsRuntimeHost).toBe(true);
	expect(hostConfig(result.code).theme.colors).toEqual({});
	expect(hostConfig(result.code).theme.replaced).toBeUndefined();
});

// A spread can carry a `className` this pass never reads, so the tables have to
// stay readable through it.
test("leaves the resolver's tables mergeable when a spread may carry a class value", () => {
	const result = transform('<frame {...rest} className="hover:bg-blue-600" />');

	expect(result.needsRuntimeHost).toBe(true);
	expect(hostConfig(result.code).theme.replaced).toBeUndefined();
});

// Only what the project changed travels; `extend` adds a family, and a
// top-level scale replaces the whole table, which no set of additions can say.
test("a theme extension travels as the entries it added", () => {
	const result = transform("<frame className={variant} />", {
		configJson: JSON.stringify(
			defineConfig({
				theme: { extend: { colors: { brand: "Color3.fromRGB(1, 2, 3)" } } },
			}),
		),
	});

	const theme = hostConfig(result.code).theme;
	expect(theme.colors).toEqual({ brand: "Color3.fromRGB(1, 2, 3)" });
	expect(theme.replaced).toBeUndefined();
});

test("a replaced theme scale travels whole so the defaults do not come back", () => {
	const result = transform("<frame className={variant} />", {
		configJson: JSON.stringify(
			defineConfig({ theme: { colors: { brand: "Color3.fromRGB(9, 9, 9)" } } }),
		),
	});

	const theme = hostConfig(result.code).theme;
	expect(theme.colors).toEqual({ brand: "Color3.fromRGB(9, 9, 9)" });
	expect(theme.replaced).toEqual(["colors"]);
});

// Overriding one shade keeps the family whole, so the shades around it survive
// the family-level merge the runtime does.
test("overriding one shade carries the rest of its family with it", () => {
	const result = transform("<frame className={variant} />", {
		configJson: JSON.stringify(
			defineConfig({
				theme: {
					extend: { colors: { blue: { "500": "Color3.fromRGB(1, 2, 3)" } } },
				},
			}),
		),
	});

	const blue = hostConfig(result.code).theme.colors.blue;
	expect(blue["500"]).toBe("Color3.fromRGB(1, 2, 3)");
	expect(blue["600"]).toEqual(expect.any(String));
	expect(Object.keys(hostConfig(result.code).theme.colors)).toEqual(["blue"]);
});

// A branch whose tokens are all written out is one this pass can read; only
// which of them apply is left for render time. Resolving it here is what lets
// the whole utility set through, rather than the subset the runtime parses.
const ruleConditions = (result: { ir: string[] }) =>
	JSON.parse(result.ir[0]).runtimeRules.map(
		(rule: { condition: unknown }) => rule.condition,
	);

test("resolves a static-only utility written inside a branch", () => {
	const result = transform(
		'export const A = ({ big }: { big: boolean }) => <textlabel className={big ? "text-lg" : "text-sm"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	// `text-{size}` has no runtime resolution at all, so before the branch was
	// read here it left no TextSize on either side.
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([
		expect.objectContaining({
			condition: { kind: "test", index: 0, expected: true },
			effects: expect.objectContaining({
				props: [{ name: "TextSize", value: "18" }],
			}),
		}),
		expect.objectContaining({
			condition: { kind: "test", index: 0, expected: false },
			effects: expect.objectContaining({
				props: [{ name: "TextSize", value: "14" }],
			}),
		}),
	]);
});

test("resolves a branch among the tokens written around it", () => {
	const result = transform(
		'export const A = ({ tall }: { tall: boolean }) => <frame className={["w-40", tall && "h-10"]} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// Both axes are known here, so they still meet in one `Size` rather than the
	// branch overwriting the width the base opened.
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([
		expect.objectContaining({
			condition: { kind: "test", index: 0, expected: true },
			effects: expect.objectContaining({
				props: [{ name: "Size", value: "UDim2.fromOffset(160, 40)" }],
			}),
		}),
	]);
});

test("evaluates a test once however many branches hang on it", () => {
	const result = transform(
		'export const A = ({ a, b }: { a: boolean; b: boolean }) => <frame className={a ? "bg-red-500" : b ? "bg-green-500" : "bg-blue-500"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*a \? true : false,\s*b \? true : false\s*\]\}/,
	);
	expect(ruleConditions(result)).toEqual([
		{ kind: "test", index: 0, expected: true },
		{
			kind: "all",
			conditions: [
				{ kind: "test", index: 0, expected: false },
				{ kind: "test", index: 1, expected: true },
			],
		},
		{
			kind: "all",
			conditions: [
				{ kind: "test", index: 0, expected: false },
				{ kind: "test", index: 1, expected: false },
			],
		},
	]);
});

test("meets a variant inside a branch with the branch's own test", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <frame className={on ? "hover:bg-blue-500" : "bg-slate-900"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(ruleConditions(result)).toEqual([
		{
			kind: "all",
			conditions: [
				{ kind: "test", index: 0, expected: true },
				{ kind: "hover" },
			],
		},
		{ kind: "test", index: 0, expected: false },
	]);
});

test("keeps the undecided left side of `||` on the runtime path", () => {
	const result = transform(
		'export const A = ({ extra }: { extra?: string }) => <frame className={extra || "bg-blue-500"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// A truthy `extra` is the class value itself and can name anything, so it
	// travels on; the literal behind it is what the test decides.
	expect(result.code).toContain("className={extra}");
	expect(ruleConditions(result)).toEqual([
		{ kind: "test", index: 0, expected: false },
	]);
});

test("hands a whole class value back when a branch reaches past a rule", () => {
	const result = transform(
		'export const A = ({ loud }: { loud: boolean }) => <textlabel className={loud ? "uppercase" : "bg-slate-900"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// A text transform is read off the host's own props rather than off the
	// resolution, so no rule can carry it and the runtime resolves the lot.
	expect(result.code).toContain(
		'className={loud ? "uppercase" : "bg-slate-900"}',
	);
	expect(result.code).not.toContain("__velaTests=");
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([]);
});

// A bare `opacity-*` fades the element's subtree as well as the element, and the
// subtree is wrapped from the tokens that always apply — a branch is not among
// them. Lowered as a rule it painted the element's own transparency and the
// subtree never learned about the alpha at all.
test("hands a whole class value back when a branch names an opacity", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <frame className={["size-8", on && "opacity-50"]}><textlabel Text="x" /></frame>;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// The tokens written around the branch stay static; only the branch itself
	// goes back, and the host resolves it and fades the subtree from there.
	expect(result.code).toContain('className={on && "opacity-50"}');
	expect(result.code).not.toContain("__velaTests=");
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([]);
});

// A CanvasGroup composites its own subtree, so `GroupTransparency` on the
// instance is the whole fade and a rule can carry it.
test("keeps a canvasgroup's branch opacity on the rule path", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <canvasgroup className={["size-8", on && "opacity-50"]} />;',
		null,
	);

	expect(result.code).not.toContain("className={");
	expect(JSON.parse(result.ir[0]).runtimeRules[0].effects.props).toEqual([
		{ name: "GroupTransparency", value: "0.5" },
	]);
});

// The fade is written outside the branch, so the branch is no reason to stop
// reading it — the tokens around it are as static as they ever were.
test("fades a subtree from an opacity written beside a branch", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <frame className={["size-8 opacity-50", on && "bg-red-500"]}><textlabel Text="x" /></frame>;',
		null,
	);

	expect(result.code).toContain("TextTransparency");
	expect(result.code).toContain("__velaTests=");
});

test("reports an unknown utility written inside a branch", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <frame className={on ? "bg-blu-500" : "bg-slate-900"} />;',
		null,
	);

	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0].code).toBe("unknown-theme-key");
	expect(result.diagnostics[0].token).toBe("bg-blu-500");
});

test("keeps one helper instance when a branch overwrites the base's", () => {
	const result = transform(
		'export const A = ({ roomy }: { roomy: boolean }) => <frame className={["p-4", roomy && "p-8"]} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// The host renders what the resolution came to alongside the children it
	// was handed, so a padding both name has to meet in one of the two.
	expect(result.code).not.toContain("<uipadding");
	expect(ruleConditions(result)).toEqual([
		{ kind: "all", conditions: [] },
		{ kind: "test", index: 0, expected: true },
	]);
});

// The runtime host once implemented a strict subset of the static lowering:
// layout direction, alignment and automatic sizing were dropped, so a component
// whose classes come from a recipe silently lost its layout. These assert the
// dynamic path knows the families at all.
test("resolves layout direction and alignment through the runtime helper", () => {
	const result = transform(
		'<frame className={["flex-row items-center justify-between", wide && "gap-2"]} />',
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("Enum.FillDirection.Horizontal");
	expect(runtimeSource).toContain("Enum.FillDirection.Vertical");
	expect(runtimeSource).toContain("Enum.HorizontalAlignment.Center");
	expect(runtimeSource).toContain("Enum.VerticalAlignment.Center");
	expect(runtimeSource).toContain("Enum.UIFlexAlignment.SpaceBetween");
});

test("resolves automatic sizing through the runtime helper", () => {
	const result = transform(
		'<frame className={["h-9 w-fit", tall && "size-auto"]} />',
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("Enum.AutomaticSize.X");
	expect(runtimeSource).toContain("Enum.AutomaticSize.Y");
	expect(runtimeSource).toContain("Enum.AutomaticSize.XY");
});

test("rewrites dynamic object-map className through the runtime helper", () => {
	const result = transform(
		'<frame className={{ "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	// Each key names its own classes and its value only decides them, so the
	// values travel as tests and the keys are resolved here.
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*roomy \? true : false,\s*!roomy \? true : false\s*\]\}/,
	);
	expect(
		JSON.parse(result.ir[0]).runtimeRules.map(
			(rule: { condition: unknown }) => rule.condition,
		),
	).toEqual([
		{ kind: "test", index: 0, expected: true },
		{ kind: "test", index: 1, expected: true },
	]);
});

test("rewrites dynamic border className through the runtime helper", () => {
	const result = transform(
		'<frame className={["border", active && "border-blue-600"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("uistroke");
	expect(runtimeSource).toContain("Thickness");
	expect(result.code).toContain("Color3.fromRGB(21, 93, 252)");
	expect(result.code).toContain(
		'import { createVelaRuntimeHost } from "@rbxts/vela-runtime";',
	);
});

test("resolves text colors on the runtime path", () => {
	const result = transform(
		'<textlabel className={["text-slate-100", muted && "text-slate-400"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	// The `text-` branch has to reach TextColor3, not fall through to nothing:
	// a dropped text color leaves the label on Roblox's near-black default,
	// which is invisible on any dark surface.
	expect(runtimeSource).toContain('startsWith(token, "text-")');
	expect(runtimeSource).toMatch(/"TextColor3",\s*"TextTransparency"/);
});

test("resolves size and alignment text utilities on the runtime path", () => {
	const result = transform(
		'<textlabel className={[size, "text-left text-lg"]} />',
	);

	expect(result.needsRuntimeHost).toBe(true);
	// These share the `text-` prefix with colors and are classified ahead of
	// them, exactly as the static path does. Leaving them unresolved put every
	// label on Roblox's 8px default.
	expect(runtimeSource).toContain('propEffect("TextSize"');
	expect(runtimeSource).toContain('propEffect("TextXAlignment"');
	expect(runtimeSource).toContain("Enum.TextXAlignment.Left");
});

// The runtime host implemented a strict subset of the static lowering for a
// long time, and a family missing there is silent: a component whose classes
// come from a recipe simply renders without them. These pin the whole surface.
test("the runtime host knows every utility family the static path lowers", () => {
	transform("<frame className={recipe} />");

	const FAMILY_PREFIXES = [
		"bg-",
		"text-",
		"image-",
		"placeholder-",
		"border-",
		"rounded-",
		"z-",
		"p-",
		"px-",
		"py-",
		"pt-",
		"pr-",
		"pb-",
		"pl-",
		"gap-",
		"m-",
		"mx-",
		"my-",
		"mt-",
		"mr-",
		"mb-",
		"ml-",
		"min-w-",
		"max-w-",
		"min-h-",
		"max-h-",
		"w-",
		"h-",
		"size-",
		"overflow-",
		"rotate-",
		"scale-",
		"opacity-",
		"aspect-",
		"flex-",
		"justify-",
		"items-",
		"from-",
		"via-",
		"to-",
		"top-",
		"left-",
		"right-",
		"bottom-",
		"inset-",
		"origin-",
		"content-",
		"self-",
		"order-",
		"leading-",
		"grid-cols-",
		"grid-rows-",
		"auto-rows-",
		"auto-cols-",
		"basis-",
		"translate-x-",
		"translate-y-",
		"object-",
		"pointer-events-",
		"space-x-",
		"space-y-",
		"whitespace-",
		"overscroll-",
		"scrollbar-",
		"scroll-",
		"canvas-",
		"ring-",
		"outline-",
		"divide-",
		"shadow-",
		"font-",
		"align-",
		"duration-",
		"ease-",
		"delay-",
		"animate-",
	] as const;

	for (const prefix of FAMILY_PREFIXES) {
		expect(runtimeSource).toContain(`"${prefix}"`);
	}

	const RESOLVED_PROPS = [
		"ZIndex",
		"Rotation",
		"Interactable",
		"ClipsDescendants",
		"LayoutOrder",
		"LineHeight",
		"ScaleType",
		"TextYAlignment",
		"ImageColor3",
		"PlaceholderColor3",
		"ElasticBehavior",
		"ScrollingDirection",
		"ScrollBarThickness",
		"ScrollBarImageColor3",
		"AutomaticCanvasSize",
		"GroupTransparency",
		"TextTruncate",
		"AnchorPoint",
		"Visible",
	] as const;

	for (const prop of RESOLVED_PROPS) {
		expect(runtimeSource).toContain(prop);
	}

	const RESOLVED_HELPERS = [
		"uicorner",
		"uipadding",
		"uistroke",
		"uilistlayout",
		"uigridlayout",
		"uiflexitem",
		"uiscale",
		"uiaspectratioconstraint",
		"uisizeconstraint",
		"uigradient",
		"uishadow",
	] as const;

	for (const helper of RESOLVED_HELPERS) {
		expect(runtimeSource).toContain(`"${helper}"`);
	}
});

test("composes the runtime families that only meet at the end", () => {
	transform("<frame className={recipe} />");

	// Position, AnchorPoint, the size constraints, a grid track and the gradient
	// stops are all built from more than one token, so the dynamic path needs
	// the same deferred composition the static `PendingAxes::flush` does.
	expect(runtimeSource).toContain("function applyComposedResolution(");
	expect(runtimeSource).toContain("function applyComposedTransform(");
	expect(runtimeSource).toContain("function applyComposedSizeConstraints(");
	expect(runtimeSource).toContain("function applyComposedGrid(");
	expect(runtimeSource).toContain("function applyComposedGradient(");
	expect(runtimeSource).toContain("MinSize");
	expect(runtimeSource).toContain("MaxSize");
	expect(runtimeSource).toContain("CellSize");
	expect(runtimeSource).toContain("CellPadding");
	expect(runtimeSource).toContain("ColorSequence");
});

test("drops runtime utilities the host element cannot carry", () => {
	transform("<frame className={recipe} />");

	// `TextColor3` on a Frame is a hard Roblox error rather than a no-op, so the
	// dynamic path filters by host tag the way `is_utility_allowed_on_host` does.
	expect(runtimeSource).toContain("function isPropAllowedOnTag(");
	expect(runtimeSource).toContain('tag === "textlabel"');
	expect(runtimeSource).toContain('tag === "imagelabel"');
	expect(runtimeSource).toContain('tag === "scrollingframe"');
	expect(runtimeSource).toContain('tag === "textbox"');
});

test("resolves color opacity modifiers and arbitrary hex on the runtime path", () => {
	transform("<frame className={recipe} />");

	expect(runtimeSource).toContain("function splitColorOpacity(");
	expect(runtimeSource).toContain("function opacityToTransparency(");
	expect(runtimeSource).toContain("function parseArbitraryColor(");
});

test("rewrites dynamic border object maps through the runtime helper", () => {
	const result = transform(
		'<frame className={{ "border-2": thick, "border-transparent": hidden }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("uistroke");
	expect(runtimeSource).toContain("Thickness");
	expect(runtimeSource).toContain("Transparency");
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*thick \? true : false,\s*hidden \? true : false\s*\]\}/,
	);
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([
		expect.objectContaining({
			condition: { kind: "test", index: 0, expected: true },
			effects: expect.objectContaining({
				helpers: [expect.objectContaining({ tag: "uistroke" })],
			}),
		}),
		expect.objectContaining({
			condition: { kind: "test", index: 1, expected: true },
			effects: expect.objectContaining({
				helpers: [expect.objectContaining({ tag: "uistroke" })],
			}),
		}),
	]);
});

test("rewrites runtime-aware variants through the inline runtime rule path", () => {
	const result = transform(
		'<frame className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("__velaRules");
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain(
		'className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600"',
	);
	expect(runtimeSource).toContain("uistroke");
});

test("rewrites dynamic ClassValue expressions through the runtime wrapper", () => {
	const result = transform(
		'<frame className={["bg-slate-500", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain('import __VelaReact from "@rbxts/react";');
	expect(result.code).toContain("const VelaRuntimeHost =");
	expect(result.code).toContain("<VelaRuntimeHost");
	expect(runtimeSource).toContain("__velaTag");
	expect(runtimeSource).toContain("__velaRules");
	// Intentional regression checks for the removed runtime package import path.
	expect(result.code).toContain(
		'import { createVelaRuntimeHost } from "@rbxts/vela-runtime";',
	);
	expect(result.code).not.toContain("../__vela__/runtime-host");
	expect(result.code).not.toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("__rbxtsTailwindRules");
	expect(result.code).not.toContain("__rbxtsTailwindTag");
	expect(result.code).not.toContain("__rbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("rbxts-tailwind");
	expect(result.code).not.toContain("rbxtsTailwind");
	expect(result.code).not.toContain("createTailwindRuntimeHost");
	expect(result.code).not.toContain("TailwindRuntimeHost");
	expect(result.code).not.toContain("@vela-rbxts/types");
	expect(result.code).not.toContain("@vela-rbxts/config");
	expect(runtimeSource).toContain("BackgroundColor3");
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toContain("unsupported-classname-expression");
	expect(result.ir).toHaveLength(1);
	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				props: expect.arrayContaining([
					expect.objectContaining({
						name: "BackgroundColor3",
					}),
				]),
				helpers: [],
			}),
			runtimeRules: [
				expect.objectContaining({
					condition: { kind: "test", index: 0, expected: true },
				}),
			],
			runtimeClassValue: true,
		}),
	);
});

test("folds a fully static array className without injecting the runtime wrapper", () => {
	const result = transform(
		'<frame className={["bg-slate-500", true && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(runtimeSource).toContain("BackgroundColor3");
	expect(runtimeSource).toContain("uicorner");
	expect(result.ir).toHaveLength(1);
	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				props: expect.arrayContaining([
					expect.objectContaining({
						name: "BackgroundColor3",
					}),
				]),
				helpers: expect.arrayContaining([
					expect.objectContaining({
						tag: "uicorner",
					}),
				]),
			}),
			runtimeRules: [],
			runtimeClassValue: false,
		}),
	);
});

test("folds a locally constant identifier before lowering the className", () => {
	const result = transform(
		'const active = true; <frame className={["bg-slate-500", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(runtimeSource).toContain("BackgroundColor3");
	expect(runtimeSource).toContain("uicorner");
});

test("folds a constant object map down to the surviving static key", () => {
	const result = transform(
		'const roomy = false; <frame className={{ "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
});

test("folds a constant ternary to a static utility class", () => {
	const result = transform(
		'const wide = false; <frame className={wide ? "w-80" : "w-40"} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(160, 0\), \d+\)\}/,
	);
});

test("keeps the runtime wrapper when a dynamic remainder survives constant folding", () => {
	const result = transform(
		'const active = true; <frame className={["bg-slate-500", active && dynamicToken]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(result.code).toContain("className={dynamicToken}");
	expect(result.code).not.toContain("active && dynamicToken");
	expect(runtimeSource).toContain("BackgroundColor3");
});

test("keeps dynamic object-map className values on the runtime wrapper", () => {
	const result = transform(
		'let roomy = false; <frame className={{ "bg-slate-500": true, "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("BackgroundColor3");
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toContain('"bg-slate-500": true');
	// The constant key folds into the base; the two undecided ones stay tests.
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*roomy \? true : false,\s*!roomy \? true : false\s*\]\}/,
	);
	expect(JSON.parse(result.ir[0]).base.props).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: "BackgroundColor3" }),
		]),
	);
});

test("keeps variant-prefixed literals on the runtime rule path when they survive folding", () => {
	const enabledResult = transform(
		'const enabled = true; <frame className={["rounded-md", enabled && "md:px-4"]} />',
	);

	expect(enabledResult.changed).toBe(true);
	expect(enabledResult.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("__velaRules");
	expect(enabledResult.code).not.toContain("className=");
	expect(runtimeSource).toContain("uicorner");

	const disabledResult = transform(
		'const enabled = false; <frame className={["rounded-md", enabled && "md:px-4"]} />',
	);

	expect(disabledResult.changed).toBe(true);
	expect(disabledResult.diagnostics).toEqual([]);
	expect(disabledResult.code).not.toContain("createVelaRuntimeHost");
	expect(disabledResult.code).not.toContain("VelaRuntimeHost");
	expect(disabledResult.code).not.toContain("__velaRules");
	expect(disabledResult.code).not.toContain("className=");
	expect(runtimeSource).toContain("uicorner");
});

test("lifts variant-prefixed literal utilities into runtime rules", () => {
	const result = transform(
		'<frame className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain('import __VelaReact from "@rbxts/react";');
	expect(result.code).toContain("const VelaRuntimeHost =");
	expect(result.code).toContain("<VelaRuntimeHost");
	// Intentional regression checks for the removed runtime package import path.
	expect(result.code).not.toContain("../__vela__/runtime-host");
	expect(runtimeSource).toContain("__velaRules");
	expect(result.code).not.toContain(
		'className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600"',
	);
	expect(result.ir).toHaveLength(1);

	const style = JSON.parse(result.ir[0]);
	expect(style).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				helpers: expect.arrayContaining([
					expect.objectContaining({
						tag: "uicorner",
					}),
				]),
			}),
			runtimeRules: expect.arrayContaining([
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "width",
						alias: "md",
					}),
					effects: expect.objectContaining({
						helpers: expect.arrayContaining([
							expect.objectContaining({
								tag: "uistroke",
							}),
						]),
					}),
				}),
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "input",
						value: "touch",
					}),
					effects: expect.objectContaining({
						helpers: expect.arrayContaining([
							expect.objectContaining({
								tag: "uistroke",
							}),
						]),
					}),
				}),
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "orientation",
						value: "portrait",
					}),
					effects: expect.objectContaining({
						props: expect.arrayContaining([
							expect.objectContaining({
								name: "SizeX",
								value: "new UDim(0, 320)",
							}),
						]),
					}),
				}),
			]),
			runtimeClassValue: false,
		}),
	);
});

test("lowers rotate utilities to the Roblox Rotation prop", () => {
	const result = transform('<frame className="rotate-45" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Rotation=\{45\}/);
});

test("lowers negative rotate utilities to a negative Rotation prop", () => {
	const result = transform('<frame className="-rotate-90" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Rotation=\{-90\}/);
});

test("warns on unsupported rotate values", () => {
	const result = transform('<frame className="rotate-17" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toMatch(/Rotation=/);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-rotation-value",
				token: "rotate-17",
			}),
		]),
	);
});

test("lowers opacity utilities to BackgroundTransparency", () => {
	const result = transform('<frame className="opacity-25" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.75\}/);
});

test("lowers opacity on a canvas group to GroupTransparency", () => {
	const result = transform('<canvasgroup className="opacity-25" />');

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/GroupTransparency=\{0\.75\}/);
	expect(result.code).not.toMatch(/BackgroundTransparency=\{0\.75\}/);

	transform('<canvasgroup className="md:opacity-25" />');
	expect(runtimeSource).toContain("__velaRules");
	expect(runtimeSource).toContain("GroupTransparency");
});

test("fades the text an opacity utility sits on", () => {
	const result = transform('<textlabel className="opacity-25" Text="hi" />');

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/TextTransparency=\{0\.75\}/);
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.75\}/);
});

test("composes an opacity into the children written under it", () => {
	const result = transform(
		'<frame className="opacity-50"><textlabel Text="hi" /><frame className="bg-slate-700" /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	// The label carries no class of its own and is still inside the fade.
	expect(result.code).toMatch(/TextTransparency=\{0\.5\}/);
	// Alpha multiplies, so a half-transparent background under a half-opacity
	// parent lands at a quarter — not at the parent's own value.
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.5\}/);
});

test("multiplies a nested opacity instead of overwriting it", () => {
	const result = transform(
		'<frame className="opacity-50"><frame className="opacity-50 bg-slate-700" /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.75\}/);
});

test("stops composing under a canvas group, which composites its own subtree", () => {
	const result = transform(
		'<frame className="opacity-50"><canvasgroup><frame className="bg-slate-700" /></canvasgroup></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/GroupTransparency=\{0\.5\}/);
	// The frame inside the group keeps its own painted background untouched.
	expect(result.code).toMatch(
		/<frame BackgroundColor3=\{Color3\.fromRGB\(49, 65, 88\)\} BorderSizePixel=\{0\}\/>/,
	);
});

test("composes an opacity through a conditional and a map", () => {
	const result = transform(
		'<frame className="opacity-50">{items.map((item) => <textlabel Text={item} />)}</frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/TextTransparency=\{0\.5\}/);
});

test("carries an opacity into a variant that restates the transparency", () => {
	const result = transform(
		'<frame className="opacity-50"><frame className="bg-slate-700 hover:bg-blue-600/50" /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	// The variant overlays the base at render time, so it carries the product
	// too — 0.5 alpha of its own under 0.5 from the parent.
	expect(result.code).toContain('"value": "0.75"');
});

test("hands a dynamic class value the inherited opacity to compose itself", () => {
	const result = transform(
		'<frame className="opacity-50"><frame className={classes} /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__velaOpacity={0.5}");
});

test("the runtime host composes the opacity handed to it", () => {
	expect(runtimeSource).toContain("__velaOpacity");
	expect(runtimeSource).toContain("function composeInheritedOpacity(");
	expect(runtimeSource).toContain("function transparencyProps(");
});

// A rendered element carries the Roblox class name — roblox-ts lowers
// `<textlabel />` to `"TextLabel"` — while every table the runtime resolves
// against is keyed by the JSX tag. Comparing the two as they come matches
// nothing, and the fade silently reaches no channel at all.
test("the fade reads an element's tag as a class name", () => {
	expect(runtimeSource).toContain("(elementType as string).lower()");
});

test("hands the children an opacity cannot reach to the runtime", () => {
	const result = transform(
		'<frame className="opacity-50">{props.children}<Button /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.5}>{props.children}</__VelaOpacity.Provider>",
	);
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.5}><Button/></__VelaOpacity.Provider>",
	);
});

test("an opacity on a component element crosses as an alpha, not a background", () => {
	const result = transform('<Label className="opacity-50 w-20" />');

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.5}>",
	);
	// The tag is unknown here, so a background is the wrong channel to guess at:
	// the label's own text is what the fade has to reach.
	expect(emitted(result.code)).not.toContain("BackgroundTransparency");
	expect(emitted(result.code)).toContain("Size=");
});

test("a component's own opacity multiplies with the one it inherits", () => {
	const result = transform(
		'<frame className="opacity-50"><Label className="opacity-50" /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.25}>",
	);
});

test("a component root reads the alpha its caller provided", () => {
	const result = transform(
		'export const Label = () => <textlabel className="text-sm" Text="hi" />;',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain("<__VelaOpacity.Fade>");
	expect(result.code).toMatch(
		/import \{[^}]*__VelaOpacity[^}]*\} from "@rbxts\/vela-runtime";/,
	);
	// The host is a great deal more than a fade needs.
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("createVelaRuntimeHost");
});

test("a component root that resolves at runtime needs no fade of its own", () => {
	const result = transform(
		'export const Label = () => <textlabel className="text-sm hover:text-lg" Text="hi" />;',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).not.toContain("__VelaOpacity.Fade");
	expect(result.needsRuntimeHost).toBe(true);
});

test("a callback inside a component is not a component root", () => {
	const result = transform(
		"export const List = () => <frame>{items.map((item) => <textlabel Text={item} />)}</frame>;",
	);

	expect(result.diagnostics).toEqual([]);
	expect(
		emitted(result.code).match(/__VelaOpacity\.Fade>/g) ?? [],
	).toHaveLength(2);
});

test("a fade that only resolves at runtime is left whole to the runtime", () => {
	const result = transform(
		'<frame className={active && "opacity-50"}><textlabel Text="hi" /><Label /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	// The host resolves the whole class list and hands its subtree one alpha.
	// Fading part of it here would have applied that part twice.
	expect(emitted(result.code)).not.toContain("TextTransparency");
	expect(emitted(result.code)).not.toContain("__VelaOpacity.Provider");
	expect(runtimeSource).toContain("resolution.opacityAlpha");
	expect(runtimeSource).toContain("provide(childAlpha, userChildren)");
});

test("the fade ends at a canvasgroup on both paths", () => {
	const result = transform(
		'<frame className="opacity-50"><canvasgroup className="bg-slate-700"><Label /></canvasgroup></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	// The group composites its own subtree, so nothing below it repeats the
	// multiplication — no provider is handed down past it.
	expect(emitted(result.code)).not.toContain("__VelaOpacity.Provider");
	expect(emitted(result.code)).toContain("GroupTransparency={0.5}");
	expect(runtimeSource).toContain("__VelaOpacity.stop(userChildren)");
});

test("a component's children are faded once, by the provider", () => {
	const result = transform(
		'<frame className="opacity-50"><Card><textlabel Text="hi" /></Card></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	// The card renders them out of sight, so the provider is what reaches them;
	// fading them here as well would land the same alpha twice.
	expect(emitted(result.code)).not.toContain("TextTransparency");
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.5}>",
	);
});

test("warns on out-of-range opacity values", () => {
	const result = transform(
		'<frame className="opacity-150" />',
		withoutPreflight,
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toMatch(/BackgroundTransparency=/);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-opacity-value",
				token: "opacity-150",
			}),
		]),
	);
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

test("keeps the public transform options compiler-centric", () => {
	expectTypeOf<Parameters<typeof transform>[1]>().toEqualTypeOf<
		| {
				configJson?: string;
		  }
		| null
		| undefined
	>();
});

test("loads the native compiler binding", () => {
	expect(implementationKind()).toBe("native");
});

test("retains the default config shape for compatibility", () => {
	expect(defaultConfig.theme.colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(248, 250, 252)",
			500: "Color3.fromRGB(98, 116, 142)",
			700: "Color3.fromRGB(49, 65, 88)",
			950: "Color3.fromRGB(2, 6, 24)",
		}),
	);
	expect(defaultConfig.theme.colors.surface).toBeUndefined();
	expect(defaultConfig.theme.radius).toEqual({
		DEFAULT: "new UDim(0, 4)",
		none: "new UDim(0, 0)",
		xs: "new UDim(0, 2)",
		sm: "new UDim(0, 4)",
		md: "new UDim(0, 6)",
		lg: "new UDim(0, 8)",
		xl: "new UDim(0, 12)",
		"2xl": "new UDim(0, 16)",
		"3xl": "new UDim(0, 24)",
		"4xl": "new UDim(0, 32)",
		full: "new UDim(0.5, 0)",
	});
	expect(defaultConfig.theme.spacing).toEqual({
		"4": "new UDim(0, 16)",
	});
});

test("lowers className on components into props and helper children", () => {
	const result = transform(
		`export const A = () => <Box className="bg-slate-700 rounded-md" />;`,
		null,
	);

	expect(result.code).toContain(
		"BackgroundColor3={Color3.fromRGB(49, 65, 88)}",
	);
	expect(result.code).toContain(
		"<uicorner CornerRadius={__VelaRem.scale(new UDim(0, 6), 0)}/>",
	);
	expect(result.code).not.toContain("className");
	expect(result.diagnostics).toEqual([]);
});

test("lowers className on member expression components", () => {
	const result = transform(
		`export const A = () => <Switch.Root className="bg-slate-700" />;`,
		null,
	);

	expect(result.code).toContain(
		"<Switch.Root BackgroundColor3={Color3.fromRGB(49, 65, 88)}/>",
	);
});

test("prepends component helper children before existing children", () => {
	const result = transform(
		`export const A = () => <Box className="rounded-md"><textlabel Text="hi"/></Box>;`,
		null,
	);

	expect(result.code).toContain(
		`<uicorner CornerRadius={__VelaRem.scale(new UDim(0, 6), 0)}/><textlabel Text="hi"/>`,
	);
});

test("routes runtime variants on components through the runtime host", () => {
	const result = transform(
		`export const A = () => <Box className="sm:bg-slate-700" />;`,
		null,
	);

	expect(result.code).toContain("<VelaRuntimeHost");
	expect(result.code).toContain("__velaTag={Box}");
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
});

test("the runtime host re-reads the viewport so breakpoints stay live", () => {
	const result = transform(
		`export const A = () => <frame className="md:px-4" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	// ViewportSize is 1x1 until the first frame renders, so a mount-time read
	// alone pins every breakpoint to a width no rule can match.
	expect(runtimeSource).toMatch(
		/camera\s*\.GetPropertyChangedSignal\("ViewportSize"\)[\s\S]*?updateEnvironment/,
	);
});

test("routes dynamic className on components through the runtime host", () => {
	const result = transform(
		`export const A = ({ on }: { on: boolean }) => <Box className={on ? "bg-slate-700" : "bg-slate-900"} />;`,
		null,
	);

	expect(result.code).toContain("__velaTag={Box}");
	// The eventual host element is unknown, but the tokens are not, so both
	// branches lower here the way they would on a host element.
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/__velaTests=\{\[\s*on \? true : false\s*\]\}/);
	expect(
		JSON.parse(result.ir[0]).runtimeRules.map(
			(rule: { condition: unknown }) => rule.condition,
		),
	).toEqual([
		{ kind: "test", index: 0, expected: true },
		{ kind: "test", index: 0, expected: false },
	]);
});

test("forwards member expression components to the runtime host", () => {
	const result = transform(
		`export const A = () => <Switch.Root className="sm:bg-slate-700"><Switch.Thumb/></Switch.Root>;`,
		null,
	);

	expect(result.code).toContain("__velaTag={Switch.Root}");
	expect(result.code).toContain("</VelaRuntimeHost>");
});

test("renames the closing tag when swapping in the runtime host", () => {
	const result = transform(
		`export const A = () => <frame className="sm:bg-slate-700"><textlabel Text="x"/></frame>;`,
		null,
	);

	expect(result.code).toContain("</VelaRuntimeHost>");
	expect(result.code).not.toContain("</frame>");
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

test("lowers right/bottom utilities relative to the far edges", () => {
	const result = transform(
		`export const A = () => <frame className="right-4 bottom-2" />;`,
		null,
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(new UDim2\(1, -16, 1, -8\), \d+\)\}/,
	);
});

test("lowers negative and fractional right utilities", () => {
	const negative = transform(
		`export const A = () => <frame className="-right-4" />;`,
		null,
	);
	expect(negative.diagnostics).toEqual([]);
	expect(negative.code).toMatch(
		/Position=\{__VelaRem\.scale\(new UDim2\(1, 16, 0, 0\), \d+\)\}/,
	);

	const fractional = transform(
		`export const B = () => <frame className="bottom-1/2" />;`,
		null,
	);
	expect(fractional.diagnostics).toEqual([]);
	expect(fractional.code).toMatch(/Position=\{UDim2\.fromScale\(0, 0\.5\)\}/);
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

test("lowers leading utilities into LineHeight on text hosts", () => {
	const result = transform(
		`export const A = () => <textlabel className="leading-tight" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/LineHeight=\{1\.25\}/);

	const invalid = transform(
		`export const B = () => <textlabel className="leading-7" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-line-height-value" }),
	]);
});

test("merges italic with font weight into a single FontFace", () => {
	const merged = transform(
		`export const A = () => <textlabel className="italic font-bold" />;`,
		null,
	);
	expect(merged.diagnostics).toEqual([]);
	expect(merged.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Bold, Enum\.FontStyle\.Italic\)\}/,
	);

	const italicOnly = transform(
		`export const B = () => <textlabel className="italic" />;`,
		null,
	);
	expect(italicOnly.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Regular, Enum\.FontStyle\.Italic\)\}/,
	);

	const weightOnly = transform(
		`export const C = () => <textlabel className="font-bold" />;`,
		null,
	);
	expect(weightOnly.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Bold\)\}/,
	);
});

test("merges the font family with weight and style into a single FontFace", () => {
	const mono = transform(
		`export const A = () => <textlabel className="font-mono" />;`,
		null,
	);
	expect(mono.diagnostics).toEqual([]);
	expect(mono.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/RobotoMono\.json", Enum\.FontWeight\.Regular\)\}/,
	);

	const merged = transform(
		`export const B = () => <textlabel className="font-serif font-bold italic" />;`,
		null,
	);
	expect(merged.diagnostics).toEqual([]);
	expect(merged.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/Merriweather\.json", Enum\.FontWeight\.Bold, Enum\.FontStyle\.Italic\)\}/,
	);

	const custom = transform(
		`export const C = () => <textlabel className="font-display" />;`,
		{
			configJson: JSON.stringify(
				defineConfig({
					theme: {
						extend: {
							fontFamily: {
								display: "rbxasset://fonts/families/GothamSSm.json",
							},
						},
					},
				}),
			),
		},
	);
	expect(custom.diagnostics).toEqual([]);
	expect(custom.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/GothamSSm\.json", Enum\.FontWeight\.Regular\)\}/,
	);

	const unknown = transform(
		`export const D = () => <textlabel className="font-handwriting" />;`,
		null,
	);
	expect(unknown.diagnostics).toEqual([
		expect.objectContaining({
			code: "unknown-theme-key",
			token: "font-handwriting",
		}),
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

test("lowers pixel translates into Position offsets", () => {
	const result = transform(
		`export const A = () => <frame className="translate-x-4 -translate-y-2" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(UDim2\.fromOffset\(16, -8\), \d+\)\}/,
	);

	const combined = transform(
		`export const B = () => <frame className="left-1/2 translate-x-4" />;`,
		null,
	);
	expect(combined.code).toMatch(
		/Position=\{__VelaRem\.scale\(new UDim2\(0\.5, 16, 0, 0\), \d+\)\}/,
	);
});

test("lowers fractional translates into AnchorPoint", () => {
	const centered = transform(
		`export const A = () => <frame className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />;`,
		null,
	);

	expect(centered.diagnostics).toEqual([]);
	expect(centered.code).toMatch(/AnchorPoint=\{new Vector2\(0\.5, 0\.5\)\}/);
	expect(centered.code).toMatch(/Position=\{UDim2\.fromScale\(0\.5, 0\.5\)\}/);

	const positive = transform(
		`export const B = () => <frame className="translate-x-full" />;`,
		null,
	);
	expect(positive.code).toMatch(/AnchorPoint=\{new Vector2\(-1, 0\)\}/);
});

test("parses top utilities as position instead of a gradient stop", () => {
	const result = transform(
		`export const A = () => <frame className="top-4" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(UDim2\.fromOffset\(0, 16\), \d+\)\}/,
	);
});

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

test("lowers space utilities into UIListLayout padding with a direction", () => {
	const horizontal = transform(
		`export const A = () => <frame className="space-x-4" />;`,
		null,
	);
	expect(horizontal.diagnostics).toEqual([]);
	expect(horizontal.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(horizontal.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Horizontal\}/,
	);

	const vertical = transform(
		`export const B = () => <frame className="space-y-2" />;`,
		null,
	);
	expect(vertical.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(vertical.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Vertical\}/,
	);

	const reverse = transform(
		`export const C = () => <frame className="space-x-reverse" />;`,
		null,
	);
	expect(reverse.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-space-value" }),
	]);
});

test("lowers whitespace utilities into TextWrapped", () => {
	const result = transform(
		`export const A = () => <textlabel className="whitespace-nowrap" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/TextWrapped=\{false\}/);

	const invalid = transform(
		`export const B = () => <textlabel className="whitespace-pre" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-whitespace-value" }),
	]);
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

test("lowers ring and outline utilities into the shared UIStroke", () => {
	const ring = transform(
		`export const A = () => <frame className="ring ring-rose-500" />;`,
		null,
	);
	expect(ring.diagnostics).toEqual([]);
	expect(ring.code).toMatch(/Thickness=\{__VelaRem\.scale\(3, \d+\)\}/);
	expect(ring.code).toMatch(
		/ApplyStrokeMode=\{Enum\.ApplyStrokeMode\.Border\}/,
	);
	expect(ring.code).toMatch(/<uistroke\b[^>]*Color=\{Color3\.fromRGB\(/i);

	const outline = transform(
		`export const B = () => <frame className="outline-4" />;`,
		null,
	);
	expect(outline.code).toMatch(/Thickness=\{__VelaRem\.scale\(4, \d+\)\}/);

	const none = transform(
		`export const C = () => <frame className="outline-none" />;`,
		null,
	);
	expect(none.code).toMatch(/Thickness=\{0\}/);

	const invalid = transform(
		`export const D = () => <frame className="ring-offset-2 outline-dashed" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-stroke-value" }),
		expect.objectContaining({ code: "unsupported-stroke-value" }),
	]);
});

test("centers elements with mx-auto and my-auto", () => {
	const both = transform(
		`export const A = () => <frame className="mx-auto my-auto" />;`,
		null,
	);
	expect(both.diagnostics).toEqual([]);
	expect(both.code).toMatch(/AnchorPoint=\{new Vector2\(0\.5, 0\.5\)\}/);
	expect(both.code).toMatch(/Position=\{UDim2\.fromScale\(0\.5, 0\.5\)\}/);

	const horizontal = transform(
		`export const B = () => <frame className="mx-auto" />;`,
		null,
	);
	expect(horizontal.code).toMatch(/AnchorPoint=\{new Vector2\(0\.5, 0\)\}/);
	expect(horizontal.code).toMatch(/Position=\{UDim2\.fromScale\(0\.5, 0\)\}/);

	const logical = transform(
		`export const C = () => <frame className="ms-4" />;`,
		null,
	);
	expect(logical.diagnostics).toEqual([
		expect.objectContaining({ code: "no-roblox-equivalent" }),
	]);
});

test("attaches a transition config to the runtime host", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 md:bg-blue-600 transition duration-300 ease-out" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaTransition={");
	expect(result.code).toMatch(/"time": 0\.3/);
	expect(result.code).toMatch(/"style": "Quad"/);
	expect(result.code).toMatch(/"direction": "Out"/);
});

test("duration alone enables the transition and defaults the easing", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 duration-500" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__velaTransition={");
	expect(result.code).toMatch(/"time": 0\.5/);
	expect(result.code).toMatch(/"direction": "Out"/);
});

test("transition-none disables the transition", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 transition duration-300 transition-none" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("__velaTransition={");
});

test("warns when transition utilities cannot ever fire", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 transition" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "transition-without-runtime" }),
	]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__velaTransition={");
});

test("keeps transitions on dynamic class values in the runtime host", () => {
	const result = transform(
		`export const A = (props: { active: boolean }) => (
			<frame className={["transition duration-300", props.active && "bg-blue-600"]} />
		);`,
		null,
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("TweenService");
});

test("rejects invalid transition values with diagnostics", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 duration-fast ease-bounce transition-weird" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "duration-fast",
		}),
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "ease-bounce",
		}),
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "transition-weird",
		}),
	]);
});

test("promotes animate presets to the runtime host", () => {
	const result = transform(
		`export const A = () => <frame className="bg-blue-600 animate-spin" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/__velaAnimation=\{"spin"\}/);
	expect(runtimeSource).toContain("startPresetAnimation");
});

test("animate-none cancels an earlier preset", () => {
	const result = transform(
		`export const A = () => <frame className="animate-pulse animate-none" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__velaAnimation=");
});

test("rejects unsupported animate presets", () => {
	const result = transform(
		`export const A = () => <frame className="animate-ping" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-animation-value",
			token: "animate-ping",
		}),
	]);
});

test("renders the runtime host through forwardRef for slotting compatibility", () => {
	transform(
		`export const A = () => <frame className="bg-blue-600 animate-spin" />;`,
		null,
	);

	expect(runtimeSource).toMatch(/forwardRef\(\s*\(props: VelaRuntimeHostProps/);
	expect(runtimeSource).toContain("assignForwardedRef");
});

test("warns and strips motion utilities on component elements", () => {
	const animated = transform(
		`export const A = () => <Box className="animate-spin" />;`,
		null,
	);
	expect(animated.diagnostics).toEqual([
		expect.objectContaining({ code: "motion-on-component" }),
	]);
	expect(animated.code).not.toContain("__velaAnimation=");

	const transitioned = transform(
		`export const B = () => <Box className="md:bg-blue-600 transition" />;`,
		null,
	);
	expect(transitioned.diagnostics).toEqual([
		expect.objectContaining({ code: "motion-on-component" }),
	]);
	expect(transitioned.code).not.toContain("__velaTransition={");
	expect(runtimeSource).toContain("__velaRules");
});

test("transforms a literal Text at compile time without a runtime host", () => {
	const upper = transform(
		`export const A = () => <textlabel Text="hello world" className="uppercase" />;`,
		null,
	);
	expect(upper.diagnostics).toEqual([]);
	expect(upper.needsRuntimeHost).toBe(false);
	expect(upper.code).toContain('Text="HELLO WORLD"');

	const capitalized = transform(
		`export const B = () => <textlabel Text="hello brave world" className="capitalize" />;`,
		null,
	);
	expect(capitalized.code).toContain('Text="Hello Brave World"');
});

test("wraps a literal Text in escaped RichText markup for decorations", () => {
	const result = transform(
		`export const A = () => <textlabel Text="a < b & c" className="underline" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toContain('Text="<u>a &lt; b &amp; c</u>"');
	expect(result.code).toMatch(/RichText=\{true\}/);

	const strike = transform(
		`export const B = () => <textlabel Text="done" className="line-through uppercase" />;`,
		null,
	);
	expect(strike.code).toContain('Text="<s>DONE</s>"');
});

test("backs off decorations on consumer-managed RichText", () => {
	const result = transform(
		`export const A = () => <textlabel RichText Text="<b>hi</b>" className="underline uppercase" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "decoration-on-richtext" }),
	]);
	expect(result.code).not.toContain("<u>");
	// The transform still applies, but the markup stays unescaped and unwrapped.
	expect(result.code).toContain('Text="<B>HI</B>"');
});

test("defers dynamic Text to the runtime pipeline", () => {
	const result = transform(
		`export const A = (props: { label: string }) => (
			<textlabel Text={props.label} className="uppercase underline" />
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaText={");
	expect(result.code).toMatch(/"transform": "upper"/);
	expect(result.code).toMatch(/"decoration": "underline"/);
	expect(runtimeSource).toContain("applyTextConfig");
});

test("normal-case and no-underline cancel earlier text utilities", () => {
	const result = transform(
		`export const A = () => <textlabel Text="hi" className="uppercase underline normal-case no-underline" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toContain('Text="hi"');
	expect(result.code).not.toContain("__velaText");
});

test("promotes margined elements to the runtime host with a margin spec", () => {
	const result = transform(
		`export const A = () => <frame className="m-4 w-40 h-20 bg-slate-700" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaMargin={");
	expect(result.code).toMatch(/"top": 16\.0/);
	expect(result.code).toMatch(/"left": 16\.0/);
	expect(runtimeSource).toContain("prepareMarginWrapper");
	expect(runtimeSource).toContain("renderMarginWrapper");
});

test("merges per-side margins with last-wins semantics", () => {
	const result = transform(
		`export const A = () => <frame className="mx-2 mt-4 mx-6" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"top": 16\.0/);
	expect(result.code).toMatch(/"left": 24\.0/);
	expect(result.code).toMatch(/"right": 24\.0/);
	expect(result.code).toMatch(/"bottom": 0\.0/);
});

test("negative top and left margins shift Position instead of wrapping", () => {
	const result = transform(
		`export const A = () => <frame className="-mt-2 -ml-4" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(UDim2\.fromOffset\(-16, -8\), \d+\)\}/,
	);
	expect(result.code).not.toContain("__velaMargin");
});

test("rejects inexpressible negative margins and margin auto", () => {
	const negative = transform(
		`export const A = () => <frame className="-mb-2 -m-4" />;`,
		null,
	);
	expect(negative.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-negative-margin",
			token: "-mb-2",
		}),
		expect.objectContaining({
			code: "unsupported-negative-margin",
			token: "-m-4",
		}),
	]);

	const auto = transform(
		`export const B = () => <frame className="m-auto" />;`,
		null,
	);
	expect(auto.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-margin-value" }),
	]);
});

test("keeps margins working on component elements", () => {
	const result = transform(
		`export const A = () => <Box className="m-4" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaMargin={");
	expect(result.code).toContain("__velaTag={Box}");
});

test("promotes divided containers to the runtime host with a divide spec", () => {
	const result = transform(
		`export const A = () => (
			<frame className="flex-col divide-y-2 divide-slate-500">
				<frame />
				<frame />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaDivide={");
	expect(result.code).toMatch(/"axis": "y"/);
	expect(result.code).toMatch(/"thickness": 2\.0/);
	expect(result.code).toMatch(/"color": "Color3\.fromRGB\(/);
	expect(runtimeSource).toContain("interleaveDivideSeparators");
});

test("divide separators step over helper elements lowered as children", () => {
	const result = transform(
		`export const A = () => (
			<frame className="flex-col divide-y-2 divide-slate-500">
				<frame />
				<frame />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// flex-col lowers a uilistlayout into the same children list, so counting
	// raw positions puts a separator above the first real child.
	expect(result.code).toContain("<uilistlayout");
	expect(runtimeSource).toMatch(/if \(isModifierChild\(child\)\) \{/);
	expect(runtimeSource).toMatch(/if \(seenContentChild\) \{/);
	expect(runtimeSource).toMatch(
		/function isModifierChild[\s\S]*?startsWith\(elementType\.lower\(\), "ui"\)/,
	);
});

test("bare divide-x defaults to a one pixel separator", () => {
	const result = transform(
		`export const A = () => <frame className="divide-x" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"axis": "x"/);
	expect(result.code).toMatch(/"thickness": 1\.0/);
	expect(result.code).not.toMatch(/"color":/);
});

test("divide color without an axis paints nothing", () => {
	const result = transform(
		`export const A = () => <frame className="divide-rose-500" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__velaDivide");
});

test("rejects unsupported divide thickness values", () => {
	const result = transform(
		`export const A = () => <frame className="divide-x-3" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-divide-value",
			token: "divide-x-3",
		}),
	]);
});

test("lowers hover variants into runtime rules", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 hover:bg-blue-600 transition" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/"kind": "hover"/);
	expect(runtimeSource).toContain("attachHoverTracking");
	expect(runtimeSource).toContain("MouseEnter");
});

test("narrows the tween to the transition property group", () => {
	const colors = transform(
		`export const A = () => <frame className="bg-slate-700 md:bg-blue-600 transition-colors" />;`,
		null,
	);
	expect(colors.diagnostics).toEqual([]);
	expect(colors.code).toMatch(/"property": "colors"/);
	expect(runtimeSource).toContain("transitionCoversProp");

	const all = transform(
		`export const B = () => <frame className="bg-slate-700 md:bg-blue-600 transition" />;`,
		null,
	);
	expect(all.code).toMatch(/"property": "all"/);

	// A shadow lives on a helper instance, which applies instantly, so there
	// is nothing for the filter to hold back.
	const shadow = transform(
		`export const C = () => <frame className="md:bg-blue-600 transition-shadow" />;`,
		null,
	);
	expect(shadow.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-transition-value" }),
	]);
});

test("lowers active and focus variants into runtime rules", () => {
	const pressed = transform(
		`export const A = () => <textbutton className="bg-slate-700 active:bg-blue-600" />;`,
		null,
	);
	expect(pressed.diagnostics).toEqual([]);
	expect(pressed.needsRuntimeHost).toBe(true);
	expect(pressed.code).toMatch(/"kind": "active"/);
	expect(runtimeSource).toContain("attachActiveTracking");
	expect(runtimeSource).toContain("InputBegan");

	const focused = transform(
		`export const B = () => <textbox className="border focus:border-blue-600" />;`,
		null,
	);
	expect(focused.diagnostics).toEqual([]);
	expect(focused.code).toMatch(/"kind": "focus"/);
	expect(runtimeSource).toContain("attachFocusTracking");
	// Text boxes take keyboard focus; everything else reads selection focus.
	expect(runtimeSource).toContain("FocusLost");
	expect(runtimeSource).toContain("SelectionGained");
});

test("lowers the dark variant into a color scheme rule", () => {
	const result = transform(
		`export const A = () => <frame className="bg-white dark:bg-slate-900" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/"kind": "color-scheme"/);
	expect(result.code).toMatch(/"value": "dark"/);
	// Roblox exposes no color scheme, so the app owns it through an attribute.
	expect(runtimeSource).toContain("VelaColorScheme");
	expect(runtimeSource).toContain("GetAttributeChangedSignal");
});

test("resolves arbitrary length values", () => {
	const result = transform(
		`export const A = () => <frame className="w-[120px] h-[50%] p-[7px] rounded-[10px] top-[60%] left-[-8px] gap-[3px] border-[3px]" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(new UDim2\(0, 120, 0\.5, 0\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 7\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 10\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(new UDim2\(0, -8, 0\.6, 0\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 3\), \d+\)\}/,
	);
	expect(result.code).toMatch(/Thickness=\{__VelaRem\.scale\(3, \d+\)\}/);

	const typography = transform(
		`export const B = () => <textlabel className="text-[13px] leading-[1.6] rotate-[17deg] z-[15]" />;`,
		withoutPreflight,
	);
	expect(typography.diagnostics).toEqual([]);
	expect(typography.code).toMatch(
		/TextSize=\{__VelaRem\.scaleText\(13, \d+\)\}/,
	);
	expect(typography.code).toMatch(/LineHeight=\{1\.6\}/);
	expect(typography.code).toMatch(/Rotation=\{17\}/);
	expect(typography.code).toMatch(/ZIndex=\{15\}/);

	// A unit the family cannot read is still reported instead of guessed at.
	const invalid = transform(
		`export const C = () => <frame className="w-[3rem]" />;`,
		withoutPreflight,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-arbitrary-value" }),
	]);
});

test("resolves arbitrary hex colors", () => {
	const result = transform(
		`export const A = () => <frame className="bg-[#ff0000] border-[#0f0]" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/BackgroundColor3=\{Color3\.fromRGB\(255, 0, 0\)\}/,
	);
	expect(result.code).toMatch(/Color=\{Color3\.fromRGB\(0, 255, 0\)\}/);

	const invalid = transform(
		`export const B = () => <frame className="bg-[oops]" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-arbitrary-value" }),
	]);
});

test("applies color opacity modifiers as transparency", () => {
	const result = transform(
		`export const A = () => <frame className="bg-blue-600/50 ring-rose-500/25" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.5\}/);
	expect(result.code).toMatch(/Transparency=\{0\.75\}/);

	const border = transform(
		`export const B = () => <frame className="border-2 border-slate-500/25" />;`,
		null,
	);
	expect(border.diagnostics).toEqual([]);
	expect(border.code).toMatch(/Transparency=\{0\.75\}/);

	const gradient = transform(
		`export const C = () => <frame className="bg-gradient-to-r from-blue-600/50 to-rose-500" />;`,
		null,
	);
	expect(gradient.diagnostics).toEqual([]);
	expect(gradient.code).toContain("Transparency={new NumberSequence(0.5, 0)}");

	const divide = transform(
		`export const D = () => <frame className="divide-y divide-slate-500/10"><frame /><frame /></frame>;`,
		null,
	);
	expect(divide.diagnostics).toEqual([]);
	expect(divide.code).toMatch(/"transparency":\s*0\.9/);

	// A family with no transparency channel of its own still reports the modifier.
	const unsupported = transform(
		`export const E = () => <textbox className="placeholder-white/50" />;`,
		null,
	);
	expect(unsupported.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-opacity-modifier" }),
	]);

	const notAModifier = transform(
		`export const C = () => <frame className="bg-blue-600/300" />;`,
		null,
	);
	expect(notAModifier.diagnostics).toEqual([
		expect.objectContaining({ code: "unknown-theme-key" }),
	]);
});

test("preflight neutralizes the Roblox host defaults by default", () => {
	const result = transform(
		`export const A = () => <frame className="w-full" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{1\}/);
	expect(result.code).toMatch(/BorderSizePixel=\{0\}/);

	const painted = transform(
		`export const B = () => <frame className="bg-slate-700" />;`,
		null,
	);

	expect(emitted(painted.code)).not.toMatch(/BackgroundTransparency/);

	const off = transform(
		`export const C = () => <frame className="w-full" />;`,
		{
			configJson: JSON.stringify(defineConfig({ preflight: false })),
		},
	);

	expect(emitted(off.code)).not.toMatch(
		/BackgroundTransparency|BorderSizePixel/,
	);
});

test("preflight lets a runtime-resolved background reopen the neutralized base", () => {
	const result = transform(
		`export const A = ({ on }: { on: boolean }) => <frame className={on ? "bg-slate-700" : "w-full"} />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("withPreflightBackground");
	expect(result.code).toMatch(/"preflight":\s*true/);
});

const withPluginUtilities = {
	configJson: JSON.stringify(
		defineConfig({
			preflight: false,
			plugins: [
				plugin(({ addUtilities, theme }) => {
					addUtilities({
						btn: "bg-blue-600 rounded-lg px-4 hover:bg-blue-700",
						panel: {
							BackgroundColor3: theme("colors.slate.800"),
							BorderSizePixel: "0",
						},
						stack: "flex-col btn",
					});
				}),
			],
		}),
	),
};

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

test("imports the configured motion driver instead of tweening itself", () => {
	const result = transform(
		'<frame className="bg-slate-700 transition hover:bg-blue-600" />',
		{
			configJson: JSON.stringify(
				defineConfig({
					plugins: [
						plugin(({ setMotionDriver }) =>
							setMotionDriver({
								module: "@rbxts/vela-spring",
								export: "springDriver",
							}),
						),
					],
				}),
			),
		},
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain(
		'import { springDriver as __VelaMotionDriverSource } from "@rbxts/vela-spring";',
	);
	expect(result.code).toContain(", __VelaMotionDriverSource)");
	// The built-in path stays in the module: a driver that only implements one
	// method leaves the other to TweenService.
	expect(runtimeSource).toContain("__VelaTweenService.Create(instance, info");
});

test("a motion driver with no export name is imported as the default", () => {
	const result = transform('<frame className="animate-spin" />', {
		configJson: JSON.stringify(
			defineConfig({
				plugins: { motion: { module: "client/motion" }, utilities: {} },
			}),
		),
	});

	expect(result.code).toContain(
		'import __VelaMotionDriverSource from "client/motion";',
	);
});

test("falls back to the built-in driver when no plugin sets one", () => {
	const result = transform('<frame className="animate-spin" />');

	expect(result.code).toContain("createVelaRuntimeHost(");
	expect(result.code).not.toContain("__VelaMotionDriverSource");
});

// A statically lowered element never renders again, so an offset that has to
// follow the viewport leaves as a binding rather than as a value.
const staticRem = {
	configJson: JSON.stringify(
		defineConfig({ theme: { rem: { min: 16, max: 16 } } }),
	),
};

test("a static offset leaves as a rem binding with the namespace above it", () => {
	const result = transform('<frame className="w-4 p-2" />');

	expect(result.needsRuntimeHost).toBe(false);
	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 4)}",
	);
	expect(emitted(result.code)).toContain(
		"PaddingTop={__VelaRem.scale(new UDim(0, 8), 0)}",
	);
	expect(result.code).toMatch(
		/const __VelaRem = createVelaRemScaler\(\{[\s\S]*?"min": 8\.0/,
	);
	// Only the scaler, not the whole host.
	expect(result.code).not.toContain("createVelaRuntimeHost");
});

test("a pure scale value keeps its literal instead of paying for a binding", () => {
	const result = transform('<frame className="w-full h-1/2" />');

	expect(emitted(result.code)).toContain("Size={UDim2.fromScale(1, 0.5)}");
	expect(result.code).not.toContain("__VelaRem");
});

test("pinning rem takes the binding out of the emit entirely", () => {
	const result = transform('<frame className="w-4 p-2" />', staticRem);

	expect(emitted(result.code)).toContain("Size={UDim2.fromOffset(16, 0)}");
	expect(emitted(result.code)).toContain("PaddingTop={new UDim(0, 8)}");
	expect(result.code).not.toContain("__VelaRem");
});

// The host re-renders on a rem change of its own accord, so its props stay
// values and it is handed the names of the ones that are offsets.
test("a runtime host is named the props it should scale itself", () => {
	const result = transform('<frame className="w-4 p-2 hover:w-8" />');

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/__velaRem=\{\[\s*"Size"\s*\]\}/);
	expect(result.code).toContain("Size={(UDim2.fromOffset(16, 0) as never)}");
	// A helper is a host instance the runtime host never reads back, so it
	// takes the binding on this path too.
	expect(emitted(result.code)).toContain(
		"PaddingTop={(__VelaRem.scale(new UDim(0, 8), 0) as never)}",
	);
});

test("a rem config reaches the runtime host through the config it is handed", () => {
	const result = transform('<frame className="w-4 hover:w-8" />', {
		configJson: JSON.stringify(
			defineConfig({ theme: { rem: { min: 12, max: 32 } } }),
		),
	});

	expect(hostConfig(result.code).theme.rem).toEqual(
		expect.objectContaining({ min: 12, max: 32 }),
	);
});

// The runtime scales by `rem / base`, so a clamp pinned away from `base` is a
// constant ratio rather than no ratio. Dropping it from the emit would leave a
// static offset at 1 while everything the host resolves moved.
test("pinning rem away from base keeps the binding", () => {
	const result = transform('<frame className="w-4 p-2" />', {
		configJson: JSON.stringify(
			defineConfig({ theme: { rem: { min: 24, max: 24 } } }),
		),
	});

	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 4)}",
	);
	expect(result.code).toContain("createVelaRemScaler(");
});

// Roblox stops honoring TextSize past 100, so a scaled size stops there rather
// than tweening toward a size the engine never paints.
test("a scaled text size caps at the ceiling Roblox honors", () => {
	const result = transform('<textlabel className="text-6xl" />');

	expect(emitted(result.code)).toContain(
		"TextSize={__VelaRem.scaleText(60, 0)}",
	);

	// The host re-renders on a rem change itself, so it takes the size as a
	// value and caps it where the runtime does.
	const host = transform('<textlabel className="text-6xl hover:text-sm" />');

	expect(host.needsRuntimeHost).toBe(true);
	expect(host.code).toContain("TextSize={(60 as never)}");
});

test("an inverted rem clamp collapses onto min instead of reaching the runtime", () => {
	const result = transform('<frame className="w-4 hover:w-8" />', {
		configJson: JSON.stringify({
			theme: { rem: { min: 32, max: 16 } },
		}),
	});

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"min": 32\.0,\s*"max": 32\.0/);
});
