import defaultConfigSource from "./defaults.json" with { type: "json" };
import {
	emptyResolvedPlugins,
	type PluginsInput,
	type ResolvedPlugins,
	runPlugins,
} from "./plugin.js";

export {
	type MotionDriver,
	type PluginApi,
	type PluginHandler,
	type PluginPropMap,
	type PluginsInput,
	type PluginUtilities,
	type PluginUtilityValue,
	plugin,
	type ResolvedPlugins,
	type ThemeAccessor,
	type VelaPlugin,
} from "./plugin.js";

export const SHADES = [
	50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;
export type Shade = (typeof SHADES)[number];

export type ThemeScale = Record<string, string>;

/** Palette key a bare family name resolves to, mirroring Tailwind's `DEFAULT`. */
export const PALETTE_DEFAULT_KEY = "DEFAULT";
export type PaletteDefaultKey = typeof PALETTE_DEFAULT_KEY;

export type PaletteKey = Shade | PaletteDefaultKey;

export type ColorPalette = Partial<Record<PaletteKey, string>>;

export type ColorValue = string | ColorPalette;

export type ThemeColors = Record<string, ColorValue>;

export type ColorScaleInput = ColorValue;

export type ColorInputMap = Record<string, ColorScaleInput>;

export type RemResolution = {
	x: number;
	y: number;
};

/**
 * How an offset in a utility turns into pixels. `base` is what one rem is worth
 * at `baseResolution`; every other viewport scales that value and clamps it into
 * `[min, max]`. Setting all three to the same number pins offsets to pixels and
 * takes the scaling out of the emit entirely.
 *
 * `pinnedUnder` names the containers whose subtree keeps its literal pixels: a
 * `SurfaceGui` gets its pixel space from the part it is on rather than from the
 * viewport, so following the viewport there is wrong however the curve is tuned.
 */
export type RemConfig = {
	base: number;
	min: number;
	max: number;
	baseResolution: RemResolution;
	pinnedUnder: string[];
};

export type ThemeConfig = {
	colors: ThemeColors;
	radius: ThemeScale;
	spacing: ThemeScale;
	fontFamily: ThemeScale;
	rem: RemConfig;
};

/// Which UI library the project's JSX is compiled for. `jsxFactory` is a
/// program-wide setting, so this is a project-wide choice rather than a
/// per-file one.
export type Framework = "react" | "vide";

export type TailwindConfig = {
	preflight: boolean;
	framework: Framework;
	theme: ThemeConfig;
	plugins: ResolvedPlugins;
};

export type RemConfigInput = Partial<RemConfig>;

export type ThemeConfigInput = {
	colors?: ColorInputMap;
	radius?: ThemeScale;
	spacing?: ThemeScale;
	fontFamily?: ThemeScale;
	rem?: RemConfigInput;
	extend?: {
		colors?: ColorInputMap;
		radius?: ThemeScale;
		spacing?: ThemeScale;
		fontFamily?: ThemeScale;
		rem?: RemConfigInput;
	};
};

export type TailwindConfigInput = {
	preflight?: boolean;
	framework?: Framework;
	theme?: ThemeConfigInput;
	plugins?: PluginsInput;
};

const defaultConfigInput = defaultConfigSource satisfies TailwindConfigInput;

/** No viewport scales an offset away from its literal value. */
const staticRem: RemConfig = {
	base: 16,
	min: 16,
	max: 16,
	baseResolution: { x: 1920, y: 1020 },
	pinnedUnder: [],
};

const emptyConfig: TailwindConfig = {
	preflight: false,
	framework: "react",
	theme: {
		colors: {},
		radius: {},
		spacing: {},
		fontFamily: {},
		rem: staticRem,
	},
	plugins: emptyResolvedPlugins(),
};

export const defaultConfig: TailwindConfig = resolveConfig(
	defaultConfigInput,
	emptyConfig,
);

export function defineConfig(input: TailwindConfigInput = {}): TailwindConfig {
	return resolveConfig(input, defaultConfig);
}

function resolveConfig(
	input: TailwindConfigInput,
	base: TailwindConfig,
): TailwindConfig {
	const extend = input.theme?.extend;

	const theme: ThemeConfig = {
		colors: resolveThemeColors(
			base.theme.colors,
			extend?.colors,
			input.theme?.colors,
		),
		radius: resolveThemeScale(
			base.theme.radius,
			extend?.radius,
			input.theme?.radius,
		),
		spacing: resolveThemeScale(
			base.theme.spacing,
			extend?.spacing,
			input.theme?.spacing,
		),
		fontFamily: resolveThemeScale(
			base.theme.fontFamily,
			extend?.fontFamily,
			input.theme?.fontFamily,
		),
		rem: resolveRemConfig(base.theme.rem, extend?.rem, input.theme?.rem),
	};

	return {
		preflight: input.preflight ?? base.preflight,
		framework: input.framework ?? base.framework,
		theme,
		// Plugins run against the resolved theme so `theme()` reads the same
		// scale the utilities do.
		plugins: runPlugins(input.plugins, theme, base.plugins),
	};
}

export function resolveThemeColors(
	base: ThemeColors,
	extend: ColorInputMap | undefined,
	override: ColorInputMap | undefined,
): ThemeColors {
	// Tailwind-style rule for v0.1:
	// - `theme.colors` replaces the final family set.
	// - `theme.extend.colors` only augments the inherited defaults.
	if (override) {
		return normalizeColorRegistry(override);
	}

	return mergeColorRegistry(base, extend);
}

export function mergeColorRegistry(
	base: ThemeColors,
	extend: ColorInputMap | undefined,
): ThemeColors {
	const merged: ThemeColors = { ...base };

	if (!extend) {
		return merged;
	}

	for (const [name, value] of Object.entries(extend)) {
		const baseColor = merged[name];
		if (!baseColor) {
			merged[name] = normalizeColorScale(value);
			continue;
		}

		merged[name] = mergeColorValues(baseColor, value);
	}

	return merged;
}

export function normalizeColorRegistry(
	colors: ColorInputMap | undefined,
): ThemeColors {
	const normalized: ThemeColors = {};

	if (!colors) {
		return normalized;
	}

	for (const [name, value] of Object.entries(colors)) {
		normalized[name] = normalizeColorScale(value);
	}

	return normalized;
}

export function normalizeColorScale(value: ColorScaleInput): ColorValue {
	if (typeof value === "string") {
		return value;
	}

	if (Object.keys(value).length === 0) {
		throw new Error(
			"Color palette normalization requires at least one shade value.",
		);
	}

	return { ...value };
}

function mergeColorValues(
	base: ColorValue,
	value: ColorScaleInput,
): ColorValue {
	if (typeof base === "string" || typeof value === "string") {
		return normalizeColorScale(value);
	}

	return {
		...base,
		...value,
	};
}

/**
 * `rem` is a record of related fields rather than a keyed scale, so a partial
 * override merges field by field instead of replacing the family. `pinnedUnder`
 * is the one list among them, and a list that merged would have no way to say
 * "none": it replaces.
 */
export function resolveRemConfig(
	base: RemConfig,
	extend: RemConfigInput | undefined,
	override: RemConfigInput | undefined,
): RemConfig {
	const merged = { ...base, ...extend, ...override };

	return {
		...merged,
		// The JSX tag is what the compiler matches, and roblox-ts spells one in
		// lowercase; a config naming `SurfaceGui` means the same container.
		pinnedUnder: merged.pinnedUnder.map((tag) => tag.toLowerCase()),
		// Luau's `math.clamp` errors when the bounds cross, and this config
		// reaches the runtime verbatim, so an inverted clamp collapses onto
		// `min` here rather than at the first viewport read.
		max: Math.max(merged.min, merged.max),
		baseResolution: {
			...base.baseResolution,
			...extend?.baseResolution,
			...override?.baseResolution,
		},
	};
}

function resolveThemeScale(
	base: ThemeScale,
	extend: ThemeScale | undefined,
	override: ThemeScale | undefined,
): ThemeScale {
	// Tailwind-style rule for v0.1:
	// - `theme.extend.*` augments the built-in defaults.
	// - top-level `theme.*` replaces the final scale for that family.
	const mergedDefaults = {
		...base,
		...extend,
	};

	return override ?? mergedDefaults;
}
