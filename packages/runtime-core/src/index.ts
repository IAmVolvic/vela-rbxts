import {
	Players as __VelaPlayers,
	TweenService as __VelaTweenService,
	UserInputService as __VelaUserInputService,
	Workspace as __VelaWorkspace,
} from "@rbxts/services";
import __VelaConfigDefaults from "./config-defaults.json";

export type ClassDictionary = Record<string, boolean | null | undefined>;
export type ClassValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| ClassDictionary
	| ClassValue[];

export type RuntimeRemConfig = {
	base: number;
	min: number;
	max: number;
	baseResolution: {
		x: number;
		y: number;
	};
};

/// The theme tables arrive as the difference from the defaults this package
/// carries, keyed at the top level — a color family, a radius step. Most
/// projects change none of them and hand over four empty tables. A table listed
/// in `replaced` dropped entries the defaults had, so it is used as given
/// instead of merged.
export type VelaRuntimeConfig = {
	preflight: boolean;
	theme: {
		colors: Record<string, string | Record<string, string>>;
		radius: Record<string, string>;
		spacing: Record<string, string>;
		fontFamily: Record<string, string>;
		rem?: RuntimeRemConfig;
		replaced?: string[];
	};
	plugins?: {
		utilities?: Record<string, string | Record<string, string>>;
	};
};

export type SupportedHostElements = {
	frame: Frame;
	scrollingframe: ScrollingFrame;
	canvasgroup: CanvasGroup;
	textlabel: TextLabel;
	textbutton: TextButton;
	textbox: TextBox;
	imagelabel: ImageLabel;
	imagebutton: ImageButton;
};

export type SupportedHostElementTag = keyof SupportedHostElements;

export type VelaRuntimeTag =
	| SupportedHostElementTag
	| ((props: never) => unknown);

export namespace __VelaDefaults {
	export const PALETTE_DEFAULT_KEY = "DEFAULT";
	export const DEFAULT_FONT_FAMILY =
		"rbxasset://fonts/families/SourceSansPro.json";
}

/// One rem is what an offset in a utility is worth, and it follows the viewport
/// so the same class reads at the same visual weight on a phone and on a 4K
/// monitor. The curve is Littensy's rem provider: the diagonal against a base
/// resolution, an aspect cap so an ultrawide does not inflate the scale, and a
/// gentler falloff in portrait.
export namespace __VelaRem {
	const MAX_ASPECT_RATIO = 19 / 9;

	/// Where a portrait viewport's factor starts, instead of falling to zero
	/// with its diagonal.
	const PORTRAIT_FLOOR = 0.25;

	const DEFAULT_CONFIG: RuntimeRemConfig = {
		base: 16,
		min: 16,
		max: 16,
		baseResolution: { x: 1920, y: 1020 },
	};

	let config = DEFAULT_CONFIG;
	const configured: Array<() => void> = [];

	/// A host runtime puts its own reactive layer over this curve — a binding
	/// under React, a source under Vide — and only it knows how to push the new
	/// value out when a config arrives after that layer is already live. More
	/// than one thing can be reading the curve, so they all hear about it.
	export function whenConfigured(listener: () => void) {
		configured.push(listener);
	}

	export function configure(resolved: RuntimeRemConfig | undefined) {
		if (resolved === undefined) {
			return;
		}

		config = resolved;
		for (const listener of configured) {
			listener();
		}
	}

	export function resolve(camera: RuntimeCamera | undefined): number {
		const viewport = camera?.ViewportSize;
		const width = viewport?.X ?? 0;
		const height = viewport?.Y ?? 0;

		// ViewportSize stays 1x1 until the first frame renders, and clamping that
		// to the minimum would paint one frame at the wrong scale.
		if (width <= 1 || height <= 1) {
			return math.clamp(config.base, config.min, config.max);
		}

		const boundedWidth = math.min(width, height * MAX_ASPECT_RATIO);
		const diagonal = math.sqrt(boundedWidth * boundedWidth + height * height);
		const baseDiagonal = math.sqrt(
			config.baseResolution.x * config.baseResolution.x +
				config.baseResolution.y * config.baseResolution.y,
		);
		const scale = baseDiagonal > 0 ? diagonal / baseDiagonal : 1;
		const landscape = boundedWidth > height || scale >= 1;
		const factor = landscape
			? scale
			: PORTRAIT_FLOOR + scale * (1 - PORTRAIT_FLOOR);

		return math.clamp(math.round(config.base * factor), config.min, config.max);
	}

	/// What a literal offset in the emit multiplies by. 1 at the base
	/// resolution, so a project that never resizes gets its numbers back.
	export function ratio(rem: number): number {
		return config.base > 0 ? rem / config.base : 1;
	}

	/// What a `[2rem]` payload is worth before the viewport has its say, which
	/// is the same base the compiler resolves such a payload against.
	export function pixels(rem: number): number {
		return rem * config.base;
	}

	/// Roblox stops honoring `TextSize` past 100 and does it silently, so a
	/// scaled size stops there too. Left uncapped, a transition would tween
	/// toward a size the engine never paints and stall part-way.
	export const TEXT_SIZE_CEILING = 100;

	/// Props whose numbers are pixel offsets. Everything else a utility writes is
	/// a scale, a color, an alignment or an order, and rem must leave those
	/// alone — `UIGradient.Offset` is normalized, `UIScale.Scale` is a multiplier.
	const SCALED_PROPS: Record<string, true> = {
		BlurRadius: true,
		CellPadding: true,
		CellSize: true,
		CornerRadius: true,
		GapOffset: true,
		GridCrossExtent: true,
		MaxHeight: true,
		MaxSize: true,
		MaxWidth: true,
		MinHeight: true,
		MinSize: true,
		MinWidth: true,
		Padding: true,
		PaddingBottom: true,
		PaddingLeft: true,
		PaddingRight: true,
		PaddingTop: true,
		Position: true,
		PositionX: true,
		PositionY: true,
		ScrollBarThickness: true,
		Size: true,
		SizeX: true,
		SizeY: true,
		Spread: true,
		TextSize: true,
		Thickness: true,
		TranslateX: true,
		TranslateY: true,
	};

	export function scalesProp(name: string): boolean {
		return SCALED_PROPS[name] === true;
	}

	export function scalesHelperProp(tag: string, name: string): boolean {
		return scalesProp(name) || (tag === "uishadow" && name === "Offset");
	}

	export function apply(
		value: RuntimePropValue,
		remRatio: number,
	): RuntimePropValue {
		if (remRatio === 1) {
			return value;
		}

		if (typeIs(value, "number")) {
			return value * remRatio;
		}

		if (typeIs(value, "UDim")) {
			return new UDim(value.Scale, value.Offset * remRatio);
		}

		if (typeIs(value, "UDim2")) {
			return new UDim2(
				value.X.Scale,
				value.X.Offset * remRatio,
				value.Y.Scale,
				value.Y.Offset * remRatio,
			);
		}

		if (typeIs(value, "Vector2")) {
			return new Vector2(value.X * remRatio, value.Y * remRatio);
		}

		return value;
	}
}

export namespace __VelaOpacity {
	/// Mirrors `opacity_transparency_props`: every channel an instance paints
	/// itself. A CanvasGroup composites its whole subtree, so `GroupTransparency`
	/// is the one property that already means what CSS `opacity` means. A helper
	/// is not a host — only the two that draw ink carry a transparency, and a
	/// background written onto the rest would throw.
	export function transparencyProps(tag: string | undefined): string[] {
		if (tag === "canvasgroup") {
			return ["GroupTransparency"];
		}

		if (tag === "textlabel" || tag === "textbutton" || tag === "textbox") {
			return ["BackgroundTransparency", "TextTransparency"];
		}

		if (tag === "imagelabel" || tag === "imagebutton") {
			return ["BackgroundTransparency", "ImageTransparency"];
		}

		if (tag === "uistroke" || tag === "uishadow") {
			return ["Transparency"];
		}

		// A component element hides its tag, and the static path takes the same
		// branch: the background is the one channel every host paints.
		if (tag === undefined || tag === "frame" || tag === "scrollingframe") {
			return ["BackgroundTransparency"];
		}

		return [];
	}

	export function compose(transparency: number, alpha: number): number {
		return 1 - (1 - transparency) * alpha;
	}
}

export type RuntimeRulePropEntry = {
	name: string;
	value: string;
};

export type RuntimeRuleHelperEntry = {
	tag: string;
	props: RuntimeRulePropEntry[];
};

export type RuntimeEffectBundle = {
	props: RuntimeRulePropEntry[];
	helpers: RuntimeRuleHelperEntry[];
};

export type RuntimeResolvedPropEntry = {
	name: string;
	value: RuntimePropValue;
};

export type RuntimeResolvedHelperEntry = {
	tag: string;
	props: RuntimeResolvedPropEntry[];
};

export type RuntimeResolvedEffectBundle = {
	props: RuntimeResolvedPropEntry[];
	helpers: RuntimeResolvedHelperEntry[];
};

export type RuntimeCondition =
	| {
			kind: "all";
			conditions: RuntimeCondition[];
	  }
	| {
			kind: "width";
			alias: "sm" | "md" | "lg";
			minWidth: number;
			maxWidth?: number;
	  }
	| {
			kind: "orientation";
			value: "portrait" | "landscape";
	  }
	| {
			kind: "input";
			value: "touch" | "mouse" | "gamepad";
	  }
	| {
			kind: "color-scheme";
			value: "light" | "dark";
	  }
	| {
			kind: "hover";
	  }
	| {
			kind: "active";
	  }
	| {
			kind: "focus";
	  }
	/// A branch of a class value the transformer read but could not decide. The
	/// tokens were resolved there; only which of them apply is settled here.
	| {
			kind: "test";
			index: number;
			expected: boolean;
	  };

export type RuntimeRule = {
	condition: RuntimeCondition;
	effects: RuntimeEffectBundle;
};

export type RuntimeTheme = {
	colors: Record<string, RuntimeColorEntry>;
	radius: Record<string, UDim>;
	spacing: Record<string, UDim>;
	fontFamily: Record<string, string>;
	pluginUtilities: Record<string, RuntimePluginUtility>;
};

export type RuntimePluginUtility = string | Record<string, string>;

export type RuntimeColorEntry = string | RuntimeColorScale;

export type RuntimeColorScale = Record<string, Color3>;

export type RuntimeSizeAxisValue = {
	scale: number;
	offset: number;
};

export type RuntimeEnvironment = {
	width: number;
	rem: number;
	orientation: "portrait" | "landscape";
	input: "touch" | "mouse" | "gamepad";
	colorScheme: "light" | "dark";
	hovered: boolean;
	pressed: boolean;
	focused: boolean;
	/// What the element's own `__velaTests` came to this render, which only the
	/// host that was handed them can answer.
	tests?: readonly boolean[];
};

export type RuntimeCamera = {
	ViewportSize?: {
		X: number;
		Y: number;
	};
	GetPropertyChangedSignal(property: "ViewportSize"): RBXScriptSignal;
};

export type RuntimePropValue =
	| string
	| number
	| boolean
	| Color3
	| ColorSequence
	| NumberSequence
	| Font
	| UDim
	| UDim2
	| Vector2
	| EnumItem;

export type RuntimePropMap = Record<string, RuntimePropValue>;

export type RuntimeHelperProp = {
	name: string;
	value: RuntimePropValue;
};

export type VariantEventBinding = {
	name: string;
	handler: (...args: unknown[]) => void;
};

export type RuntimeHelper = {
	tag: string;
	props: RuntimeHelperProp[];
};

export type RuntimeTransition = {
	time: number;
	style: string;
	direction: string;
	delay: number;
	property: string;
};

export type RuntimeTransitionState = {
	enabled?: boolean;
	time?: number;
	style?: string;
	direction?: string;
	delay?: number;
	property?: string;
};

/** What a transition asks the motion driver to move the instance through. */
export type VelaMotionSpec = RuntimeTransition;

/**
 * The seam `plugins.motion` replaces. A driver takes over the method it
 * implements and leaves the rest to the built-in TweenService one, so a driver
 * that only springs transitions keeps the stock `animate-*` presets.
 *
 * `transition` receives only the properties that changed, and owns writing
 * them: with a transition in play the element holds its rendered value, so a
 * driver that never assigns leaves the instance where it was.
 * `animate` returns its own cleanup, called when the animation is taken away.
 */
/// Method signatures, not function properties: roblox-ts gives an object
/// literal's method an implicit `self`, so a driver written the documented way
/// only lines up when the runtime calls it as a method too. Stated as
/// properties instead, roblox-ts accepts the same driver and then shifts every
/// argument by one at the call.
export type VelaMotionDriver = {
	transition?(
		instance: Instance,
		goal: Record<string, RuntimePropValue>,
		spec: VelaMotionSpec,
	): void;
	animate?(instance: Instance, animation: string): (() => void) | undefined;
};

export type RuntimeTextSpec = {
	transform?: string;
	decoration?: string;
};

export type RuntimeDivide = {
	axis: string;
	thickness: number;
	color?: string;
	transparency?: number;
};

export type RuntimeDivideState = {
	axis?: string;
	thickness?: number;
	color?: string;
	transparency?: number;
};

export type RuntimeMargin = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

export type RuntimeMarginState = {
	top?: number;
	right?: number;
	bottom?: number;
	left?: number;
};

export type RuntimeResolution = {
	props: RuntimePropMap;
	helpers: RuntimeHelper[];
	/// What an `opacity-*` resolved to on a component element, where there is no
	/// tag to name a transparency channel against.
	opacityAlpha?: number;
	transition?: RuntimeTransitionState;
	animation?: string;
	textTransform?: string;
	textDecoration?: string;
	margin?: RuntimeMarginState;
	divide?: RuntimeDivideState;
	sizeWidth?: UDim;
	sizeHeight?: UDim;
	autoWidth?: boolean;
	autoHeight?: boolean;
	positionX?: UDim;
	positionY?: UDim;
	translateX?: UDim;
	translateY?: UDim;
	centerX?: boolean;
	centerY?: boolean;
	marginShiftX?: number;
	marginShiftY?: number;
	minWidth?: number;
	minHeight?: number;
	maxWidth?: number;
	maxHeight?: number;
	fontFamily?: string;
	fontWeight?: Enum.FontWeight;
	fontStyle?: Enum.FontStyle;
	gapOffset?: number;
	gridCells?: number;
	gridCellsHorizontal?: boolean;
	gridCrossExtent?: number;
	gradientRotation?: number;
	gradientFrom?: Color3;
	gradientVia?: Color3;
	gradientTo?: Color3;
	gradientFromTransparency?: number;
	gradientViaTransparency?: number;
	gradientToTransparency?: number;
	usesHover?: boolean;
	usesActive?: boolean;
	usesFocus?: boolean;
	/// What a pixel offset resolved at runtime multiplies by, applied as each
	/// value lands rather than at the end so composition never sees a raw offset.
	remRatio?: number;
};

export namespace __VelaDivide {
	export function divideState(
		resolution: RuntimeResolution,
	): RuntimeDivideState {
		let state = resolution.divide;
		if (state === undefined) {
			state = {};
			resolution.divide = state;
		}
		return state;
	}

	/// Consumes `divide-*` tokens from dynamic class values.
	export function applyDivideToken(
		theme: RuntimeTheme,
		token: string,
		resolution: RuntimeResolution,
	): boolean {
		if (token === "divide-x" || token === "divide-y") {
			const state = divideState(resolution);
			state.axis = token === "divide-x" ? "x" : "y";
			if (state.thickness === undefined) {
				state.thickness = 1;
			}
			return true;
		}

		for (const prefix of ["divide-x-", "divide-y-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}
			const thickness = tonumber(
				__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
			);
			if (thickness !== undefined) {
				const state = divideState(resolution);
				state.axis = prefix === "divide-x-" ? "x" : "y";
				state.thickness = thickness;
			}
			return true;
		}

		if (__VelaLua.startsWith(token, "divide-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("divide-"));
			const [base, opacity] = __VelaColor.splitColorOpacity(key);
			const color = resolveDivideColor(theme, base);
			if (color !== undefined) {
				const state = divideState(resolution);
				state.color = color;
				if (opacity !== undefined) {
					state.transparency = __VelaColor.opacityToTransparency(opacity);
				}
			}
			return true;
		}

		return false;
	}

	/// The divide config travels as an expression string, because the compile-time
	/// half of it arrives that way on `__velaDivide`.
	export function resolveDivideColor(
		theme: RuntimeTheme,
		key: string,
	): string | undefined {
		const color = __VelaColor.resolveThemeColor(theme, key)?.color;
		if (color === undefined) {
			return undefined;
		}

		return `Color3.fromRGB(${math.floor(color.R * 255 + 0.5)}, ${math.floor(color.G * 255 + 0.5)}, ${math.floor(color.B * 255 + 0.5)})`;
	}

	export function resolveDivideConfig(
		base: RuntimeDivide | undefined,
		dynamic: RuntimeDivideState | undefined,
		remRatio: number,
	): RuntimeDivide | undefined {
		const axis = dynamic?.axis ?? base?.axis;
		if (axis === undefined) {
			return undefined;
		}

		return {
			axis,
			thickness: (dynamic?.thickness ?? base?.thickness ?? 1) * remRatio,
			color: dynamic?.color ?? base?.color,
			transparency: dynamic?.transparency ?? base?.transparency,
		};
	}

	/// Interleaves a separator frame between consecutive children. Separators rely
	/// on hierarchy order, so lists that assign explicit LayoutOrder will scatter
	/// them.
}

export namespace __VelaMargin {
	export function marginState(
		resolution: RuntimeResolution,
	): RuntimeMarginState {
		let state = resolution.margin;
		if (state === undefined) {
			state = {};
			resolution.margin = state;
		}
		return state;
	}

	/// Consumes the `m-*` family from dynamic class values. `mx-auto`/`my-auto`
	/// center instead of spacing, and a negative margin shifts `Position` because
	/// `UIPadding` cannot go below zero — only the two sides that can pull the
	/// element itself have a meaning, exactly as on the static path.
	export function applyMarginToken(
		theme: RuntimeTheme,
		token: string,
		resolution: RuntimeResolution,
	): boolean {
		const prefixes: Array<
			[string, Array<"top" | "right" | "bottom" | "left">]
		> = [
			["mx-", ["left", "right"]],
			["my-", ["top", "bottom"]],
			["mt-", ["top"]],
			["mr-", ["right"]],
			["mb-", ["bottom"]],
			["ml-", ["left"]],
			["m-", ["top", "right", "bottom", "left"]],
		];

		for (const [prefix, sides] of prefixes) {
			const negative = __VelaLua.startsWith(token, `-${prefix}`);
			if (!negative && !__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const key = __VelaLua.substring(
				token,
				__VelaLua.stringLength(prefix) + (negative ? 1 : 0),
			);
			if (key === "auto") {
				if (!negative && prefix === "mx-") {
					resolution.centerX = true;
					resolution.positionX = new UDim(0.5, 0);
				} else if (!negative && prefix === "my-") {
					resolution.centerY = true;
					resolution.positionY = new UDim(0.5, 0);
				}
				return true;
			}

			const value = __VelaValue.resolveSpacingValue(theme, key);
			if (value === undefined || value.Scale !== 0) {
				return true;
			}

			if (negative) {
				if (prefix === "mt-") {
					resolution.marginShiftY =
						(resolution.marginShiftY ?? 0) - value.Offset;
				} else if (prefix === "ml-") {
					resolution.marginShiftX =
						(resolution.marginShiftX ?? 0) - value.Offset;
				}
				return true;
			}

			const state = marginState(resolution);
			for (const side of sides) {
				state[side] = value.Offset;
			}
			return true;
		}

		return false;
	}

	/// Neither source has met rem yet — the static spec came straight from the
	/// emit, and a margin token writes its offset to the resolution rather than
	/// through the prop path — so the merged result is scaled once, here.
	export function resolveMarginConfig(
		base: RuntimeMargin | undefined,
		dynamic: RuntimeMarginState | undefined,
		remRatio: number,
	): RuntimeMargin | undefined {
		const margin: RuntimeMargin = {
			top: (dynamic?.top ?? base?.top ?? 0) * remRatio,
			right: (dynamic?.right ?? base?.right ?? 0) * remRatio,
			bottom: (dynamic?.bottom ?? base?.bottom ?? 0) * remRatio,
			left: (dynamic?.left ?? base?.left ?? 0) * remRatio,
		};

		if (
			margin.top === 0 &&
			margin.right === 0 &&
			margin.bottom === 0 &&
			margin.left === 0
		) {
			return undefined;
		}

		return margin;
	}

	export const MARGIN_WRAPPER_PROPS = [
		"Size",
		"Position",
		"AnchorPoint",
		"LayoutOrder",
		"ZIndex",
		"Visible",
	] as const;

	export function isMarginWrapperProp(name: string): boolean {
		for (const wrapperProp of MARGIN_WRAPPER_PROPS) {
			if (name === wrapperProp) {
				return true;
			}
		}
		return false;
	}

	/// Moves the layout props onto the CSS margin box (the wrapper) and resizes
	/// the inner element to fill it. Mutates `hostProps`, so this must run before
	/// the inner element is created.
	export function prepareMarginWrapper(
		margin: RuntimeMargin,
		hostProps: Record<string, unknown>,
	): Record<string, unknown> {
		const wrapperProps: Record<string, unknown> = {
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
		};

		for (const wrapperProp of MARGIN_WRAPPER_PROPS) {
			const value = hostProps[wrapperProp];
			if (value !== undefined) {
				wrapperProps[wrapperProp] = value;
				hostProps[wrapperProp] = undefined;
			}
		}

		const declaredSize = wrapperProps.Size;
		const automaticSize = hostProps.AutomaticSize;
		if (typeIs(declaredSize, "UDim2")) {
			wrapperProps.Size = new UDim2(
				declaredSize.X.Scale,
				declaredSize.X.Offset + margin.left + margin.right,
				declaredSize.Y.Scale,
				declaredSize.Y.Offset + margin.top + margin.bottom,
			);
			hostProps.Size = UDim2.fromScale(1, 1);
		} else if (automaticSize !== undefined) {
			// Content-sized element: the wrapper grows with it, padding included.
			wrapperProps.AutomaticSize = automaticSize;
		} else {
			wrapperProps.AutomaticSize = Enum.AutomaticSize.XY;
		}

		return wrapperProps;
	}

	/// Renders the margin box: a transparent wrapper padded by the margins, with
	/// the real element filling the remaining space.
}

export namespace __VelaText {
	export function escapeRichText(value: string): string {
		const [amp] = value.gsub("&", "&amp;");
		const [lt] = amp.gsub("<", "&lt;");
		const [gt] = lt.gsub(">", "&gt;");
		return gt;
	}

	export function capitalizeAsciiWords(value: string): string {
		const [result] = value.gsub("%f[%a]%a", (letter) => letter.upper());
		return result;
	}

	/// Transforms `Text` per the merged compile-time and dynamic config. A
	/// consumer-managed `RichText` prop opts the element out of decorations, which
	/// would otherwise double-escape its markup.
	export function applyTextConfig(
		hostProps: Record<string, unknown>,
		base: RuntimeTextSpec | undefined,
		resolution: RuntimeResolution,
	) {
		const transformValue = resolution.textTransform ?? base?.transform;
		const decorationValue = resolution.textDecoration ?? base?.decoration;
		const transform = transformValue === "none" ? undefined : transformValue;
		const decoration = decorationValue === "none" ? undefined : decorationValue;
		if (transform === undefined && decoration === undefined) {
			return;
		}

		const text = hostProps.Text;
		if (!typeIs(text, "string")) {
			return;
		}

		let result = text;
		if (transform === "upper") {
			result = result.upper();
		} else if (transform === "lower") {
			result = result.lower();
		} else if (transform === "capitalize") {
			result = capitalizeAsciiWords(result);
		}

		if (decoration !== undefined && hostProps.RichText === undefined) {
			hostProps.RichText = true;
			if (decoration === "underline") {
				result = `<u>${escapeRichText(result)}</u>`;
			} else if (decoration === "strike") {
				result = `<s>${escapeRichText(result)}</s>`;
			}
		}

		hostProps.Text = result;
	}

	export function assignForwardedRef(
		ref: unknown,
		value: Instance | undefined,
	) {
		if (typeIs(ref, "function")) {
			(ref as (instance: Instance | undefined) => void)(value);
		} else if (typeIs(ref, "table")) {
			(ref as { current?: Instance }).current = value;
		}
	}
}

export namespace __VelaEnv {
	export function readRuntimeEnvironment(
		camera: RuntimeCamera | undefined,
	): RuntimeEnvironment {
		const viewportSize = camera?.ViewportSize;
		const width = viewportSize?.X ?? 0;
		const height = viewportSize?.Y ?? 0;

		return {
			width,
			rem: __VelaRem.resolve(camera),
			orientation: width >= height ? "landscape" : "portrait",
			input: detectInputMode(),
			colorScheme: readColorScheme(),
			hovered: false,
			pressed: false,
			focused: false,
		};
	}

	/// Roblox exposes no color scheme to a running game, so the app owns the
	/// choice: `dark:` reads this attribute off the local player, which the server
	/// can also set per player.
	export const VELA_COLOR_SCHEME_ATTRIBUTE = "VelaColorScheme";

	export function readColorScheme(): RuntimeEnvironment["colorScheme"] {
		const player = __VelaPlayers.LocalPlayer;
		if (player === undefined) {
			return "light";
		}

		return player.GetAttribute(VELA_COLOR_SCHEME_ATTRIBUTE) === "dark"
			? "dark"
			: "light";
	}

	export function detectInputMode(): RuntimeEnvironment["input"] {
		if (__VelaUserInputService.GamepadEnabled) {
			return "gamepad";
		}

		if (__VelaUserInputService.TouchEnabled) {
			return "touch";
		}

		return "mouse";
	}

	/// The defaults every project starts from. They live here rather than in
	/// each emitted module because they are the same table in every one of them
	/// — and they are most of what a theme weighs.
	const DEFAULT_THEME = __VelaConfigDefaults.theme as unknown as {
		colors: Record<string, string | Record<string, string>>;
		radius: Record<string, string>;
		spacing: Record<string, string>;
		fontFamily: Record<string, string>;
	};

	function withDefaults<T>(
		defaults: Record<string, T>,
		overrides: Record<string, T>,
		replaced: boolean,
	): Record<string, T> {
		if (replaced) {
			return overrides;
		}

		const merged: Record<string, T> = {};

		for (const [key, value] of pairs(defaults)) {
			merged[key as string] = value as T;
		}
		for (const [key, value] of pairs(overrides)) {
			merged[key as string] = value as T;
		}

		return merged;
	}

	export function normalizeTheme(config: VelaRuntimeConfig): RuntimeTheme {
		const replaced = config.theme.replaced ?? [];
		const isReplaced = (name: string) =>
			replaced.some((entry) => entry === name);

		return {
			colors: normalizeColorRegistry(
				withDefaults(
					DEFAULT_THEME.colors,
					config.theme.colors,
					isReplaced("colors"),
				),
			),
			radius: normalizeRadiusScale(
				withDefaults(
					DEFAULT_THEME.radius,
					config.theme.radius,
					isReplaced("radius"),
				),
			),
			spacing: normalizeSpacingScale(
				withDefaults(
					DEFAULT_THEME.spacing,
					config.theme.spacing,
					isReplaced("spacing"),
				),
			),
			fontFamily: withDefaults(
				DEFAULT_THEME.fontFamily,
				config.theme.fontFamily,
				isReplaced("fontFamily"),
			),
			pluginUtilities: config.plugins?.utilities ?? {},
		};
	}

	export function normalizeColorRegistry(
		registry: Record<string, string | Record<string, string>>,
	): Record<string, RuntimeColorEntry> {
		const normalized: Record<string, RuntimeColorEntry> = {};

		for (const [key, value] of pairs(registry)) {
			normalized[key] = typeIs(value, "string")
				? value
				: normalizeColorScale(value);
		}

		return normalized;
	}

	export function normalizeColorScale(
		scale: Record<string, string>,
	): RuntimeColorScale {
		const normalized: RuntimeColorScale = {};

		for (const [key, entry] of pairs(scale)) {
			const value = __VelaValue.parseColor3(entry);
			if (value !== undefined) {
				normalized[key] = value;
			}
		}

		return normalized;
	}

	export function normalizeRadiusScale(
		scale: Record<string, string>,
	): Record<string, UDim> {
		const normalized: Record<string, UDim> = {};

		for (const [key, value] of pairs(scale)) {
			normalized[key] =
				__VelaValue.parseUDim(value as string) ?? new UDim(0, 0);
		}

		return normalized;
	}

	export function normalizeSpacingScale(
		scale: Record<string, string>,
	): Record<string, UDim> {
		const normalized: Record<string, UDim> = {};

		for (const [key, value] of pairs(scale)) {
			normalized[key] =
				__VelaValue.parseUDim(value as string) ?? new UDim(0, 0);
		}

		return normalized;
	}
}

export namespace __VelaResolution {
	export function resolveRuntimeResolution(
		theme: RuntimeTheme,
		environment: RuntimeEnvironment,
		runtimeRules: readonly RuntimeRule[],
		className: ClassValue | undefined,
		preflight: boolean,
		tag: string | undefined,
	): RuntimeResolution {
		const resolution: RuntimeResolution = {
			props: {},
			helpers: [],
			remRatio: __VelaRem.ratio(environment.rem),
		};

		for (const rule of runtimeRules) {
			if (__VelaVariant.conditionUsesState(rule.condition, "hover")) {
				resolution.usesHover = true;
			}
			if (__VelaVariant.conditionUsesState(rule.condition, "active")) {
				resolution.usesActive = true;
			}
			if (__VelaVariant.conditionUsesState(rule.condition, "focus")) {
				resolution.usesFocus = true;
			}
			if (__VelaVariant.matchesRuntimeCondition(rule.condition, environment)) {
				__VelaApply.applyEffectBundle(resolution, rule.effects);
			}
		}

		for (const token of __VelaApply.normalizeClassValue(className)) {
			applyToken(theme, environment, tag, token, resolution, preflight, 0);
		}

		return resolution;
	}

	/// A plugin utility that reaches itself would expand forever; the class is
	/// dropped instead, matching what the static path does.
	export const MAX_PLUGIN_EXPANSION_DEPTH = 8;

	export function applyToken(
		theme: RuntimeTheme,
		environment: RuntimeEnvironment,
		tag: string | undefined,
		token: string,
		resolution: RuntimeResolution,
		preflight: boolean,
		depth: number,
	) {
		if (!token) {
			return;
		}

		const segments = __VelaLua.splitBy(token, ":");
		const utility = segments.pop();
		if (!utility) {
			return;
		}

		if (segments.includes("hover")) {
			resolution.usesHover = true;
		}
		if (segments.includes("active")) {
			resolution.usesActive = true;
		}
		if (segments.includes("focus")) {
			resolution.usesFocus = true;
		}

		if (
			!segments.every((segment) =>
				__VelaVariant.matchesVariant(segment, environment),
			)
		) {
			return;
		}

		const pluginUtility = theme.pluginUtilities[utility];
		if (pluginUtility !== undefined) {
			if (depth >= MAX_PLUGIN_EXPANSION_DEPTH) {
				return;
			}

			if (typeIs(pluginUtility, "string")) {
				const separator = __VelaLua.lastIndexOf(token, ":");
				const prefix =
					separator >= 0 ? __VelaLua.substring(token, 0, separator + 1) : "";
				for (const part of __VelaLua.splitWhitespace(pluginUtility)) {
					applyToken(
						theme,
						environment,
						tag,
						`${prefix}${part}`,
						resolution,
						preflight,
						depth + 1,
					);
				}
				return;
			}

			for (const [name, value] of pairs(pluginUtility)) {
				__VelaApply.setProp(
					resolution.props,
					name as string,
					__VelaApply.parseRuntimePropValue(value as string),
				);
			}
			return;
		}

		if (__VelaDivide.applyDivideToken(theme, utility, resolution)) {
			return;
		}

		if (__VelaMargin.applyMarginToken(theme, utility, resolution)) {
			return;
		}

		if (utility === "uppercase") {
			resolution.textTransform = "upper";
			return;
		}
		if (utility === "lowercase") {
			resolution.textTransform = "lower";
			return;
		}
		if (utility === "capitalize") {
			resolution.textTransform = "capitalize";
			return;
		}
		if (utility === "normal-case") {
			resolution.textTransform = "none";
			return;
		}
		if (utility === "underline") {
			resolution.textDecoration = "underline";
			return;
		}
		if (utility === "line-through") {
			resolution.textDecoration = "strike";
			return;
		}
		if (utility === "no-underline") {
			resolution.textDecoration = "none";
			return;
		}

		if (__VelaLua.startsWith(utility, "animate-")) {
			const key = __VelaLua.substring(
				utility,
				__VelaLua.stringLength("animate-"),
			);
			if (
				key === "spin" ||
				key === "pulse" ||
				key === "bounce" ||
				key === "none"
			) {
				resolution.animation = key;
			}
			return;
		}

		if (__VelaMotion.applyTransitionToken(utility, resolution)) {
			return;
		}

		const effect = __VelaToken.resolveUtilityToken(theme, tag, utility);
		if (!effect) {
			return;
		}

		// A utility the host element cannot carry is dropped whole, the way the
		// static path drops it: writing `TextColor3` onto a Frame is a hard Roblox
		// error, not a no-op.
		if (!effect.props.every((prop) => isPropAllowedOnTag(tag, prop.name))) {
			return;
		}

		__VelaApply.applyResolvedEffectBundle(
			resolution,
			withPreflightBackground(effect, preflight),
		);
	}

	export const TEXT_HOST_PROPS: readonly string[] = [
		"TextColor3",
		"TextTransparency",
		"TextSize",
		"TextXAlignment",
		"TextYAlignment",
		"TextWrapped",
		"TextTruncate",
		"LineHeight",
		"FontFamily",
		"FontWeight",
		"FontStyle",
	];

	export const IMAGE_HOST_PROPS: readonly string[] = [
		"ImageColor3",
		"ImageTransparency",
		"ScaleType",
	];

	export const SCROLL_HOST_PROPS: readonly string[] = [
		"ElasticBehavior",
		"ScrollingDirection",
		"ScrollingEnabled",
		"ScrollBarThickness",
		"ScrollBarImageColor3",
		"ScrollBarImageTransparency",
		"AutomaticCanvasSize",
	];

	/// Roblox has no inherited transparency, so an enclosing `opacity-*` hands this
	/// element the alpha it has left and every channel below carries the product.
	/// Only what the runtime itself resolved passes through here — the statically
	/// known half was already composed by the transformer.
	export function composeInheritedOpacity(
		resolution: RuntimeResolution,
		tag: string | undefined,
		alpha: number,
	) {
		for (const name of __VelaOpacity.transparencyProps(tag)) {
			const current = resolution.props[name];
			if (current === undefined) {
				continue;
			}
			resolution.props[name] = __VelaOpacity.compose(current as number, alpha);
		}

		for (const helper of resolution.helpers) {
			if (helper.tag !== "uistroke" && helper.tag !== "uishadow") {
				continue;
			}

			const transparency = helper.props.find(
				(prop) => prop.name === "Transparency",
			);
			if (transparency === undefined) {
				helper.props.push({ name: "Transparency", value: 1 - alpha });
				continue;
			}
			transparency.value = 1 - (1 - (transparency.value as number)) * alpha;
		}
	}

	/// Mirrors `is_utility_allowed_on_host`. A component element hides its host tag,
	/// so nothing is filtered there — same as the static path's `None`.
	export function isPropAllowedOnTag(
		tag: string | undefined,
		name: string,
	): boolean {
		if (tag === undefined) {
			return true;
		}

		if (TEXT_HOST_PROPS.includes(name)) {
			return tag === "textlabel" || tag === "textbutton" || tag === "textbox";
		}

		if (IMAGE_HOST_PROPS.includes(name)) {
			return tag === "imagelabel" || tag === "imagebutton";
		}

		if (name === "PlaceholderColor3") {
			return tag === "textbox";
		}

		if (SCROLL_HOST_PROPS.includes(name)) {
			return tag === "scrollingframe";
		}

		return true;
	}

	/// Preflight leaves the base transparent, so a background color resolved from a
	/// dynamic class value has to state its own opacity or it would never show.
	export function withPreflightBackground(
		effect: RuntimeResolvedEffectBundle,
		preflight: boolean,
	): RuntimeResolvedEffectBundle {
		if (!preflight) {
			return effect;
		}

		let setsColor = false;
		for (const prop of effect.props) {
			if (prop.name === "BackgroundTransparency") {
				return effect;
			}
			if (prop.name === "BackgroundColor3") {
				setsColor = true;
			}
		}

		if (!setsColor) {
			return effect;
		}

		const props = [...effect.props];
		props.push({ name: "BackgroundTransparency", value: 0 });
		return { props, helpers: effect.helpers };
	}
}

export namespace __VelaMotion {
	let driver: VelaMotionDriver = {};

	export function setDriver(value: VelaMotionDriver) {
		driver = value;
	}

	export function transitionState(
		resolution: RuntimeResolution,
	): RuntimeTransitionState {
		let state = resolution.transition;
		if (state === undefined) {
			state = {};
			resolution.transition = state;
		}
		return state;
	}

	/// Consumes `transition`/`duration-*`/`ease-*`/`delay-*` tokens from dynamic
	/// class values so state-driven class changes tween instead of snapping.
	export function applyTransitionToken(
		token: string,
		resolution: RuntimeResolution,
	): boolean {
		if (token === "transition" || __VelaLua.startsWith(token, "transition-")) {
			const state = transitionState(resolution);
			if (token === "transition-none") {
				state.enabled = false;
				return true;
			}

			const property = __VelaLua.substring(
				token,
				__VelaLua.stringLength("transition-"),
			);
			if (
				token === "transition" ||
				property === "all" ||
				property === "colors" ||
				property === "opacity" ||
				property === "transform"
			) {
				state.enabled = true;
				state.property = token === "transition" ? "all" : property;
			}
			return true;
		}

		if (__VelaLua.startsWith(token, "duration-")) {
			const millis = tonumber(
				__VelaLua.substring(token, __VelaLua.stringLength("duration-")),
			);
			if (millis !== undefined) {
				const state = transitionState(resolution);
				state.time = millis / 1000;
				if (state.enabled === undefined) {
					state.enabled = true;
				}
			}
			return true;
		}

		if (__VelaLua.startsWith(token, "delay-")) {
			const millis = tonumber(
				__VelaLua.substring(token, __VelaLua.stringLength("delay-")),
			);
			if (millis !== undefined) {
				const state = transitionState(resolution);
				state.delay = millis / 1000;
				if (state.enabled === undefined) {
					state.enabled = true;
				}
			}
			return true;
		}

		if (__VelaLua.startsWith(token, "ease-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("ease-"));
			const easing =
				key === "linear"
					? (["Linear", "InOut"] as const)
					: key === "in"
						? (["Quad", "In"] as const)
						: key === "out"
							? (["Quad", "Out"] as const)
							: key === "in-out"
								? (["Quad", "InOut"] as const)
								: undefined;
			if (easing !== undefined) {
				const state = transitionState(resolution);
				state.style = easing[0];
				state.direction = easing[1];
				if (state.enabled === undefined) {
					state.enabled = true;
				}
			}
			return true;
		}

		return false;
	}

	export function resolveTransitionConfig(
		base: RuntimeTransition | undefined,
		dynamic: RuntimeTransitionState | undefined,
	): RuntimeTransition | undefined {
		const enabled =
			dynamic?.enabled !== undefined ? dynamic.enabled : base !== undefined;
		if (!enabled) {
			return undefined;
		}

		return {
			time: dynamic?.time ?? base?.time ?? 0.15,
			style: dynamic?.style ?? base?.style ?? "Quad",
			direction: dynamic?.direction ?? base?.direction ?? "Out",
			delay: dynamic?.delay ?? base?.delay ?? 0,
			property: dynamic?.property ?? base?.property ?? "all",
		};
	}

	/// `transition-colors` and friends narrow the tween to one group of props;
	/// anything outside it keeps applying instantly. Only top-level instance props
	/// tween at all, so a helper prop is never a candidate here.
	export function transitionCoversProp(
		property: string,
		name: string,
	): boolean {
		if (property === "all") {
			return true;
		}

		if (property === "colors") {
			return __VelaLua.endsWith(name, "Color3");
		}

		if (property === "opacity") {
			return __VelaLua.endsWith(name, "Transparency");
		}

		if (property === "transform") {
			return (
				name === "Position" ||
				name === "Size" ||
				name === "Rotation" ||
				name === "AnchorPoint"
			);
		}

		return false;
	}

	export function isTweenableValue(value: unknown): value is RuntimePropValue {
		return (
			typeIs(value, "number") ||
			typeIs(value, "Color3") ||
			typeIs(value, "UDim") ||
			typeIs(value, "UDim2") ||
			typeIs(value, "Vector2")
		);
	}

	export function parseEasingStyle(name: string): Enum.EasingStyle {
		const registry = Enum.EasingStyle as unknown as Record<
			string,
			Enum.EasingStyle | undefined
		>;
		return registry[name] ?? Enum.EasingStyle.Quad;
	}

	export function parseEasingDirection(name: string): Enum.EasingDirection {
		const registry = Enum.EasingDirection as unknown as Record<
			string,
			Enum.EasingDirection | undefined
		>;
		return registry[name] ?? Enum.EasingDirection.Out;
	}

	/// Starts a preset loop animation and returns the cleanup that cancels it and
	/// restores the animated property.
	export function playTransition(
		instance: Instance,
		goal: Record<string, RuntimePropValue>,
		spec: VelaMotionSpec,
	) {
		if (driver.transition !== undefined) {
			driver.transition(instance, goal, spec);
			return;
		}

		const info = new TweenInfo(
			spec.time,
			parseEasingStyle(spec.style),
			parseEasingDirection(spec.direction),
			0,
			false,
			spec.delay,
		);
		__VelaTweenService.Create(instance, info, goal as never).Play();
	}

	export function startPresetAnimation(
		instance: Instance,
		animation: string,
	): (() => void) | undefined {
		if (driver.animate !== undefined) {
			return driver.animate(instance, animation);
		}

		const gui = instance as GuiObject;

		if (animation === "spin") {
			const base = gui.Rotation;
			const tween = __VelaTweenService.Create(
				gui,
				new TweenInfo(
					1,
					Enum.EasingStyle.Linear,
					Enum.EasingDirection.InOut,
					-1,
				),
				{ Rotation: base + 360 } as never,
			);
			tween.Play();
			return () => {
				tween.Cancel();
				gui.Rotation = base;
			};
		}

		if (animation === "pulse") {
			const base = gui.BackgroundTransparency;
			const tween = __VelaTweenService.Create(
				gui,
				new TweenInfo(
					1,
					Enum.EasingStyle.Quad,
					Enum.EasingDirection.InOut,
					-1,
					true,
				),
				{ BackgroundTransparency: 0.5 } as never,
			);
			tween.Play();
			return () => {
				tween.Cancel();
				gui.BackgroundTransparency = base;
			};
		}

		if (animation === "bounce") {
			const base = gui.Position;
			const height = gui.AbsoluteSize.Y;
			const bounceOffset = height > 0 ? math.floor(height / 4) : 8;
			const tween = __VelaTweenService.Create(
				gui,
				new TweenInfo(
					0.5,
					Enum.EasingStyle.Quad,
					Enum.EasingDirection.Out,
					-1,
					true,
				),
				{ Position: base.sub(UDim2.fromOffset(0, bounceOffset)) } as never,
			);
			tween.Play();
			return () => {
				tween.Cancel();
				gui.Position = base;
			};
		}

		return undefined;
	}
}

export namespace __VelaVariant {
	export function matchesVariant(
		prefix: string,
		environment: RuntimeEnvironment,
	): boolean {
		switch (prefix) {
			case "sm":
				return environment.width >= 640;
			case "md":
				return environment.width >= 768;
			case "lg":
				return environment.width >= 1024;
			case "portrait":
				return environment.orientation === "portrait";
			case "landscape":
				return environment.orientation === "landscape";
			case "touch":
				return environment.input === "touch";
			case "mouse":
				return environment.input === "mouse";
			case "gamepad":
				return environment.input === "gamepad";
			case "dark":
				return environment.colorScheme === "dark";
			case "hover":
				return environment.hovered;
			case "active":
				return environment.pressed;
			case "focus":
				return environment.focused;
			default:
				return false;
		}
	}

	export function conditionUsesState(
		condition: RuntimeCondition,
		kind: "hover" | "active" | "focus",
	): boolean {
		if (condition.kind === kind) {
			return true;
		}
		if (condition.kind === "all") {
			return condition.conditions.some((entry) =>
				conditionUsesState(entry, kind),
			);
		}
		return false;
	}

	/// Wraps one Event entry, keeping whatever handler the consumer declared and
	/// whatever an earlier tracker already composed onto it.
	export function composeEvent(
		hostProps: Record<string, unknown>,
		name: string,
		handler: (...args: unknown[]) => void,
	) {
		const existing = hostProps.Event;
		const events: Record<string, unknown> = {};
		if (typeIs(existing, "table")) {
			for (const [key, value] of pairs(existing as Record<string, unknown>)) {
				events[key as string] = value;
			}
		}

		const previous = events[name];
		events[name] = (...args: unknown[]) => {
			handler(...args);
			if (typeIs(previous, "function")) {
				(previous as (...args: unknown[]) => void)(...args);
			}
		};

		hostProps.Event = events;
	}

	/// Attaches MouseEnter/MouseLeave to drive the hover state.
	/// What a variant needs connected, named rather than attached: `Event` is
	/// how @rbxts/react spells a handler, and Vide writes one under the property
	/// name itself. Each host runtime composes these its own way.
	export function hoverTracking(
		setHovered: (hovered: boolean) => void,
	): VariantEventBinding[] {
		return [
			{ name: "MouseEnter", handler: () => setHovered(true) },
			{ name: "MouseLeave", handler: () => setHovered(false) },
		];
	}

	/// The input object arrives first here, because a binding is connected to
	/// the signal itself. @rbxts/react prepends the instance to every handler's
	/// arguments, which is why the attach form below reads one place further in.
	export function activeTracking(
		setPressed: (pressed: boolean) => void,
	): VariantEventBinding[] {
		return [
			{
				name: "InputBegan",
				handler: (...args: unknown[]) => {
					if (isPressInput(args[0])) {
						setPressed(true);
					}
				},
			},
			{
				name: "InputEnded",
				handler: (...args: unknown[]) => {
					if (isPressInput(args[0])) {
						setPressed(false);
					}
				},
			},
			{ name: "MouseLeave", handler: () => setPressed(false) },
		];
	}

	export function focusTracking(
		tag: VelaRuntimeTag,
		setFocused: (focused: boolean) => void,
	): VariantEventBinding[] {
		const gained = tag === "textbox" ? "Focused" : "SelectionGained";
		const lost = tag === "textbox" ? "FocusLost" : "SelectionLost";

		return [
			{ name: gained, handler: () => setFocused(true) },
			{ name: lost, handler: () => setFocused(false) },
		];
	}

	export function attachHoverTracking(
		hostProps: Record<string, unknown>,
		setHovered: (hovered: boolean) => void,
	) {
		composeEvent(hostProps, "MouseEnter", () => setHovered(true));
		composeEvent(hostProps, "MouseLeave", () => setHovered(false));
	}

	/// Drives the pressed state from mouse and touch input. A release that lands
	/// outside the element never reaches its `InputEnded`, so leaving the element
	/// clears the state too.
	export function attachActiveTracking(
		hostProps: Record<string, unknown>,
		setPressed: (pressed: boolean) => void,
	) {
		composeEvent(hostProps, "InputBegan", (...args: unknown[]) => {
			if (isPressInput(args[1])) {
				setPressed(true);
			}
		});
		composeEvent(hostProps, "InputEnded", (...args: unknown[]) => {
			if (isPressInput(args[1])) {
				setPressed(false);
			}
		});
		composeEvent(hostProps, "MouseLeave", () => setPressed(false));
	}

	export function isPressInput(input: unknown): boolean {
		if (!typeIs(input, "Instance") || !input.IsA("InputObject")) {
			return false;
		}

		return (
			input.UserInputType === Enum.UserInputType.MouseButton1 ||
			input.UserInputType === Enum.UserInputType.Touch
		);
	}

	/// Text boxes carry their own keyboard focus events; every other element reads
	/// focus as the selection a gamepad or `GuiService` moved onto it.
	export function attachFocusTracking(
		hostProps: Record<string, unknown>,
		tag: VelaRuntimeTag,
		setFocused: (focused: boolean) => void,
	) {
		let gained = "SelectionGained";
		let lost = "SelectionLost";
		if (tag === "textbox") {
			gained = "Focused";
			lost = "FocusLost";
		}

		composeEvent(hostProps, gained, () => setFocused(true));
		composeEvent(hostProps, lost, () => setFocused(false));
	}

	export function matchesRuntimeCondition(
		condition: RuntimeCondition,
		environment: RuntimeEnvironment,
	): boolean {
		switch (condition.kind) {
			case "all":
				return condition.conditions.every((entry) =>
					matchesRuntimeCondition(entry, environment),
				);
			case "width":
				return (
					environment.width >= condition.minWidth &&
					(condition.maxWidth === undefined ||
						environment.width <= condition.maxWidth)
				);
			case "orientation":
				return environment.orientation === condition.value;
			case "input":
				return environment.input === condition.value;
			case "color-scheme":
				return environment.colorScheme === condition.value;
			case "hover":
				return environment.hovered;
			case "active":
				return environment.pressed;
			case "focus":
				return environment.focused;
			case "test":
				return (
					(environment.tests?.[condition.index] ?? false) === condition.expected
				);
			default:
				return false;
		}
	}
}

/// `fit` and `auto` do not produce a size; they hand the axis to Roblox.
export namespace __VelaToken {
	export function isAutomaticSizeKey(key: string): boolean {
		return key === "fit" || key === "auto";
	}

	/// Mirrors TEXT_SIZE_VALUES on the static path. `text-[15px]` is a size too;
	/// only a number reads that way, so `text-[#f00]` stays a color.
	export function resolveTextSizeValue(key: string): number | undefined {
		const arbitrary = __VelaValue.parseArbitraryLength(key);
		if (arbitrary !== undefined) return arbitrary;
		if (key === "xs") return 12;
		if (key === "sm") return 14;
		if (key === "base") return 16;
		if (key === "lg") return 18;
		if (key === "xl") return 20;
		if (key === "2xl") return 24;
		if (key === "3xl") return 30;
		if (key === "4xl") return 36;
		if (key === "5xl") return 48;
		if (key === "6xl") return 60;
		if (key === "7xl") return 72;
		if (key === "8xl") return 96;
		if (key === "9xl") return 128;
		return undefined;
	}

	/// `text-left|center|right` on the static path; `justify` has no Roblox
	/// equivalent and is left unresolved there too.
	export function resolveTextXAlignmentValue(
		key: string,
	): Enum.TextXAlignment | undefined {
		if (key === "left") return Enum.TextXAlignment.Left;
		if (key === "center") return Enum.TextXAlignment.Center;
		if (key === "right") return Enum.TextXAlignment.Right;
		return undefined;
	}

	/// Mirrors FONT_WEIGHT_VALUES. A payload that is not a weight is read as a
	/// `theme.fontFamily` key, the way Tailwind overloads `font-*`.
	export function resolveFontWeightValue(
		key: string,
	): Enum.FontWeight | undefined {
		if (key === "thin") return Enum.FontWeight.Thin;
		if (key === "extralight") return Enum.FontWeight.ExtraLight;
		if (key === "light") return Enum.FontWeight.Light;
		if (key === "normal") return Enum.FontWeight.Regular;
		if (key === "medium") return Enum.FontWeight.Medium;
		if (key === "semibold") return Enum.FontWeight.SemiBold;
		if (key === "bold") return Enum.FontWeight.Bold;
		if (key === "extrabold") return Enum.FontWeight.ExtraBold;
		if (key === "black") return Enum.FontWeight.Heavy;
		return undefined;
	}

	/// `justify-*` runs along the main axis, which `UIListLayout` exposes as its
	/// horizontal properties. `between`/`around`/`evenly` need `UIFlexAlignment`
	/// rather than a plain alignment, so they land on a different property.
	export function resolveJustifyProp(
		key: string,
	): RuntimeResolvedPropEntry | undefined {
		if (key === "start") {
			return {
				name: "HorizontalAlignment",
				value: Enum.HorizontalAlignment.Left,
			};
		}
		if (key === "center") {
			return {
				name: "HorizontalAlignment",
				value: Enum.HorizontalAlignment.Center,
			};
		}
		if (key === "end") {
			return {
				name: "HorizontalAlignment",
				value: Enum.HorizontalAlignment.Right,
			};
		}
		if (key === "between") {
			return {
				name: "HorizontalFlex",
				value: Enum.UIFlexAlignment.SpaceBetween,
			};
		}
		if (key === "around") {
			return {
				name: "HorizontalFlex",
				value: Enum.UIFlexAlignment.SpaceAround,
			};
		}
		if (key === "evenly") {
			return {
				name: "HorizontalFlex",
				value: Enum.UIFlexAlignment.SpaceEvenly,
			};
		}
		return undefined;
	}

	/// `items-*` runs along the cross axis, which `UIListLayout` exposes as its
	/// vertical properties.
	export function resolveAlignItemsProp(
		key: string,
	): RuntimeResolvedPropEntry | undefined {
		if (key === "start") {
			return { name: "VerticalAlignment", value: Enum.VerticalAlignment.Top };
		}
		if (key === "center") {
			return {
				name: "VerticalAlignment",
				value: Enum.VerticalAlignment.Center,
			};
		}
		if (key === "end") {
			return {
				name: "VerticalAlignment",
				value: Enum.VerticalAlignment.Bottom,
			};
		}
		if (key === "stretch") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.Fill };
		}
		return undefined;
	}

	export function propEffect(
		name: string,
		value: RuntimePropValue,
	): RuntimeResolvedEffectBundle {
		return { props: [{ name, value }], helpers: [] };
	}

	export function propsEffect(
		props: RuntimeResolvedPropEntry[],
	): RuntimeResolvedEffectBundle {
		return { props, helpers: [] };
	}

	export function helperEffect(
		tag: string,
		props: RuntimeResolvedPropEntry[],
	): RuntimeResolvedEffectBundle {
		return { props: [], helpers: [{ tag, props }] };
	}

	/// A gradient stop carries its `/N` alpha beside the color, because
	/// UIGradient only learns the keypoint positions once every stop is known.
	export function gradientStopEffect(
		theme: RuntimeTheme,
		name: string,
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		const stop = __VelaColor.resolveGradientStop(theme, key);
		if (stop === undefined) {
			return undefined;
		}

		const [color, transparency] = stop;
		const props: RuntimeResolvedPropEntry[] = [{ name, value: color }];
		if (transparency !== undefined) {
			props.push({ name: `${name}Transparency`, value: transparency });
		}

		return propsEffect(props);
	}

	export function resolveUtilityToken(
		theme: RuntimeTheme,
		tag: string | undefined,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		// Negative families are their own tokens rather than a payload, so they are
		// matched before the positive prefixes would swallow them.
		if (__VelaLua.startsWith(token, "-rotate-")) {
			const value = __VelaValue.resolveRotationValue(
				__VelaLua.substring(token, __VelaLua.stringLength("-rotate-")),
				true,
			);
			return value === undefined ? undefined : propEffect("Rotation", value);
		}

		// `-z-*` has no Roblox meaning: ZIndex is unsigned in the layers vela emits.
		if (__VelaLua.startsWith(token, "-z-")) {
			return undefined;
		}

		for (const [prefix, positive] of [
			["-top-", "top-"],
			["-left-", "left-"],
			["-right-", "right-"],
			["-bottom-", "bottom-"],
			["-inset-", "inset-"],
			["-order-", "order-"],
			["-translate-x-", "translate-x-"],
			["-translate-y-", "translate-y-"],
		] as Array<[string, string]>) {
			if (__VelaLua.startsWith(token, prefix)) {
				return resolvePositionalToken(
					theme,
					positive,
					__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
					true,
				);
			}
		}

		if (token === "border") {
			return helperEffect("uistroke", [{ name: "Thickness", value: 1 }]);
		}

		if (token === "grid") {
			return helperEffect("uigridlayout", [
				{ name: "SortOrder", value: Enum.SortOrder.LayoutOrder },
			]);
		}

		// `scrollbar-none` hides the bar by zeroing its thickness, so it belongs to
		// the thickness family rather than the color one it looks like.
		if (token === "scrollbar-none") {
			return propEffect("ScrollBarThickness", 0);
		}

		if (__VelaLua.startsWith(token, "scrollbar-w-")) {
			const offset = __VelaValue.resolveSpacingOffset(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("scrollbar-w-")),
			);
			return offset === undefined
				? undefined
				: propEffect("ScrollBarThickness", offset);
		}

		if (token === "ring" || token === "outline") {
			return strokeThicknessEffect(token === "ring" ? 3 : 2);
		}

		if (token === "rounded") {
			const value = __VelaValue.resolveRadiusValue(
				theme,
				__VelaDefaults.PALETTE_DEFAULT_KEY,
			);
			return value === undefined
				? undefined
				: helperEffect("uicorner", [{ name: "CornerRadius", value }]);
		}

		if (token === "truncate") {
			return propEffect("TextTruncate", Enum.TextTruncate.AtEnd);
		}

		if (token === "italic") {
			return propEffect("FontStyle", Enum.FontStyle.Italic);
		}

		if (token === "not-italic") {
			return propEffect("FontStyle", Enum.FontStyle.Normal);
		}

		// `text-*` is an overloaded prefix: sizes, alignment, wrapping and colors all
		// share it, and the static path classifies them in this order.
		if (__VelaLua.startsWith(token, "text-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("text-"));
			const textSize = resolveTextSizeValue(key);
			if (textSize !== undefined) {
				return propEffect("TextSize", textSize);
			}

			const alignment = resolveTextXAlignmentValue(key);
			if (alignment !== undefined) {
				return propEffect("TextXAlignment", alignment);
			}

			const wrap = __VelaValue.resolveTextWrapValue(key);
			if (wrap !== undefined) {
				return propEffect("TextWrapped", wrap);
			}

			return __VelaColor.colorPropEffect(
				theme,
				key,
				"TextColor3",
				"TextTransparency",
			);
		}

		for (const prefix of ["bg-gradient-to-", "bg-linear-to-"]) {
			if (__VelaLua.startsWith(token, prefix)) {
				const rotation = __VelaValue.resolveGradientRotation(
					__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
				);
				return rotation === undefined
					? undefined
					: propEffect("GradientRotation", rotation);
			}
		}

		if (token === "shadow") {
			return shadowPresetEffect(3, 1, 0, 0.9);
		}

		if (__VelaLua.startsWith(token, "shadow-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("shadow-"));
			if (key === "none") {
				return helperEffect("uishadow", [{ name: "Enabled", value: false }]);
			}

			// An inset shadow has no UIStroke-style equivalent to render into.
			if (key === "inner") {
				return undefined;
			}

			const preset = resolveShadowPreset(key);
			if (preset !== undefined) {
				return preset;
			}

			return shadowColorEffect(theme, key);
		}

		if (token === "flex" || token === "flex-row") {
			return listLayoutEffect("FillDirection", Enum.FillDirection.Horizontal);
		}

		if (token === "flex-col") {
			return listLayoutEffect("FillDirection", Enum.FillDirection.Vertical);
		}

		if (token === "flex-wrap" || token === "flex-nowrap") {
			return listLayoutEffect("Wraps", token === "flex-wrap");
		}

		const flexItem = __VelaValue.resolveFlexItemMode(token);
		if (flexItem !== undefined) {
			return helperEffect("uiflexitem", [
				{ name: "FlexMode", value: flexItem },
			]);
		}

		if (token === "hidden" || token === "visible") {
			return propEffect("Visible", token === "visible");
		}

		// `font-*` carries both the weight scale and the theme's font families; the
		// fixed weight names win and anything else is read as a theme key.
		if (__VelaLua.startsWith(token, "font-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("font-"));
			const weight = resolveFontWeightValue(key);
			if (weight !== undefined) {
				return propEffect("FontWeight", weight);
			}

			const family = theme.fontFamily[key];
			return family === undefined
				? undefined
				: propEffect("FontFamily", family);
		}

		if (__VelaLua.startsWith(token, "bg-")) {
			return __VelaColor.colorPropEffect(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("bg-")),
				"BackgroundColor3",
				"BackgroundTransparency",
			);
		}

		if (__VelaLua.startsWith(token, "align-")) {
			const alignment = __VelaValue.resolveTextYAlignmentValue(
				__VelaLua.substring(token, __VelaLua.stringLength("align-")),
			);
			return alignment === undefined
				? undefined
				: propEffect("TextYAlignment", alignment);
		}

		if (__VelaLua.startsWith(token, "image-")) {
			return __VelaColor.colorPropEffect(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("image-")),
				"ImageColor3",
				"ImageTransparency",
			);
		}

		if (__VelaLua.startsWith(token, "placeholder-")) {
			return __VelaColor.colorPropEffect(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("placeholder-")),
				"PlaceholderColor3",
				undefined,
			);
		}

		if (__VelaLua.startsWith(token, "border-")) {
			return resolveBorderToken(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("border-")),
			);
		}

		if (__VelaLua.startsWith(token, "rounded-")) {
			const value = __VelaValue.resolveRadiusValue(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("rounded-")),
			);
			return value === undefined
				? undefined
				: helperEffect("uicorner", [{ name: "CornerRadius", value }]);
		}

		if (__VelaLua.startsWith(token, "z-")) {
			const value = __VelaValue.resolveZIndexValue(
				__VelaLua.substring(token, __VelaLua.stringLength("z-")),
			);
			return value === undefined ? undefined : propEffect("ZIndex", value);
		}

		for (const [prefix, sides] of [
			["p-", ["PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft"]],
			["px-", ["PaddingLeft", "PaddingRight"]],
			["py-", ["PaddingTop", "PaddingBottom"]],
			["pt-", ["PaddingTop"]],
			["pr-", ["PaddingRight"]],
			["pb-", ["PaddingBottom"]],
			["pl-", ["PaddingLeft"]],
		] as Array<[string, string[]]>) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const value = __VelaValue.resolveSpacingValue(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
			);
			return value === undefined
				? undefined
				: helperEffect(
						"uipadding",
						sides.map((name) => ({ name, value })),
					);
		}

		if (__VelaLua.startsWith(token, "gap-")) {
			const value = __VelaValue.resolveSpacingValue(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("gap-")),
			);
			if (value === undefined) {
				return undefined;
			}

			// The offset travels alongside so a grid can subtract each cell's share
			// of the gap from its track, exactly as the static path does.
			return {
				props:
					value.Scale === 0 ? [{ name: "GapOffset", value: value.Offset }] : [],
				helpers: [{ tag: "uilistlayout", props: [{ name: "Padding", value }] }],
			};
		}

		for (const [prefix, name] of [
			["min-w-", "MinWidth"],
			["max-w-", "MaxWidth"],
			["min-h-", "MinHeight"],
			["max-h-", "MaxHeight"],
		] as Array<[string, string]>) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const offset = __VelaValue.resolveSpacingOffset(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
			);
			return offset === undefined ? undefined : propEffect(name, offset);
		}

		if (__VelaLua.startsWith(token, "w-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("w-"));
			if (isAutomaticSizeKey(key)) {
				return propEffect("AutoX", true);
			}

			const value = __VelaValue.resolveSizeAxisValue(theme, key);
			return value === undefined
				? undefined
				: propEffect("SizeX", __VelaValue.formatSizeAxis(value));
		}

		if (__VelaLua.startsWith(token, "h-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("h-"));
			if (isAutomaticSizeKey(key)) {
				return propEffect("AutoY", true);
			}

			const value = __VelaValue.resolveSizeAxisValue(theme, key);
			return value === undefined
				? undefined
				: propEffect("SizeY", __VelaValue.formatSizeAxis(value));
		}

		if (__VelaLua.startsWith(token, "size-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("size-"));
			if (isAutomaticSizeKey(key)) {
				return propsEffect([
					{ name: "AutoX", value: true },
					{ name: "AutoY", value: true },
				]);
			}

			const value = __VelaValue.resolveSizeAxisValue(theme, key);
			return value === undefined
				? undefined
				: propsEffect([
						{ name: "SizeX", value: __VelaValue.formatSizeAxis(value) },
						{ name: "SizeY", value: __VelaValue.formatSizeAxis(value) },
					]);
		}

		if (__VelaLua.startsWith(token, "overflow-")) {
			const value = __VelaValue.resolveOverflowValue(
				__VelaLua.substring(token, __VelaLua.stringLength("overflow-")),
			);
			return value === undefined
				? undefined
				: propEffect("ClipsDescendants", value);
		}

		if (__VelaLua.startsWith(token, "rotate-")) {
			const value = __VelaValue.resolveRotationValue(
				__VelaLua.substring(token, __VelaLua.stringLength("rotate-")),
				false,
			);
			return value === undefined ? undefined : propEffect("Rotation", value);
		}

		if (__VelaLua.startsWith(token, "scale-")) {
			const value = __VelaValue.resolveScaleValue(
				__VelaLua.substring(token, __VelaLua.stringLength("scale-")),
			);
			return value === undefined
				? undefined
				: helperEffect("uiscale", [{ name: "Scale", value }]);
		}

		if (__VelaLua.startsWith(token, "opacity-")) {
			const value = __VelaValue.resolveOpacityValue(
				__VelaLua.substring(token, __VelaLua.stringLength("opacity-")),
			);
			if (value === undefined) {
				return undefined;
			}

			// A CanvasGroup composites its whole subtree, so `GroupTransparency` is
			// the only property that means what CSS `opacity` means.
			if (tag === "canvasgroup") {
				return propEffect("GroupTransparency", value);
			}

			// A component element hides which instance it will render, so there is
			// no channel to name here. The alpha travels to whatever it renders
			// instead, and lowers there against a tag that is known.
			if (tag === undefined) {
				return propEffect("OpacityAlpha", 1 - value);
			}

			// The channels fade the instance; the alpha travels on to the subtree,
			// which the transformer left alone because this class list was not
			// knowable until now.
			const props: RuntimeResolvedPropEntry[] = __VelaOpacity
				.transparencyProps(tag)
				.map((name) => ({ name, value }));
			props.push({ name: "OpacityAlpha", value: 1 - value });

			return propsEffect(props);
		}

		if (__VelaLua.startsWith(token, "aspect-")) {
			const value = __VelaValue.resolveAspectRatioValue(
				__VelaLua.substring(token, __VelaLua.stringLength("aspect-")),
			);
			return value === undefined
				? undefined
				: helperEffect("uiaspectratioconstraint", [
						{ name: "AspectRatio", value },
					]);
		}

		if (__VelaLua.startsWith(token, "flex-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("flex-"));
			if (key !== "row" && key !== "col") {
				return undefined;
			}

			return listLayoutEffect(
				"FillDirection",
				key === "row"
					? Enum.FillDirection.Horizontal
					: Enum.FillDirection.Vertical,
			);
		}

		if (__VelaLua.startsWith(token, "justify-")) {
			const prop = resolveJustifyProp(
				__VelaLua.substring(token, __VelaLua.stringLength("justify-")),
			);
			return prop === undefined
				? undefined
				: helperEffect("uilistlayout", [prop]);
		}

		if (__VelaLua.startsWith(token, "items-")) {
			const prop = resolveAlignItemsProp(
				__VelaLua.substring(token, __VelaLua.stringLength("items-")),
			);
			return prop === undefined
				? undefined
				: helperEffect("uilistlayout", [prop]);
		}

		for (const [prefix, name] of [
			["from-", "GradientFrom"],
			["via-", "GradientVia"],
		] as Array<[string, string]>) {
			if (__VelaLua.startsWith(token, prefix)) {
				return gradientStopEffect(
					theme,
					name,
					__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
				);
			}
		}

		// `top-` must come before `to-`, which would otherwise swallow it.
		if (__VelaLua.startsWith(token, "top-")) {
			return resolvePositionalToken(
				theme,
				"top-",
				__VelaLua.substring(token, __VelaLua.stringLength("top-")),
				false,
			);
		}

		if (__VelaLua.startsWith(token, "to-")) {
			return gradientStopEffect(
				theme,
				"GradientTo",
				__VelaLua.substring(token, __VelaLua.stringLength("to-")),
			);
		}

		for (const prefix of [
			"left-",
			"right-",
			"bottom-",
			"inset-",
			"order-",
			"translate-x-",
			"translate-y-",
			"basis-",
		]) {
			if (__VelaLua.startsWith(token, prefix)) {
				return resolvePositionalToken(
					theme,
					prefix,
					__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
					false,
				);
			}
		}

		if (__VelaLua.startsWith(token, "origin-")) {
			const value = __VelaValue.resolveAnchorPointValue(
				__VelaLua.substring(token, __VelaLua.stringLength("origin-")),
			);
			return value === undefined ? undefined : propEffect("AnchorPoint", value);
		}

		if (__VelaLua.startsWith(token, "content-")) {
			const prop = __VelaValue.resolveAlignContentProp(
				__VelaLua.substring(token, __VelaLua.stringLength("content-")),
			);
			return prop === undefined
				? undefined
				: helperEffect("uilistlayout", [prop]);
		}

		if (__VelaLua.startsWith(token, "self-")) {
			const value = __VelaValue.resolveAlignSelfValue(
				__VelaLua.substring(token, __VelaLua.stringLength("self-")),
			);
			return value === undefined
				? undefined
				: helperEffect("uiflexitem", [{ name: "ItemLineAlignment", value }]);
		}

		if (__VelaLua.startsWith(token, "leading-")) {
			const value = __VelaValue.resolveLineHeightValue(
				__VelaLua.substring(token, __VelaLua.stringLength("leading-")),
			);
			return value === undefined ? undefined : propEffect("LineHeight", value);
		}

		for (const prefix of ["grid-cols-", "grid-rows-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const count = __VelaValue.resolveGridCellCount(
				__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
			);
			if (count === undefined) {
				return undefined;
			}

			const horizontal = prefix === "grid-cols-";
			return {
				props: [
					{ name: "GridCells", value: count },
					{ name: "GridCellsHorizontal", value: horizontal },
				],
				helpers: [
					{
						tag: "uigridlayout",
						props: [
							{ name: "SortOrder", value: Enum.SortOrder.LayoutOrder },
							{
								name: "FillDirection",
								value: horizontal
									? Enum.FillDirection.Horizontal
									: Enum.FillDirection.Vertical,
							},
							{ name: "FillDirectionMaxCells", value: count },
						],
					},
				],
			};
		}

		for (const prefix of ["auto-rows-", "auto-cols-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const extent = __VelaValue.resolveSpacingOffset(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
			);
			if (extent === undefined) {
				return undefined;
			}

			return {
				props: [{ name: "GridCrossExtent", value: extent }],
				helpers: [
					{
						tag: "uigridlayout",
						props: [{ name: "SortOrder", value: Enum.SortOrder.LayoutOrder }],
					},
				],
			};
		}

		if (__VelaLua.startsWith(token, "object-")) {
			const value = __VelaValue.resolveObjectFitValue(
				__VelaLua.substring(token, __VelaLua.stringLength("object-")),
			);
			return value === undefined ? undefined : propEffect("ScaleType", value);
		}

		if (__VelaLua.startsWith(token, "pointer-events-")) {
			const value = __VelaValue.resolvePointerEventsValue(
				__VelaLua.substring(token, __VelaLua.stringLength("pointer-events-")),
			);
			return value === undefined
				? undefined
				: propEffect("Interactable", value);
		}

		for (const prefix of ["space-x-", "space-y-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const value = __VelaValue.resolveSpacingValue(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength(prefix)),
			);
			return value === undefined
				? undefined
				: helperEffect("uilistlayout", [
						{ name: "Padding", value },
						{
							name: "FillDirection",
							value:
								prefix === "space-x-"
									? Enum.FillDirection.Horizontal
									: Enum.FillDirection.Vertical,
						},
					]);
		}

		if (__VelaLua.startsWith(token, "whitespace-")) {
			const value = __VelaValue.resolveWhitespaceValue(
				__VelaLua.substring(token, __VelaLua.stringLength("whitespace-")),
			);
			return value === undefined ? undefined : propEffect("TextWrapped", value);
		}

		if (__VelaLua.startsWith(token, "overscroll-")) {
			const value = __VelaValue.resolveOverscrollValue(
				__VelaLua.substring(token, __VelaLua.stringLength("overscroll-")),
			);
			return value === undefined
				? undefined
				: propEffect("ElasticBehavior", value);
		}

		if (__VelaLua.startsWith(token, "scrollbar-")) {
			return __VelaColor.colorPropEffect(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("scrollbar-")),
				"ScrollBarImageColor3",
				"ScrollBarImageTransparency",
			);
		}

		if (__VelaLua.startsWith(token, "scroll-")) {
			const key = __VelaLua.substring(token, __VelaLua.stringLength("scroll-"));
			if (key === "none") {
				return propEffect("ScrollingEnabled", false);
			}

			const value = __VelaValue.resolveScrollDirectionValue(key);
			return value === undefined
				? undefined
				: propEffect("ScrollingDirection", value);
		}

		if (__VelaLua.startsWith(token, "canvas-")) {
			const value = __VelaValue.resolveCanvasSizeValue(
				__VelaLua.substring(token, __VelaLua.stringLength("canvas-")),
			);
			return value === undefined
				? undefined
				: propEffect("AutomaticCanvasSize", value);
		}

		for (const prefix of ["ring-", "outline-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const key = __VelaLua.substring(token, __VelaLua.stringLength(prefix));
			const thickness = resolveStrokeThickness(prefix === "outline-", key);
			if (thickness !== undefined) {
				return strokeThicknessEffect(thickness);
			}

			if (isUnsupportedStrokeKey(key)) {
				return undefined;
			}

			return strokeColorEffect(theme, key);
		}

		return undefined;
	}

	/// The `left`/`top`/`inset`/`translate`/`order`/`basis` families all read a
	/// spacing-or-fraction payload; only where the resolved distance lands differs.
	export function resolvePositionalToken(
		theme: RuntimeTheme,
		family: string,
		key: string,
		negative: boolean,
	): RuntimeResolvedEffectBundle | undefined {
		if (family === "order-") {
			const order = __VelaValue.resolveLayoutOrderValue(key, negative);
			return order === undefined ? undefined : propEffect("LayoutOrder", order);
		}

		if (family === "basis-") {
			// Main-axis size; the flex default is a row, so basis maps to the width
			// axis exactly like `w-*`.
			if (isAutomaticSizeKey(key)) {
				return propEffect("AutoX", true);
			}

			const value = __VelaValue.resolveSizeAxisValue(theme, key);
			return value === undefined
				? undefined
				: propEffect("SizeX", __VelaValue.formatSizeAxis(value));
		}

		const axis = __VelaValue.resolvePositionAxisValue(theme, key, negative);
		if (axis === undefined) {
			return undefined;
		}

		if (family === "translate-x-") {
			return propEffect("TranslateX", axis);
		}

		if (family === "translate-y-") {
			return propEffect("TranslateY", axis);
		}

		if (family === "left-") {
			return propEffect("PositionX", axis);
		}

		if (family === "top-") {
			return propEffect("PositionY", axis);
		}

		if (family === "right-") {
			return propEffect("PositionX", __VelaValue.endRelativePositionAxis(axis));
		}

		if (family === "bottom-") {
			return propEffect("PositionY", __VelaValue.endRelativePositionAxis(axis));
		}

		return propsEffect([
			{ name: "PositionX", value: axis },
			{ name: "PositionY", value: axis },
		]);
	}

	export function listLayoutEffect(
		name: string,
		value: RuntimePropValue,
	): RuntimeResolvedEffectBundle {
		return helperEffect("uilistlayout", [{ name, value }]);
	}

	export function resolveBorderToken(
		theme: RuntimeTheme,
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		if (key === "0" || key === "1" || key === "2" || key === "4") {
			return helperEffect("uistroke", [
				{ name: "Thickness", value: __VelaLua.toNumber(key) ?? 0 },
			]);
		}

		const arbitraryThickness = __VelaValue.parseArbitraryLength(key);
		if (arbitraryThickness !== undefined) {
			return helperEffect("uistroke", [
				{ name: "Thickness", value: arbitraryThickness },
			]);
		}

		if (key === "transparent") {
			return helperEffect("uistroke", [{ name: "Transparency", value: 1 }]);
		}

		const lineJoin = __VelaValue.resolveLineJoinValue(key);
		if (lineJoin !== undefined) {
			return helperEffect("uistroke", [
				{ name: "LineJoinMode", value: lineJoin },
			]);
		}

		if (__VelaValue.isUnsupportedBorderKey(key)) {
			return undefined;
		}

		return strokeColorEffect(theme, key);
	}

	export function strokeThicknessEffect(
		thickness: number,
	): RuntimeResolvedEffectBundle {
		return helperEffect("uistroke", [
			{ name: "Thickness", value: thickness },
			{ name: "ApplyStrokeMode", value: Enum.ApplyStrokeMode.Border },
		]);
	}

	/// `ring`/`outline` payloads with a stroke meaning; anything else is a color.
	export function resolveStrokeThickness(
		isOutline: boolean,
		key: string,
	): number | undefined {
		if (
			key === "0" ||
			key === "1" ||
			key === "2" ||
			key === "4" ||
			key === "8"
		) {
			return __VelaLua.toNumber(key);
		}

		if (isOutline && (key === "none" || key === "hidden")) {
			return 0;
		}

		return __VelaValue.parseArbitraryLength(key);
	}

	export function isUnsupportedStrokeKey(key: string): boolean {
		if (
			key === "inset" ||
			key === "solid" ||
			key === "dashed" ||
			key === "dotted" ||
			key === "double"
		) {
			return true;
		}

		if (__VelaLua.startsWith(key, "offset-")) {
			return true;
		}

		return __VelaLua.toNumber(key) !== undefined;
	}

	export function strokeColorEffect(
		theme: RuntimeTheme,
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		const [base, opacity] = __VelaColor.splitColorOpacity(key);
		const resolved = __VelaColor.resolveThemeColor(theme, base);
		if (resolved === undefined) {
			return undefined;
		}

		if (resolved.color === undefined) {
			return helperEffect("uistroke", [{ name: "Transparency", value: 1 }]);
		}

		return helperEffect("uistroke", [
			{ name: "Color", value: resolved.color },
			{
				name: "Transparency",
				value:
					opacity === undefined
						? 0
						: __VelaColor.opacityToTransparency(opacity),
			},
		]);
	}

	export function shadowPresetEffect(
		blur: number,
		offsetY: number,
		spread: number,
		transparency: number,
	): RuntimeResolvedEffectBundle {
		const props: RuntimeResolvedPropEntry[] = [
			{ name: "BlurRadius", value: new UDim(0, blur) },
			{ name: "Offset", value: UDim2.fromOffset(0, offsetY) },
		];

		if (spread !== 0) {
			props.push({ name: "Spread", value: UDim2.fromOffset(spread, spread) });
		}

		props.push({ name: "Transparency", value: transparency });
		return helperEffect("uishadow", props);
	}

	export function resolveShadowPreset(
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		if (key === "sm") return shadowPresetEffect(2, 1, 0, 0.95);
		if (key === "md") return shadowPresetEffect(6, 4, -1, 0.9);
		if (key === "lg") return shadowPresetEffect(15, 10, -3, 0.9);
		if (key === "xl") return shadowPresetEffect(25, 20, -5, 0.9);
		if (key === "2xl") return shadowPresetEffect(50, 25, -12, 0.75);
		return undefined;
	}

	export function shadowColorEffect(
		theme: RuntimeTheme,
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		const [base, opacity] = __VelaColor.splitColorOpacity(key);
		const resolved = __VelaColor.resolveThemeColor(theme, base);
		if (resolved === undefined) {
			return undefined;
		}

		if (resolved.color === undefined) {
			return helperEffect("uishadow", [{ name: "Transparency", value: 1 }]);
		}

		const props: RuntimeResolvedPropEntry[] = [
			{ name: "Color", value: resolved.color },
		];
		if (opacity !== undefined) {
			props.push({
				name: "Transparency",
				value: __VelaColor.opacityToTransparency(opacity),
			});
		}

		return helperEffect("uishadow", props);
	}
}

export namespace __VelaColor {
	export function resolveGradientStop(
		theme: RuntimeTheme,
		key: string,
	): [Color3, number | undefined] | undefined {
		const [base, opacity] = splitColorOpacity(key);
		const color = resolveThemeColor(theme, base)?.color;
		if (color === undefined) {
			return undefined;
		}

		return [
			color,
			opacity === undefined ? undefined : opacityToTransparency(opacity),
		];
	}

	/// Mirrors `resolve_color_value`: an arbitrary hex, the `transparent` keyword,
	/// or a theme key with an optional shade. `undefined` color means transparent.
	type RuntimeColorValue = {
		color?: Color3;
	};

	export function resolveThemeColor(
		theme: RuntimeTheme,
		key: string,
	): RuntimeColorValue | undefined {
		if (__VelaLua.startsWith(key, "[") && __VelaLua.endsWith(key, "]")) {
			const arbitrary = parseArbitraryColor(key);
			return arbitrary === undefined ? undefined : { color: arbitrary };
		}

		if (key === "current" || key === "inherit") {
			return undefined;
		}

		if (key === "transparent") {
			return {};
		}

		const [colorName, shade] = __VelaValue.splitColorKey(key);
		const value = theme.colors[colorName];
		if (typeIs(value, "string")) {
			if (shade !== undefined) {
				return undefined;
			}

			const parsed = __VelaValue.parseColor3(value);
			return parsed === undefined ? undefined : { color: parsed };
		}

		if (value === undefined) {
			return undefined;
		}

		const entry = (value as RuntimeColorScale)[
			shade ?? __VelaDefaults.PALETTE_DEFAULT_KEY
		];
		return entry === undefined ? undefined : { color: entry };
	}

	export function colorPropEffect(
		theme: RuntimeTheme,
		key: string,
		colorProp: string,
		transparencyProp: string | undefined,
	): RuntimeResolvedEffectBundle | undefined {
		const [base, opacity] = splitColorOpacity(key);
		const resolved = resolveThemeColor(theme, base);
		if (resolved === undefined) {
			return undefined;
		}

		if (resolved.color === undefined) {
			return transparencyProp === undefined
				? undefined
				: __VelaToken.propEffect(transparencyProp, 1);
		}

		const props: RuntimeResolvedPropEntry[] = [
			{ name: colorProp, value: resolved.color },
		];
		if (transparencyProp !== undefined && opacity !== undefined) {
			props.push({
				name: transparencyProp,
				value: opacityToTransparency(opacity),
			});
		}

		return __VelaToken.propsEffect(props);
	}

	/// Splits a trailing `/N` opacity modifier off a color payload. Only a 0-100
	/// integer counts; anything else stays part of the key.
	export function splitColorOpacity(key: string): [string, number | undefined] {
		const separator = __VelaLua.lastIndexOf(key, "/");
		if (separator === -1) {
			return [key, undefined];
		}

		const percent = __VelaLua.toNumber(__VelaLua.substring(key, separator + 1));
		if (
			percent === undefined ||
			percent < 0 ||
			percent > 100 ||
			!__VelaApply.isWholeNumber(percent)
		) {
			return [key, undefined];
		}

		return [__VelaLua.substring(key, 0, separator), percent];
	}

	export function opacityToTransparency(percent: number): number {
		return (100 - percent) / 100;
	}

	export function parseArbitraryColor(key: string): Color3 | undefined {
		const inner = __VelaLua.substring(key, 1, -1);
		if (!__VelaLua.startsWith(inner, "#")) {
			return undefined;
		}

		const hex = __VelaLua.substring(inner, 1);
		if (__VelaLua.stringLength(hex) === 3) {
			const red = parseHexDigit(__VelaLua.substring(hex, 0, 1));
			const green = parseHexDigit(__VelaLua.substring(hex, 1, 2));
			const blue = parseHexDigit(__VelaLua.substring(hex, 2, 3));
			if (red === undefined || green === undefined || blue === undefined) {
				return undefined;
			}

			return Color3.fromRGB(red * 17, green * 17, blue * 17);
		}

		if (__VelaLua.stringLength(hex) === 6) {
			const red = parseHexPair(__VelaLua.substring(hex, 0, 2));
			const green = parseHexPair(__VelaLua.substring(hex, 2, 4));
			const blue = parseHexPair(__VelaLua.substring(hex, 4, 6));
			if (red === undefined || green === undefined || blue === undefined) {
				return undefined;
			}

			return Color3.fromRGB(red, green, blue);
		}

		return undefined;
	}

	export const HEX_DIGITS = "0123456789abcdef";

	export function parseHexDigit(value: string): number | undefined {
		const lowered = value.lower();
		for (let index = 0; index < 16; index++) {
			if (__VelaLua.substring(HEX_DIGITS, index, index + 1) === lowered) {
				return index;
			}
		}

		return undefined;
	}

	export function parseHexPair(value: string): number | undefined {
		const high = parseHexDigit(__VelaLua.substring(value, 0, 1));
		const low = parseHexDigit(__VelaLua.substring(value, 1, 2));
		if (high === undefined || low === undefined) {
			return undefined;
		}

		return high * 16 + low;
	}
}

export namespace __VelaValue {
	export function resolveSpacingOffset(
		theme: RuntimeTheme,
		key: string,
	): number | undefined {
		const value = resolveSpacingValue(theme, key);
		if (value === undefined || value.Scale !== 0) {
			return undefined;
		}

		return value.Offset;
	}

	export function resolvePositionAxisValue(
		theme: RuntimeTheme,
		key: string,
		negative: boolean,
	): UDim | undefined {
		let base = parseArbitraryValue(key);

		if (base === undefined && key === "px") {
			base = { scale: 0, offset: 1 };
		}

		if (base === undefined && key === "full") {
			base = { scale: 1, offset: 0 };
		}

		if (base === undefined) {
			const fraction = resolveFractionScale(key);
			if (fraction !== undefined) {
				base = { scale: fraction, offset: 0 };
			}
		}

		if (base === undefined) {
			const offset = resolveSpacingOffset(theme, key);
			if (offset === undefined) {
				return undefined;
			}

			base = { scale: 0, offset };
		}

		return negative
			? new UDim(-base.scale, -base.offset)
			: new UDim(base.scale, base.offset);
	}

	/// Re-anchors a `left`/`top`-style axis to the far edge, mirroring CSS
	/// `right`/`bottom`: the resolved distance is measured back from scale 1.
	export function endRelativePositionAxis(axis: UDim): UDim {
		return new UDim(1 - axis.Scale, -axis.Offset);
	}

	export function resolveZIndexValue(key: string): number | undefined {
		if (key === "auto") {
			return undefined;
		}

		if (__VelaLua.startsWith(key, "[") && __VelaLua.endsWith(key, "]")) {
			// `ZIndex` is an integer, so a fractional arbitrary value would round
			// silently instead of doing what the class says.
			const arbitrary = parseArbitraryNumber(key, "");
			return arbitrary !== undefined && __VelaApply.isWholeNumber(arbitrary)
				? arbitrary
				: undefined;
		}

		if (
			key === "0" ||
			key === "10" ||
			key === "20" ||
			key === "30" ||
			key === "40" ||
			key === "50"
		) {
			return __VelaLua.toNumber(key);
		}

		return undefined;
	}

	export function resolveScaleValue(key: string): number | undefined {
		if (key === "0") return 0;
		if (key === "50") return 0.5;
		if (key === "75") return 0.75;
		if (key === "90") return 0.9;
		if (key === "95") return 0.95;
		if (key === "100") return 1;
		if (key === "105") return 1.05;
		if (key === "110") return 1.1;
		if (key === "125") return 1.25;
		if (key === "150") return 1.5;
		return undefined;
	}

	export function resolveRotationValue(
		key: string,
		negative: boolean,
	): number | undefined {
		const arbitrary = parseArbitraryNumber(key, "deg");
		if (arbitrary !== undefined) {
			return negative ? -arbitrary : arbitrary;
		}

		if (
			key !== "0" &&
			key !== "1" &&
			key !== "2" &&
			key !== "3" &&
			key !== "6" &&
			key !== "12" &&
			key !== "45" &&
			key !== "90" &&
			key !== "180"
		) {
			return undefined;
		}

		const degrees = __VelaLua.toNumber(key) ?? 0;
		return negative ? -degrees : degrees;
	}

	export function resolveOpacityValue(key: string): number | undefined {
		const percent = __VelaLua.toNumber(key);
		if (
			percent === undefined ||
			percent < 0 ||
			percent > 100 ||
			!__VelaApply.isWholeNumber(percent)
		) {
			return undefined;
		}

		return __VelaColor.opacityToTransparency(percent);
	}

	export function resolveAspectRatioValue(key: string): number | undefined {
		if (key === "square") {
			return 1;
		}

		if (key === "video") {
			return 16 / 9;
		}

		if (!__VelaLua.startsWith(key, "[") || !__VelaLua.endsWith(key, "]")) {
			return undefined;
		}

		const inner = __VelaLua.substring(key, 1, -1);
		const [widthText, heightText] = __VelaLua.splitOnce(inner, "/");
		if (heightText === undefined) {
			const value = __VelaLua.toNumber(__VelaLua.trim(inner));
			return value !== undefined && value > 0 ? value : undefined;
		}

		const width = __VelaLua.toNumber(__VelaLua.trim(widthText));
		const height = __VelaLua.toNumber(__VelaLua.trim(heightText));
		if (
			width === undefined ||
			height === undefined ||
			width <= 0 ||
			height <= 0
		) {
			return undefined;
		}

		return width / height;
	}

	export function resolveAnchorPointValue(key: string): Vector2 | undefined {
		if (key === "top-left") return new Vector2(0, 0);
		if (key === "top") return new Vector2(0.5, 0);
		if (key === "top-right") return new Vector2(1, 0);
		if (key === "left") return new Vector2(0, 0.5);
		if (key === "center") return new Vector2(0.5, 0.5);
		if (key === "right") return new Vector2(1, 0.5);
		if (key === "bottom-left") return new Vector2(0, 1);
		if (key === "bottom") return new Vector2(0.5, 1);
		if (key === "bottom-right") return new Vector2(1, 1);
		return undefined;
	}

	export function resolveAlignSelfValue(
		key: string,
	): Enum.ItemLineAlignment | undefined {
		if (key === "auto") return Enum.ItemLineAlignment.Automatic;
		if (key === "start") return Enum.ItemLineAlignment.Start;
		if (key === "center") return Enum.ItemLineAlignment.Center;
		if (key === "end") return Enum.ItemLineAlignment.End;
		if (key === "stretch") return Enum.ItemLineAlignment.Stretch;
		return undefined;
	}

	/// `content-*` distributes the cross axis, which `UIListLayout` exposes as its
	/// vertical properties — the same split `items-*` uses.
	export function resolveAlignContentProp(
		key: string,
	): RuntimeResolvedPropEntry | undefined {
		if (key === "between") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.SpaceBetween };
		}
		if (key === "around") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.SpaceAround };
		}
		if (key === "evenly") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.SpaceEvenly };
		}
		if (key === "stretch") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.Fill };
		}
		return __VelaToken.resolveAlignItemsProp(key);
	}

	export function resolveFlexItemMode(
		token: string,
	): Enum.UIFlexMode | undefined {
		if (token === "grow") return Enum.UIFlexMode.Grow;
		if (token === "shrink" || token === "flex-initial") {
			return Enum.UIFlexMode.Shrink;
		}
		if (token === "flex-1" || token === "flex-auto")
			return Enum.UIFlexMode.Fill;
		if (token === "grow-0" || token === "shrink-0" || token === "flex-none") {
			return Enum.UIFlexMode.None;
		}
		return undefined;
	}

	export function resolveLineJoinValue(
		key: string,
	): Enum.LineJoinMode | undefined {
		if (key === "round") return Enum.LineJoinMode.Round;
		if (key === "bevel") return Enum.LineJoinMode.Bevel;
		if (key === "miter") return Enum.LineJoinMode.Miter;
		return undefined;
	}

	export function resolveObjectFitValue(
		key: string,
	): Enum.ScaleType | undefined {
		if (key === "cover") return Enum.ScaleType.Crop;
		if (key === "contain") return Enum.ScaleType.Fit;
		if (key === "fill") return Enum.ScaleType.Stretch;
		if (key === "tile") return Enum.ScaleType.Tile;
		return undefined;
	}

	export function resolvePointerEventsValue(key: string): boolean | undefined {
		if (key === "none") return false;
		if (key === "auto") return true;
		return undefined;
	}

	export function resolveWhitespaceValue(key: string): boolean | undefined {
		if (key === "normal") return true;
		if (key === "nowrap") return false;
		return undefined;
	}

	export function resolveOverflowValue(key: string): boolean | undefined {
		if (key === "hidden" || key === "clip") return true;
		if (key === "visible") return false;
		return undefined;
	}

	export function resolveTextWrapValue(key: string): boolean | undefined {
		if (key === "wrap") return true;
		if (key === "nowrap") return false;
		return undefined;
	}

	export function resolveOverscrollValue(
		key: string,
	): Enum.ElasticBehavior | undefined {
		if (key === "auto") return Enum.ElasticBehavior.Always;
		if (key === "contain") return Enum.ElasticBehavior.WhenScrollable;
		if (key === "none") return Enum.ElasticBehavior.Never;
		return undefined;
	}

	export function resolveScrollDirectionValue(
		key: string,
	): Enum.ScrollingDirection | undefined {
		if (key === "x") return Enum.ScrollingDirection.X;
		if (key === "y") return Enum.ScrollingDirection.Y;
		if (key === "xy") return Enum.ScrollingDirection.XY;
		return undefined;
	}

	export function resolveCanvasSizeValue(
		key: string,
	): Enum.AutomaticSize | undefined {
		if (key === "auto") return Enum.AutomaticSize.XY;
		if (key === "auto-x") return Enum.AutomaticSize.X;
		if (key === "auto-y") return Enum.AutomaticSize.Y;
		if (key === "none") return Enum.AutomaticSize.None;
		return undefined;
	}

	export function resolveGridCellCount(key: string): number | undefined {
		const count = __VelaLua.toNumber(key);
		if (
			count === undefined ||
			!__VelaApply.isWholeNumber(count) ||
			count < 1 ||
			count > 12
		) {
			return undefined;
		}

		return count;
	}

	export function resolveGradientRotation(
		direction: string,
	): number | undefined {
		if (direction === "r") return 0;
		if (direction === "br") return 45;
		if (direction === "b") return 90;
		if (direction === "bl") return 135;
		if (direction === "l") return 180;
		if (direction === "tl") return 225;
		if (direction === "t") return 270;
		if (direction === "tr") return 315;
		return undefined;
	}

	export function resolveLineHeightValue(key: string): number | undefined {
		const arbitrary = parseArbitraryNumber(key, "");
		if (arbitrary !== undefined) {
			return arbitrary;
		}

		if (key === "none") return 1;
		if (key === "tight") return 1.25;
		if (key === "snug") return 1.375;
		if (key === "normal") return 1.5;
		if (key === "relaxed") return 1.625;
		if (key === "loose") return 2;
		return undefined;
	}

	export function resolveLayoutOrderValue(
		key: string,
		negative: boolean,
	): number | undefined {
		if (key === "first" || key === "last" || key === "none") {
			if (negative) {
				return undefined;
			}

			return key === "first" ? -9999 : key === "last" ? 9999 : 0;
		}

		const order = __VelaLua.toNumber(key);
		if (order === undefined || !__VelaApply.isWholeNumber(order)) {
			return undefined;
		}

		return negative ? -order : order;
	}

	export function resolveTextYAlignmentValue(
		key: string,
	): Enum.TextYAlignment | undefined {
		if (key === "top") return Enum.TextYAlignment.Top;
		if (key === "middle") return Enum.TextYAlignment.Center;
		if (key === "bottom") return Enum.TextYAlignment.Bottom;
		return undefined;
	}

	export function isUnsupportedBorderKey(key: string): boolean {
		if (
			key === "dashed" ||
			key === "solid" ||
			key === "dotted" ||
			key === "double"
		) {
			return true;
		}

		if (
			key === "x" ||
			key === "y" ||
			key === "t" ||
			key === "r" ||
			key === "b" ||
			key === "l"
		) {
			return true;
		}

		if (
			__VelaLua.startsWith(key, "x-") ||
			__VelaLua.startsWith(key, "y-") ||
			__VelaLua.startsWith(key, "t-") ||
			__VelaLua.startsWith(key, "r-") ||
			__VelaLua.startsWith(key, "b-") ||
			__VelaLua.startsWith(key, "l-")
		) {
			return true;
		}

		if (__VelaLua.startsWith(key, "opacity-")) {
			return true;
		}

		if (__VelaLua.startsWith(key, "[") && __VelaLua.endsWith(key, "]")) {
			return true;
		}

		if (__VelaLua.includesChar(key, "/")) {
			return true;
		}

		const numeric = __VelaLua.toNumber(key);
		if (numeric !== undefined) {
			return key !== "0" && key !== "1" && key !== "2" && key !== "4";
		}

		return false;
	}

	export function splitColorKey(key: string): [string, string | undefined] {
		const lastDash = __VelaLua.lastIndexOf(key, "-");
		if (lastDash === -1) {
			return [key, undefined];
		}

		const suffix = __VelaLua.substring(key, lastDash + 1);
		if (isColorShade(suffix)) {
			return [__VelaLua.substring(key, 0, lastDash), suffix];
		}

		return [key, undefined];
	}

	export function isColorShade(value: string): boolean {
		return (
			value === "50" ||
			value === "100" ||
			value === "200" ||
			value === "300" ||
			value === "400" ||
			value === "500" ||
			value === "600" ||
			value === "700" ||
			value === "800" ||
			value === "900" ||
			value === "950"
		);
	}

	export function resolveRadiusValue(
		theme: RuntimeTheme,
		key: string,
	): UDim | undefined {
		return theme.radius[key] ?? resolveArbitraryUDim(key);
	}

	export function resolveSpacingValue(
		theme: RuntimeTheme,
		key: string,
	): UDim | undefined {
		return (
			theme.spacing[key] ??
			resolveArbitraryUDim(key) ??
			resolveNumericSpacingValue(key)
		);
	}

	export function resolveSizeAxisValue(
		theme: RuntimeTheme,
		key: string,
	): RuntimeSizeAxisValue | undefined {
		if (key === "px") {
			return { scale: 0, offset: 1 };
		}

		if (key === "full") {
			return { scale: 1, offset: 0 };
		}

		if (key === "fit") {
			return undefined;
		}

		const fraction = resolveFractionScale(key);
		if (fraction !== undefined) {
			return { scale: fraction, offset: 0 };
		}

		const spacing = resolveSpacingValue(theme, key);
		if (spacing !== undefined) {
			if (spacing.Scale !== 0) {
				return undefined;
			}

			return { scale: 0, offset: spacing.Offset };
		}

		return resolveArbitrarySizeValue(key);
	}

	export function resolveArbitraryUDim(key: string): UDim | undefined {
		const value = parseArbitraryValue(key);
		if (value === undefined) {
			return undefined;
		}

		return new UDim(value.scale, value.offset);
	}

	export function resolveArbitrarySizeValue(
		key: string,
	): RuntimeSizeAxisValue | undefined {
		return parseArbitraryValue(key);
	}

	export function resolveNumericSpacingValue(key: string): UDim | undefined {
		if (__VelaLua.startsWith(key, "-") || __VelaLua.startsWith(key, "+")) {
			return undefined;
		}

		const numeric = __VelaLua.toNumber(key);
		if (numeric === undefined || numeric < 0) {
			return undefined;
		}

		if (!__VelaApply.isWholeNumber(numeric * 2)) {
			return undefined;
		}

		return new UDim(0, numeric * 4);
	}

	export function resolveFractionScale(key: string): number | undefined {
		const [numeratorText, denominatorText] = __VelaLua.splitOnce(key, "/");
		if (denominatorText === undefined) {
			return undefined;
		}

		const numerator = __VelaLua.toNumber(numeratorText);
		const denominator = __VelaLua.toNumber(denominatorText);
		if (numerator === undefined || denominator === undefined) {
			return undefined;
		}

		if (
			!__VelaApply.isWholeNumber(numerator) ||
			!__VelaApply.isWholeNumber(denominator)
		) {
			return undefined;
		}

		const wholeNumerator = __VelaLua.mathFloor(numerator);
		const wholeDenominator = __VelaLua.mathFloor(denominator);
		const isSupported =
			(wholeDenominator === 2 && wholeNumerator === 1) ||
			(wholeDenominator === 3 &&
				(wholeNumerator === 1 || wholeNumerator === 2)) ||
			(wholeDenominator === 4 &&
				(wholeNumerator === 1 || wholeNumerator === 3)) ||
			(wholeDenominator === 5 &&
				(wholeNumerator === 1 ||
					wholeNumerator === 2 ||
					wholeNumerator === 3 ||
					wholeNumerator === 4)) ||
			(wholeDenominator === 6 &&
				(wholeNumerator === 1 || wholeNumerator === 5)) ||
			(wholeDenominator === 12 && wholeNumerator >= 1 && wholeNumerator <= 11);

		if (!isSupported) {
			return undefined;
		}

		return wholeNumerator / wholeDenominator;
	}

	export function formatSizeAxis(value: RuntimeSizeAxisValue): UDim {
		return new UDim(value.scale, value.offset);
	}

	/// Mirrors the compiler's `parse_arbitrary_value`: a percentage is a scale, and
	/// a length is an offset. The two must agree, or a class resolves differently
	/// depending on whether it was static or dynamic.
	export function parseArbitraryValue(
		key: string,
	): RuntimeSizeAxisValue | undefined {
		if (!__VelaLua.startsWith(key, "[") || !__VelaLua.endsWith(key, "]")) {
			return undefined;
		}

		const inner = __VelaLua.substring(key, 1, -1);
		if (__VelaLua.endsWith(inner, "%")) {
			const percent = __VelaLua.toNumber(__VelaLua.substring(inner, 0, -1));
			return percent === undefined
				? undefined
				: { scale: percent / 100, offset: 0 };
		}

		const numeric = parseLength(inner);
		return numeric === undefined ? undefined : { scale: 0, offset: numeric };
	}

	/// Mirrors `parse_arbitrary_length`: the `[...]` payload of a family that
	/// only counts in pixels, where a percentage would have nothing to be a
	/// fraction of.
	export function parseArbitraryLength(key: string): number | undefined {
		if (!__VelaLua.startsWith(key, "[") || !__VelaLua.endsWith(key, "]")) {
			return undefined;
		}

		return parseLength(__VelaLua.substring(key, 1, -1));
	}

	/// `px` and a unitless number already are pixels; `rem` is the unit the
	/// viewport scales by, so it lands as what one rem is worth at the base
	/// resolution and follows the curve from there like any other offset.
	function parseLength(inner: string): number | undefined {
		if (__VelaLua.endsWith(inner, "rem")) {
			const rem = __VelaLua.toNumber(__VelaLua.substring(inner, 0, -3));
			return rem === undefined ? undefined : __VelaRem.pixels(rem);
		}

		return __VelaLua.toNumber(
			__VelaLua.endsWith(inner, "px")
				? __VelaLua.substring(inner, 0, -2)
				: inner,
		);
	}

	/// The plain number behind a `[...]` payload, for families that count in
	/// something other than pixels.
	export function parseArbitraryNumber(
		key: string,
		unit: string,
	): number | undefined {
		if (!__VelaLua.startsWith(key, "[") || !__VelaLua.endsWith(key, "]")) {
			return undefined;
		}

		const inner = __VelaLua.substring(key, 1, -1);
		return __VelaLua.toNumber(
			unit !== "" && __VelaLua.endsWith(inner, unit)
				? __VelaLua.substring(inner, 0, -__VelaLua.stringLength(unit))
				: inner,
		);
	}

	export function parseColor3(value: string): Color3 | undefined {
		const args = __VelaLua.parseCallArguments(value, "Color3.fromRGB(", ")");
		if (args === undefined || __VelaLua.arraySize(args) !== 3) {
			return undefined;
		}

		const red = __VelaLua.toNumber(args[0]);
		const green = __VelaLua.toNumber(args[1]);
		const blue = __VelaLua.toNumber(args[2]);

		if (
			red === undefined ||
			green === undefined ||
			blue === undefined ||
			![red, green, blue].every((channel) => channel >= 0 && channel <= 255)
		) {
			return undefined;
		}

		return Color3.fromRGB(red, green, blue);
	}

	export function parseUDim(value: string): UDim | undefined {
		const args = __VelaLua.parseCallArguments(value, "new UDim(", ")");
		if (args === undefined || __VelaLua.arraySize(args) !== 2) {
			return undefined;
		}

		return new UDim(
			__VelaLua.toNumber(args[0]) ?? 0,
			__VelaLua.toNumber(args[1]) ?? 0,
		);
	}

	export function parseUDim2(value: string): UDim2 | undefined {
		const fromOffset = __VelaLua.parseCallArguments(
			value,
			"UDim2.fromOffset(",
			")",
		);
		if (fromOffset !== undefined && __VelaLua.arraySize(fromOffset) === 2) {
			return UDim2.fromOffset(
				__VelaLua.toNumber(fromOffset[0]) ?? 0,
				__VelaLua.toNumber(fromOffset[1]) ?? 0,
			);
		}

		const fromScale = __VelaLua.parseCallArguments(
			value,
			"UDim2.fromScale(",
			")",
		);
		if (fromScale !== undefined && __VelaLua.arraySize(fromScale) === 2) {
			return UDim2.fromScale(
				__VelaLua.toNumber(fromScale[0]) ?? 0,
				__VelaLua.toNumber(fromScale[1]) ?? 0,
			);
		}

		const constructed =
			__VelaLua.parseCallArguments(value, "new UDim2(", ")") ??
			__VelaLua.parseCallArguments(value, "UDim2.new(", ")");
		if (constructed === undefined || __VelaLua.arraySize(constructed) !== 4) {
			return undefined;
		}

		return new UDim2(
			__VelaLua.toNumber(constructed[0]) ?? 0,
			__VelaLua.toNumber(constructed[1]) ?? 0,
			__VelaLua.toNumber(constructed[2]) ?? 0,
			__VelaLua.toNumber(constructed[3]) ?? 0,
		);
	}

	export function parseVector2(value: string): Vector2 | undefined {
		const args =
			__VelaLua.parseCallArguments(value, "new Vector2(", ")") ??
			__VelaLua.parseCallArguments(value, "Vector2.new(", ")");
		if (args === undefined || __VelaLua.arraySize(args) !== 2) {
			return undefined;
		}

		return new Vector2(
			__VelaLua.toNumber(args[0]) ?? 0,
			__VelaLua.toNumber(args[1]) ?? 0,
		);
	}

	/// `new Font("family", Enum.FontWeight.Bold, Enum.FontStyle.Italic)`, with
	/// the last two optional the way the static path writes them.
	export function parseFont(value: string): Font | undefined {
		const args = __VelaLua.splitCallArguments(value, "new Font(", ")");
		if (args === undefined) {
			return undefined;
		}

		const size = __VelaLua.arraySize(args);
		if (size < 1 || size > 3) {
			return undefined;
		}

		const family = __VelaLua.unquote(args[0] ?? "");
		if (family === undefined) {
			return undefined;
		}

		const weight = parseEnumValue(args[1] ?? "") as Enum.FontWeight | undefined;
		const style = parseEnumValue(args[2] ?? "") as Enum.FontStyle | undefined;

		return new Font(
			family,
			weight ?? Enum.FontWeight.Regular,
			style ?? Enum.FontStyle.Normal,
		);
	}

	/// The two- and three-stop forms the gradient families write, plus the
	/// keypoint array a `via` stop turns into.
	export function parseColorSequence(value: string): ColorSequence | undefined {
		const args = __VelaLua.splitCallArguments(value, "new ColorSequence(", ")");
		if (args === undefined) {
			return undefined;
		}

		const first = args[0];
		if (first === undefined) {
			return undefined;
		}

		if (__VelaLua.startsWith(first, "[")) {
			const body = __VelaLua.substring(
				first,
				1,
				__VelaLua.stringLength(first) - 1,
			);
			const keypoints: ColorSequenceKeypoint[] = [];
			for (const entry of __VelaLua.splitTopLevel(body, ",")) {
				const parts = __VelaLua.splitCallArguments(
					__VelaLua.trim(entry),
					"new ColorSequenceKeypoint(",
					")",
				);
				const position = __VelaLua.toNumber(parts?.[0]);
				const color = parseColor3(parts?.[1] ?? "");
				if (position === undefined || color === undefined) {
					return undefined;
				}
				keypoints.push(new ColorSequenceKeypoint(position, color));
			}

			return __VelaLua.arraySize(keypoints) >= 2
				? new ColorSequence(keypoints)
				: undefined;
		}

		const start = parseColor3(first);
		if (start === undefined) {
			return undefined;
		}

		const second = args[1];
		if (second === undefined) {
			return new ColorSequence(start);
		}

		const stop = parseColor3(second);
		return stop === undefined ? undefined : new ColorSequence(start, stop);
	}

	/// The alpha half of a gradient, written by the `/N` modifier on a stop.
	export function parseNumberSequence(
		value: string,
	): NumberSequence | undefined {
		const args = __VelaLua.splitCallArguments(
			value,
			"new NumberSequence(",
			")",
		);
		if (args === undefined) {
			return undefined;
		}

		const first = args[0];
		if (first === undefined) {
			return undefined;
		}

		if (__VelaLua.startsWith(first, "[")) {
			const body = __VelaLua.substring(
				first,
				1,
				__VelaLua.stringLength(first) - 1,
			);
			const keypoints: NumberSequenceKeypoint[] = [];
			for (const entry of __VelaLua.splitTopLevel(body, ",")) {
				const parts = __VelaLua.splitCallArguments(
					__VelaLua.trim(entry),
					"new NumberSequenceKeypoint(",
					")",
				);
				const position = __VelaLua.toNumber(parts?.[0]);
				const alpha = __VelaLua.toNumber(parts?.[1]);
				if (position === undefined || alpha === undefined) {
					return undefined;
				}
				keypoints.push(new NumberSequenceKeypoint(position, alpha));
			}

			return __VelaLua.arraySize(keypoints) >= 2
				? new NumberSequence(keypoints)
				: undefined;
		}

		const start = __VelaLua.toNumber(first);
		if (start === undefined) {
			return undefined;
		}

		const second = args[1];
		if (second === undefined) {
			return new NumberSequence(start);
		}

		const stop = __VelaLua.toNumber(second);
		return stop === undefined ? undefined : new NumberSequence(start, stop);
	}

	export function parseEnumValue(value: string): EnumItem | undefined {
		if (!__VelaLua.startsWith(value, "Enum.")) {
			return undefined;
		}

		const segments = __VelaLua.splitBy(value, ".");
		if (__VelaLua.arraySize(segments) !== 3) {
			return undefined;
		}

		const [, categoryName, memberName] = segments;
		if (categoryName === undefined || memberName === undefined) {
			return undefined;
		}

		const registry = Enum as unknown as Record<
			string,
			Record<string, EnumItem> | undefined
		>;
		const category = registry[categoryName];
		if (category === undefined) {
			return undefined;
		}

		return category[memberName];
	}
}

export namespace __VelaApply {
	export function normalizeClassValue(value: ClassValue | undefined): string[] {
		const tokens: string[] = [];

		const visit = (entry: ClassValue | undefined): void => {
			if (entry === undefined || entry === false) {
				return;
			}

			if (typeOf(entry) === "string" || typeOf(entry) === "number") {
				for (const token of __VelaLua.splitWhitespace(
					__VelaLua.toText(entry as string | number),
				)) {
					if (__VelaLua.stringLength(token) > 0) {
						tokens.push(token);
					}
				}
				return;
			}

			if (typeOf(entry) === "boolean") {
				return;
			}

			if (__VelaLua.isArrayValue(entry)) {
				for (const item of entry as ClassValue[]) {
					visit(item as ClassValue);
				}
				return;
			}

			if (typeOf(entry) === "table") {
				for (const [key, value] of pairs(entry as Record<string, unknown>)) {
					if (value === true) {
						tokens.push(key);
					}
				}
			}
		};

		visit(value);
		return tokens;
	}

	export function normalizeChildren(children: unknown): defined[] {
		if (children === undefined || children === false) {
			return [];
		}

		if (children === true) {
			return [];
		}

		if (__VelaLua.isArrayValue(children)) {
			const flattened: defined[] = [];
			for (const child of children as unknown[]) {
				for (const normalizedChild of normalizeChildren(child)) {
					flattened.push(normalizedChild);
				}
			}
			return flattened;
		}

		return [children as defined];
	}

	export function applyEffectBundle(
		resolution: RuntimeResolution,
		effects: RuntimeEffectBundle,
	) {
		for (const prop of effects.props) {
			applyResolutionProp(
				resolution,
				prop.name,
				parseRuntimePropValue(prop.value),
			);
		}

		for (const helper of effects.helpers) {
			setResolvedHelperProp(
				resolution.helpers,
				helper.tag,
				helper.props.map((prop) => ({
					name: prop.name,
					value: scaleHelperProp(
						helper.tag,
						prop.name,
						parseRuntimePropValue(prop.value),
						resolution,
					),
				})),
			);
		}
	}

	export function applyResolvedEffectBundle(
		resolution: RuntimeResolution,
		effects: RuntimeResolvedEffectBundle,
	) {
		for (const prop of effects.props) {
			applyResolutionProp(resolution, prop.name, prop.value);
		}

		for (const helper of effects.helpers) {
			setResolvedHelperProp(
				resolution.helpers,
				helper.tag,
				helper.props.map((prop) => ({
					name: prop.name,
					value: scaleHelperProp(helper.tag, prop.name, prop.value, resolution),
				})),
			);
		}
	}

	/// Only a value arriving from a rule or a class token is scaled here. What
	/// the composition steps below write is derived from resolution fields that
	/// were already scaled on the way in.
	function scaleHelperProp(
		tag: string,
		name: string,
		value: RuntimePropValue,
		resolution: RuntimeResolution,
	): RuntimePropValue {
		const remRatio = resolution.remRatio ?? 1;

		return remRatio !== 1 && __VelaRem.scalesHelperProp(tag, name)
			? __VelaRem.apply(value, remRatio)
			: value;
	}

	/// Several utility families only meet at the end — two axes of one `Size`, the
	/// three parts of a `FontFace`, a grid track and the gap it has to give back.
	/// They travel as their own entries and are composed here, once every rule and
	/// class token has had its say.
	export function applyResolutionProp(
		resolution: RuntimeResolution,
		name: string,
		rawValue: RuntimePropValue,
	) {
		const remRatio = resolution.remRatio ?? 1;
		const value =
			remRatio !== 1 && __VelaRem.scalesProp(name)
				? __VelaRem.apply(rawValue, remRatio)
				: rawValue;

		if (name === "OpacityAlpha") {
			if (typeIs(value, "number")) {
				resolution.opacityAlpha = value;
			}
			return;
		}

		if (name === "SizeX") {
			if (typeIs(value, "UDim")) {
				resolution.sizeWidth = value;
			}
			return;
		}

		if (name === "SizeY") {
			if (typeIs(value, "UDim")) {
				resolution.sizeHeight = value;
			}
			return;
		}

		// An axis can be given a size or handed to Roblox, never both — whichever
		// token comes last wins, matching the rule for every other utility.
		if (name === "AutoX") {
			resolution.autoWidth = value === true;
			if (value === true) {
				resolution.sizeWidth = undefined;
			}
			return;
		}

		if (name === "AutoY") {
			resolution.autoHeight = value === true;
			if (value === true) {
				resolution.sizeHeight = undefined;
			}
			return;
		}

		if (name === "PositionX") {
			if (typeIs(value, "UDim")) {
				resolution.positionX = value;
			}
			return;
		}

		if (name === "PositionY") {
			if (typeIs(value, "UDim")) {
				resolution.positionY = value;
			}
			return;
		}

		if (name === "TranslateX") {
			if (typeIs(value, "UDim")) {
				resolution.translateX = value;
			}
			return;
		}

		if (name === "TranslateY") {
			if (typeIs(value, "UDim")) {
				resolution.translateY = value;
			}
			return;
		}

		if (
			name === "MinWidth" ||
			name === "MinHeight" ||
			name === "MaxWidth" ||
			name === "MaxHeight"
		) {
			if (typeIs(value, "number")) {
				if (name === "MinWidth") {
					resolution.minWidth = value;
				} else if (name === "MinHeight") {
					resolution.minHeight = value;
				} else if (name === "MaxWidth") {
					resolution.maxWidth = value;
				} else {
					resolution.maxHeight = value;
				}
			}
			return;
		}

		// Roblox folds family, weight and style into one `FontFace`, so none of them
		// can be written straight onto the instance.
		if (name === "FontFamily") {
			if (typeIs(value, "string")) {
				resolution.fontFamily = value;
			}
			return;
		}

		if (name === "FontWeight") {
			if (typeIs(value, "EnumItem")) {
				resolution.fontWeight = value as Enum.FontWeight;
			}
			return;
		}

		if (name === "FontStyle") {
			if (typeIs(value, "EnumItem")) {
				resolution.fontStyle = value as Enum.FontStyle;
			}
			return;
		}

		if (name === "GapOffset") {
			if (typeIs(value, "number")) {
				resolution.gapOffset = value;
			}
			return;
		}

		if (name === "GridCells") {
			if (typeIs(value, "number")) {
				resolution.gridCells = value;
			}
			return;
		}

		if (name === "GridCellsHorizontal") {
			resolution.gridCellsHorizontal = value === true;
			return;
		}

		if (name === "GridCrossExtent") {
			if (typeIs(value, "number")) {
				resolution.gridCrossExtent = value;
			}
			return;
		}

		if (name === "GradientRotation") {
			if (typeIs(value, "number")) {
				resolution.gradientRotation = value;
			}
			return;
		}

		if (
			name === "GradientFrom" ||
			name === "GradientVia" ||
			name === "GradientTo"
		) {
			if (typeIs(value, "Color3")) {
				if (name === "GradientFrom") {
					resolution.gradientFrom = value;
				} else if (name === "GradientVia") {
					resolution.gradientVia = value;
				} else {
					resolution.gradientTo = value;
				}
			}
			return;
		}

		if (
			name === "GradientFromTransparency" ||
			name === "GradientViaTransparency" ||
			name === "GradientToTransparency"
		) {
			if (typeIs(value, "number")) {
				if (name === "GradientFromTransparency") {
					resolution.gradientFromTransparency = value;
				} else if (name === "GradientViaTransparency") {
					resolution.gradientViaTransparency = value;
				} else {
					resolution.gradientToTransparency = value;
				}
			}
			return;
		}

		setProp(resolution.props, name, value);
	}

	export function applyComposedResolution(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
		preflight: boolean,
	) {
		applyComposedFont(hostProps, resolution);
		applyComposedSize(hostProps, resolution);
		applyComposedTransform(hostProps, resolution);
		applyComposedSizeConstraints(resolution);
		applyComposedGrid(resolution);
		applyComposedGradient(hostProps, resolution, preflight);
	}

	export function applyComposedFont(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
	) {
		const family = resolution.fontFamily;
		const weight = resolution.fontWeight;
		const style = resolution.fontStyle;
		if (family === undefined && weight === undefined && style === undefined) {
			return;
		}

		const declared = hostProps.FontFace;
		const isFont = typeIs(declared, "Font");
		hostProps.FontFace = new Font(
			family ?? (isFont ? declared.Family : __VelaDefaults.DEFAULT_FONT_FAMILY),
			weight ?? (isFont ? declared.Weight : Enum.FontWeight.Regular),
			style ?? (isFont ? declared.Style : Enum.FontStyle.Normal),
		);
	}

	export function applyComposedSize(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
	) {
		const autoWidth = resolution.autoWidth === true;
		const autoHeight = resolution.autoHeight === true;
		if (autoWidth || autoHeight) {
			if (autoWidth && autoHeight) {
				hostProps.AutomaticSize = Enum.AutomaticSize.XY;
			} else if (autoWidth) {
				hostProps.AutomaticSize = Enum.AutomaticSize.X;
			} else {
				hostProps.AutomaticSize = Enum.AutomaticSize.Y;
			}
		}

		const width = resolution.sizeWidth;
		const height = resolution.sizeHeight;
		if (width === undefined && height === undefined) {
			return;
		}

		const declared = hostProps.Size;
		const base = typeIs(declared, "UDim2") ? declared : new UDim2(0, 0, 0, 0);
		const resolvedWidth = width ?? base.X;
		const resolvedHeight = height ?? base.Y;

		hostProps.Size = new UDim2(
			resolvedWidth.Scale,
			resolvedWidth.Offset,
			resolvedHeight.Scale,
			resolvedHeight.Offset,
		);
	}

	/// A fractional translate is a shift by the element's own size, which is exactly
	/// what `AnchorPoint` expresses; pixel translates shift `Position`.
	export function applyComposedTransform(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
	) {
		const [translateAnchorX, shiftX] = splitTranslateAxis(
			resolution.translateX,
		);
		const [translateAnchorY, shiftY] = splitTranslateAxis(
			resolution.translateY,
		);
		const anchorX =
			translateAnchorX ?? (resolution.centerX === true ? 0.5 : undefined);
		const anchorY =
			translateAnchorY ?? (resolution.centerY === true ? 0.5 : undefined);
		if (anchorX !== undefined || anchorY !== undefined) {
			hostProps.AnchorPoint = new Vector2(anchorX ?? 0, anchorY ?? 0);
		}

		// The translate half already met rem on its way into the resolution; a
		// negative margin token wrote its offset straight to the shift.
		const remRatio = resolution.remRatio ?? 1;
		const positionX = shiftPositionAxis(
			resolution.positionX,
			shiftX + (resolution.marginShiftX ?? 0) * remRatio,
		);
		const positionY = shiftPositionAxis(
			resolution.positionY,
			shiftY + (resolution.marginShiftY ?? 0) * remRatio,
		);
		if (positionX === undefined && positionY === undefined) {
			return;
		}

		const declared = hostProps.Position;
		const base = typeIs(declared, "UDim2") ? declared : new UDim2(0, 0, 0, 0);
		const resolvedX = positionX ?? base.X;
		const resolvedY = positionY ?? base.Y;

		hostProps.Position = new UDim2(
			resolvedX.Scale,
			resolvedX.Offset,
			resolvedY.Scale,
			resolvedY.Offset,
		);
	}

	export function splitTranslateAxis(
		axis: UDim | undefined,
	): [number | undefined, number] {
		if (axis === undefined) {
			return [undefined, 0];
		}

		// AnchorPoint moves opposite the shift, so the scale is negated.
		const anchor =
			__VelaLua.mathAbs(axis.Scale) < 1e-9 ? undefined : -axis.Scale;
		return [anchor, axis.Offset];
	}

	export function shiftPositionAxis(
		axis: UDim | undefined,
		shift: number,
	): UDim | undefined {
		if (__VelaLua.mathAbs(shift) < 1e-9) {
			return axis;
		}

		const base = axis ?? new UDim(0, 0);
		return new UDim(base.Scale, base.Offset + shift);
	}

	export function applyComposedSizeConstraints(resolution: RuntimeResolution) {
		if (
			resolution.minWidth !== undefined ||
			resolution.minHeight !== undefined
		) {
			setResolvedHelperProp(resolution.helpers, "uisizeconstraint", [
				{
					name: "MinSize",
					value: new Vector2(
						resolution.minWidth ?? 0,
						resolution.minHeight ?? 0,
					),
				},
			]);
		}

		if (
			resolution.maxWidth !== undefined ||
			resolution.maxHeight !== undefined
		) {
			setResolvedHelperProp(resolution.helpers, "uisizeconstraint", [
				{
					name: "MaxSize",
					value: new Vector2(
						resolution.maxWidth ?? math.huge,
						resolution.maxHeight ?? math.huge,
					),
				},
			]);
		}
	}

	/// Roblox's stock `UIGridLayout.CellSize` extent. `grid-cols-*` divides the axis
	/// it fills and leaves the cross axis here, since a column count says nothing
	/// about row height.
	export const GRID_CROSS_AXIS_DEFAULT = 100;

	/// `UIGridLayout` stamps `CellSize` onto every child and ignores whatever `Size`
	/// the child set for itself, so a grid that never names a cell size collapses
	/// the whole track to Roblox's 100x100 default.
	export function applyComposedGrid(resolution: RuntimeResolution) {
		const grid = resolution.helpers.find(
			(helper) => helper.tag === "uigridlayout",
		);
		if (grid === undefined) {
			return;
		}

		const gap = resolution.gapOffset ?? 0;
		const cells = resolution.gridCells;
		if (cells !== undefined && cells > 0) {
			const scale = 1 / cells;
			const gapShare = (gap * (cells - 1)) / cells;
			// `gridCrossExtent` met rem on its way into the resolution; the
			// stock extent standing in for it has not, and the static path
			// scales the same number.
			const cross =
				resolution.gridCrossExtent ??
				GRID_CROSS_AXIS_DEFAULT * (resolution.remRatio ?? 1);
			setResolvedHelperProp(resolution.helpers, "uigridlayout", [
				{
					name: "CellSize",
					value:
						resolution.gridCellsHorizontal === true
							? new UDim2(scale, -gapShare, 0, cross)
							: new UDim2(0, cross, scale, -gapShare),
				},
			]);
		}

		if (resolution.gapOffset !== undefined) {
			setResolvedHelperProp(resolution.helpers, "uigridlayout", [
				{ name: "CellPadding", value: UDim2.fromOffset(gap, gap) },
			]);
		}
	}

	export function applyComposedGradient(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
		preflight: boolean,
	) {
		const stops: Color3[] = [];
		const alphas: number[] = [];
		let faded = false;
		for (const [stop, transparency] of [
			[resolution.gradientFrom, resolution.gradientFromTransparency],
			[resolution.gradientVia, resolution.gradientViaTransparency],
			[resolution.gradientTo, resolution.gradientToTransparency],
		] as Array<[Color3 | undefined, number | undefined]>) {
			if (stop !== undefined) {
				stops.push(stop);
				alphas.push(transparency ?? 0);
				faded = faded || transparency !== undefined;
			}
		}

		const color = colorSequenceValue(stops);
		if (color === undefined) {
			return;
		}

		setResolvedHelperProp(resolution.helpers, "uigradient", [
			{ name: "Color", value: color },
		]);

		if (faded) {
			const transparency = numberSequenceValue(alphas);
			if (transparency !== undefined) {
				setResolvedHelperProp(resolution.helpers, "uigradient", [
					{ name: "Transparency", value: transparency },
				]);
			}
		}

		const rotation = resolution.gradientRotation;
		if (rotation !== undefined && rotation !== 0) {
			setResolvedHelperProp(resolution.helpers, "uigradient", [
				{ name: "Rotation", value: rotation },
			]);
		}

		// UIGradient modulates BackgroundColor3, so force a white base for true stop
		// colors — and take back the transparency preflight left behind.
		hostProps.BackgroundColor3 = Color3.fromRGB(255, 255, 255);
		if (preflight) {
			hostProps.BackgroundTransparency = 0;
		}
	}

	export function colorSequenceValue(
		stops: Color3[],
	): ColorSequence | undefined {
		const [first, second] = stops;
		if (first === undefined) {
			return undefined;
		}

		if (second === undefined) {
			return new ColorSequence(first);
		}

		const last = __VelaLua.arraySize(stops) - 1;
		if (last === 1) {
			return new ColorSequence(first, second);
		}

		const keypoints: ColorSequenceKeypoint[] = [];
		for (let index = 0; index <= last; index++) {
			const stop = stops[index];
			if (stop !== undefined) {
				keypoints.push(new ColorSequenceKeypoint(index / last, stop));
			}
		}

		return new ColorSequence(keypoints);
	}

	export function numberSequenceValue(
		stops: number[],
	): NumberSequence | undefined {
		const [first, second] = stops;
		if (first === undefined) {
			return undefined;
		}

		if (second === undefined) {
			return new NumberSequence(first);
		}

		const last = __VelaLua.arraySize(stops) - 1;
		if (last === 1) {
			return new NumberSequence(first, second);
		}

		const keypoints: NumberSequenceKeypoint[] = [];
		for (let index = 0; index <= last; index++) {
			const stop = stops[index];
			if (stop !== undefined) {
				keypoints.push(new NumberSequenceKeypoint(index / last, stop));
			}
		}

		return new NumberSequence(keypoints);
	}

	export function setProp(
		props: RuntimePropMap,
		name: string,
		value: RuntimePropValue,
	) {
		delete props[name];
		props[name] = value;
	}

	export function setHelperProp(
		helpers: RuntimeHelper[],
		tag: string,
		props: RuntimeRulePropEntry[],
	) {
		const existing = helpers.find((helper) => helper.tag === tag);
		if (existing) {
			for (const prop of props) {
				setHelperEntryProp(
					existing.props,
					prop.name,
					parseRuntimePropValue(prop.value),
				);
			}
			return;
		}

		helpers.push({
			tag,
			props: props.map((prop) => ({
				name: prop.name,
				value: parseRuntimePropValue(prop.value),
			})),
		});
	}

	export function setResolvedHelperProp(
		helpers: RuntimeHelper[],
		tag: string,
		props: RuntimeResolvedPropEntry[],
	) {
		const existing = helpers.find((helper) => helper.tag === tag);
		if (existing) {
			for (const prop of props) {
				setHelperEntryProp(existing.props, prop.name, prop.value);
			}
			return;
		}

		helpers.push({
			tag,
			props: props.map((prop) => ({ ...prop })),
		});
	}

	export function setHelperEntryProp(
		props: RuntimeHelperProp[],
		name: string,
		value: RuntimePropValue,
	) {
		const existing = props.find((prop) => prop.name === name);
		if (existing) {
			existing.value = value;
			return;
		}

		props.push({ name, value });
	}

	/// UIListLayout.SortOrder defaults to Name, which sorts children by their
	/// instance name and silently ignores every `order-*`.
	export function applyHelperDefaults(helpers: RuntimeHelper[]) {
		for (const helper of helpers) {
			if (helper.tag !== "uilistlayout") {
				continue;
			}

			if (
				helper.props.find((prop) => prop.name === "SortOrder") !== undefined
			) {
				continue;
			}

			helper.props.push({
				name: "SortOrder",
				value: Enum.SortOrder.LayoutOrder,
			});
		}
	}

	/// `@rbxts/react` maps a lowercase tag through a hardcoded class list and passes
	/// anything it does not know straight to `Instance.new`, which is case
	/// sensitive. `UIShadow` is missing from that list, so the lowercase form fails
	/// to instantiate and React unwinds the whole tree.
	export function hostClassName(tag: string): string {
		return tag === "uishadow" ? "UIShadow" : tag;
	}

	export function helperToProps(
		props: RuntimeHelperProp[],
	): Record<string, unknown> {
		const resolved: Record<string, unknown> = {};

		for (const prop of props) {
			resolved[prop.name] = prop.value;
		}

		return resolved;
	}

	export function parseRuntimePropValue(value: string): RuntimePropValue {
		const trimmed = __VelaLua.trim(value);

		const color = __VelaValue.parseColor3(trimmed);
		if (color !== undefined) {
			return color;
		}

		const udim = __VelaValue.parseUDim(trimmed);
		if (udim !== undefined) {
			return udim;
		}

		const udim2 = __VelaValue.parseUDim2(trimmed);
		if (udim2 !== undefined) {
			return udim2;
		}

		const vector = __VelaValue.parseVector2(trimmed);
		if (vector !== undefined) {
			return vector;
		}

		const sequence = __VelaValue.parseColorSequence(trimmed);
		if (sequence !== undefined) {
			return sequence;
		}

		const alphaSequence = __VelaValue.parseNumberSequence(trimmed);
		if (alphaSequence !== undefined) {
			return alphaSequence;
		}

		const font = __VelaValue.parseFont(trimmed);
		if (font !== undefined) {
			return font;
		}

		const enumValue = __VelaValue.parseEnumValue(trimmed);
		if (enumValue !== undefined) {
			return enumValue;
		}

		if (trimmed === "true") {
			return true;
		}

		if (trimmed === "false") {
			return false;
		}

		const numeric = __VelaLua.toNumber(trimmed);
		if (numeric !== undefined && __VelaLua.stringLength(trimmed) > 0) {
			return numeric;
		}

		return value;
	}

	export function isWholeNumber(value: number): boolean {
		const rounded = __VelaLua.mathRound(value);
		return __VelaLua.mathAbs(value - rounded) < 1e-9;
	}
}

declare const string: {
	len: (value: string) => number;
	sub: (value: string, start: number, stop?: number) => string;
};

export namespace __VelaLua {
	export const __velaStringLen = string.len;
	export const __velaStringSub = string.sub;

	export function stringLength(value: string): number {
		return __velaStringLen(value);
	}

	export function substring(
		value: string,
		start: number,
		stop?: number,
	): string {
		const resolvedStop =
			stop === undefined
				? undefined
				: stop < 0
					? stringLength(value) + stop
					: stop;

		return __velaStringSub(value, start + 1, resolvedStop);
	}

	export function startsWith(value: string, prefix: string): boolean {
		return substring(value, 0, stringLength(prefix)) === prefix;
	}

	export function endsWith(value: string, suffix: string): boolean {
		const suffixLength = stringLength(suffix);
		return substring(value, stringLength(value) - suffixLength) === suffix;
	}

	export function lastIndexOf(value: string, needle: string): number {
		for (
			let index = stringLength(value) - stringLength(needle);
			index >= 0;
			index--
		) {
			if (substring(value, index, index + stringLength(needle)) === needle) {
				return index;
			}
		}

		return -1;
	}

	export function includesChar(value: string, char: string): boolean {
		for (let index = 0; index < stringLength(value); index++) {
			if (substring(value, index, index + 1) === char) {
				return true;
			}
		}

		return false;
	}

	export function trim(value: string): string {
		let start = 0;
		let stop = stringLength(value);

		while (start < stop && isWhitespace(substring(value, start, start + 1))) {
			start++;
		}

		while (stop > start && isWhitespace(substring(value, stop - 1, stop))) {
			stop--;
		}

		return substring(value, start, stop);
	}

	export function splitWhitespace(value: string): string[] {
		const tokens: string[] = [];
		let tokenStart: number | undefined;
		const length = stringLength(value);

		for (let index = 0; index < length; index++) {
			const character = substring(value, index, index + 1);
			if (isWhitespace(character)) {
				if (tokenStart !== undefined) {
					tokens.push(substring(value, tokenStart, index));
					tokenStart = undefined;
				}
			} else if (tokenStart === undefined) {
				tokenStart = index;
			}
		}

		if (tokenStart !== undefined) {
			tokens.push(substring(value, tokenStart));
		}

		return tokens;
	}

	export function splitBy(value: string, separator: string): string[] {
		const pieces: string[] = [];
		let pieceStart = 0;
		const length = stringLength(value);
		const separatorLength = stringLength(separator);

		for (let index = 0; index <= length - separatorLength; index++) {
			if (substring(value, index, index + separatorLength) === separator) {
				pieces.push(substring(value, pieceStart, index));
				pieceStart = index + separatorLength;
				index = pieceStart - 1;
			}
		}

		pieces.push(substring(value, pieceStart));
		return pieces;
	}

	/// `splitBy` for a value that nests: a comma inside `Color3.fromRGB(…)` or
	/// inside a quoted font family is part of an argument, not a separator.
	export function splitTopLevel(value: string, separator: string): string[] {
		const pieces: string[] = [];
		let pieceStart = 0;
		let depth = 0;
		let quote: string | undefined;
		const length = stringLength(value);

		for (let index = 0; index < length; index++) {
			const char = substring(value, index, index + 1);

			if (quote !== undefined) {
				if (char === quote) {
					quote = undefined;
				}
				continue;
			}

			if (char === '"' || char === "'") {
				quote = char;
			} else if (char === "(" || char === "[") {
				depth++;
			} else if (char === ")" || char === "]") {
				depth--;
			} else if (char === separator && depth === 0) {
				pieces.push(substring(value, pieceStart, index));
				pieceStart = index + 1;
			}
		}

		pieces.push(substring(value, pieceStart));
		return pieces.map((piece) => trim(piece));
	}

	export function splitCallArguments(
		value: string,
		prefix: string,
		suffix: string,
	): string[] | undefined {
		if (!startsWith(value, prefix) || !endsWith(value, suffix)) {
			return undefined;
		}

		const body = trim(
			substring(value, stringLength(prefix), -stringLength(suffix)),
		);

		return body === "" ? [] : splitTopLevel(body, ",");
	}

	export function unquote(value: string): string | undefined {
		const length = stringLength(value);
		if (length < 2) {
			return undefined;
		}

		const first = substring(value, 0, 1);
		if (first !== '"' && first !== "'") {
			return undefined;
		}

		return substring(value, length - 1, length) === first
			? substring(value, 1, length - 1)
			: undefined;
	}

	export function splitOnce(
		value: string,
		separator: string,
	): [string, string | undefined] {
		const separatorLength = stringLength(separator);
		for (
			let index = 0;
			index <= stringLength(value) - separatorLength;
			index++
		) {
			if (substring(value, index, index + separatorLength) === separator) {
				return [
					substring(value, 0, index),
					substring(value, index + separatorLength),
				];
			}
		}

		return [value, undefined];
	}

	export function parseCallArguments(
		value: string,
		prefix: string,
		suffix: string,
	): string[] | undefined {
		if (!startsWith(value, prefix) || !endsWith(value, suffix)) {
			return undefined;
		}

		const body = substring(value, stringLength(prefix), -stringLength(suffix));
		return splitBy(body, ",").map((entry) => trim(entry));
	}

	export function isWhitespace(value: string): boolean {
		return value === " " || value === "\t" || value === "\n" || value === "\r";
	}

	export function toText(value: string | number): string {
		return tostring?.(value) ?? "";
	}

	// Mirrors `tonumber`, which answers nil for a nil argument: the callers read
	// parsed call arguments, and an index past the end is absent, not a number.
	export function toNumber(value: string | undefined): number | undefined {
		const numeric = tonumber?.(value);

		if (numeric === undefined || isNaNNumber(numeric)) {
			return undefined;
		}

		return numeric;
	}

	export function mathAbs(value: number): number {
		return value < 0 ? -value : value;
	}

	export function mathFloor(value: number): number {
		const remainder = value % 1;
		const truncated = value - remainder;
		return value < 0 && remainder !== 0 ? truncated - 1 : truncated;
	}

	export function mathRound(value: number): number {
		return mathFloor(value + 0.5);
	}

	export function isArrayValue(value: unknown): boolean {
		return typeOf(value) === "table" && arraySize(value as unknown[]) > 0;
	}

	export function isNaNNumber(value: number): boolean {
		return !(value >= 0 || value <= 0);
	}

	export function arraySize<T>(value: T[]): number {
		return value.size();
	}
}
