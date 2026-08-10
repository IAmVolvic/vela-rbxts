import { __VelaColor } from "./color";
import { __VelaDefaults } from "./defaults";
import { __VelaLua } from "./lua";
import { __VelaOpacity } from "./opacity";
import type {
	RuntimePropValue,
	RuntimeResolvedEffectBundle,
	RuntimeResolvedPropEntry,
	RuntimeTheme,
} from "./types";
import { __VelaValue } from "./value";

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

	export function colorPropEffect(
		theme: RuntimeTheme,
		key: string,
		colorProp: string,
		transparencyProp: string | undefined,
	): RuntimeResolvedEffectBundle | undefined {
		const [base, opacity] = __VelaColor.splitColorOpacity(key);
		const resolved = __VelaColor.resolveThemeColor(theme, base);
		if (resolved === undefined) {
			return undefined;
		}

		if (resolved.color === undefined) {
			return transparencyProp === undefined
				? undefined
				: propEffect(transparencyProp, 1);
		}

		const props: RuntimeResolvedPropEntry[] = [
			{ name: colorProp, value: resolved.color },
		];
		if (transparencyProp !== undefined && opacity !== undefined) {
			props.push({
				name: transparencyProp,
				value: __VelaValue.opacityToTransparency(opacity),
			});
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

			return colorPropEffect(theme, key, "TextColor3", "TextTransparency");
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
			return colorPropEffect(
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
			return colorPropEffect(
				theme,
				__VelaLua.substring(token, __VelaLua.stringLength("image-")),
				"ImageColor3",
				"ImageTransparency",
			);
		}

		if (__VelaLua.startsWith(token, "placeholder-")) {
			return colorPropEffect(
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
			const prop = __VelaValue.resolveJustifyProp(
				__VelaLua.substring(token, __VelaLua.stringLength("justify-")),
			);
			return prop === undefined
				? undefined
				: helperEffect("uilistlayout", [prop]);
		}

		if (__VelaLua.startsWith(token, "items-")) {
			const prop = __VelaValue.resolveAlignItemsProp(
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
			return colorPropEffect(
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
						: __VelaValue.opacityToTransparency(opacity),
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
				value: __VelaValue.opacityToTransparency(opacity),
			});
		}

		return helperEffect("uishadow", props);
	}
}
