import { expect, test } from "vitest";

import defaultsInput from "../src/defaults.json" with { type: "json" };
import {
	defaultConfig,
	defineConfig,
	plugin,
	resolveThemeColors,
} from "../src/index";

function expectPalette(value: unknown, entries: Record<string, string>) {
	expect(value).toEqual(entries);
}

test("keeps defaults authoring-shaped and uses a Tailwind-style palette", () => {
	expect(defaultsInput.theme.colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(248, 250, 252)",
			500: "Color3.fromRGB(98, 116, 142)",
			950: "Color3.fromRGB(2, 6, 24)",
		}),
	);
	expect(defaultConfig.theme.colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(248, 250, 252)",
			500: "Color3.fromRGB(98, 116, 142)",
			950: "Color3.fromRGB(2, 6, 24)",
		}),
	);
	expect(defaultConfig.theme.colors.surface).toBeUndefined();
});

test("preserves single literal color input as a singleton", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: "Color3.fromRGB(1, 2, 3)",
			},
		},
	});

	expect(Object.keys(config.theme.colors)).toEqual(["brand"]);
	expect(config.theme.colors.brand).toBe("Color3.fromRGB(1, 2, 3)");
});

test("preserves explicit shade input as a palette", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: {
					700: "Color3.fromRGB(7, 8, 9)",
				},
			},
		},
	});

	expectPalette(config.theme.colors.brand, {
		700: "Color3.fromRGB(7, 8, 9)",
	});
});

test("extend colors merge into existing families at shade depth", () => {
	const colors = resolveThemeColors(
		{
			slate: {
				50: "Color3.fromRGB(1, 1, 1)",
				100: "Color3.fromRGB(2, 2, 2)",
				200: "Color3.fromRGB(2, 2, 2)",
				300: "Color3.fromRGB(2, 2, 2)",
				400: "Color3.fromRGB(2, 2, 2)",
				500: "Color3.fromRGB(2, 2, 2)",
				600: "Color3.fromRGB(2, 2, 2)",
				700: "Color3.fromRGB(3, 3, 3)",
				800: "Color3.fromRGB(2, 2, 2)",
				900: "Color3.fromRGB(2, 2, 2)",
				950: "Color3.fromRGB(2, 2, 2)",
			},
		},
		{
			slate: {
				500: "Color3.fromRGB(9, 9, 9)",
			},
		},
		undefined,
	);

	expect(colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(1, 1, 1)",
			500: "Color3.fromRGB(9, 9, 9)",
			700: "Color3.fromRGB(3, 3, 3)",
		}),
	);
});

test("extend colors preserve singleton inputs and shade palettes", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					surface: "Color3.fromRGB(7, 7, 7)",
					slate: {
						700: "Color3.fromRGB(7, 7, 7)",
					},
				},
			},
		},
	});

	expect(config.theme.colors.surface).toBe("Color3.fromRGB(7, 7, 7)");
	expect(config.theme.colors.slate).toEqual(
		expect.objectContaining({
			700: "Color3.fromRGB(7, 7, 7)",
		}),
	);
});

test("top-level colors replace the final family set", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: "Color3.fromRGB(1, 2, 3)",
			},
			extend: {
				colors: {
					accent: "Color3.fromRGB(4, 5, 6)",
				},
			},
		},
	});

	expect(Object.keys(config.theme.colors)).toEqual(["brand"]);
	expect(config.theme.colors.brand).toBe("Color3.fromRGB(1, 2, 3)");
});

test("plugins register utilities against the resolved theme", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: { brand: "Color3.fromRGB(1, 2, 3)" },
			},
		},
		plugins: [
			plugin(({ addUtilities, theme }) => {
				addUtilities({
					".btn": "bg-brand rounded-lg px-4",
					panel: { BackgroundColor3: theme("colors.brand") },
				});
			}),
		],
	});

	expect(config.plugins.utilities).toEqual({
		btn: "bg-brand rounded-lg px-4",
		panel: { BackgroundColor3: "Color3.fromRGB(1, 2, 3)" },
	});
});

test("a later plugin overrides an earlier utility of the same name", () => {
	const config = defineConfig({
		plugins: [
			plugin(({ addUtilities }) => addUtilities({ btn: "px-2" })),
			plugin(({ addUtilities }) => addUtilities({ btn: "px-4" })),
		],
	});

	expect(config.plugins.utilities.btn).toBe("px-4");
});

test("rejects utility names and values a class token cannot carry", () => {
	const register = (utilities: Record<string, unknown>) =>
		defineConfig({
			plugins: [
				plugin(({ addUtilities }) =>
					addUtilities(utilities as Record<string, string>),
				),
			],
		});

	expect(() => register({ "hover:btn": "px-4" })).toThrow(/not a usable class/);
	expect(() => register({ btn: "  " })).toThrow(/empty class list/);
	expect(() => register({ btn: { "Background Color3": "x" } })).toThrow(
		/not a Roblox property name/,
	);
	expect(() => register({ btn: { BackgroundColor3: 3 } })).toThrow(
		/non-string value/,
	);
});

test("theme() reports a key the theme does not hold", () => {
	expect(() =>
		defineConfig({
			plugins: [
				plugin(({ addUtilities, theme }) =>
					addUtilities({ btn: { BackgroundColor3: theme("colors.nope") } }),
				),
			],
		}),
	).toThrow(/not a key of the resolved theme/);

	const config = defineConfig({
		plugins: [
			plugin(({ addUtilities, theme }) =>
				addUtilities({
					btn: {
						BackgroundColor3: theme("colors.nope", "Color3.fromRGB(0, 0, 0)"),
						TextColor3: theme("colors.slate.500"),
					},
				}),
			),
		],
	});

	expect(config.plugins.utilities.btn).toEqual({
		BackgroundColor3: "Color3.fromRGB(0, 0, 0)",
		TextColor3: "Color3.fromRGB(98, 116, 142)",
	});
});

test("a JSON config states its plugin utilities already resolved", () => {
	const config = defineConfig({
		plugins: { utilities: { btn: "px-4" } },
	});

	expect(config.plugins.utilities).toEqual({ btn: "px-4" });
});

test("a plugin can replace the motion driver", () => {
	const config = defineConfig({
		plugins: [
			plugin(({ setMotionDriver }) =>
				setMotionDriver({
					module: "@rbxts/vela-spring",
					export: "springDriver",
				}),
			),
		],
	});

	expect(config.plugins.motion).toEqual({
		module: "@rbxts/vela-spring",
		export: "springDriver",
	});
});

test("the motion driver module has to resolve from every module", () => {
	const setDriver = (driver: { module: string; export?: string }) =>
		defineConfig({
			plugins: [plugin(({ setMotionDriver }) => setMotionDriver(driver))],
		});

	expect(() => setDriver({ module: "./motion" })).toThrow(
		/relative path cannot resolve/,
	);
	expect(() => setDriver({ module: "  " })).toThrow(/no module/);
	expect(() => setDriver({ module: "m", export: "not an identifier" })).toThrow(
		/not an identifier/,
	);
	expect(setDriver({ module: "m" }).plugins.motion).toEqual({ module: "m" });
});

test("a partial rem override merges field by field", () => {
	const config = defineConfig({
		theme: {
			rem: { min: 12, baseResolution: { y: 1080 } },
		},
	});

	expect(config.theme.rem).toEqual({
		base: 16,
		min: 12,
		max: 64,
		baseResolution: { x: 1920, y: 1080 },
	});
});

test("pinning min to max takes the scaling out of every offset", () => {
	const config = defineConfig({
		theme: {
			extend: { rem: { min: 16, max: 16 } },
		},
	});

	expect(config.theme.rem.min).toBe(config.theme.rem.max);
	expect(config.theme.rem.base).toBe(16);
});

test("an inverted rem clamp collapses onto min", () => {
	const config = defineConfig({
		theme: { rem: { min: 32, max: 16 } },
	});

	expect(config.theme.rem.min).toBe(32);
	expect(config.theme.rem.max).toBe(32);
});
