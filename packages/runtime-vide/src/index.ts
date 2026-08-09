import { Workspace as __VelaWorkspace } from "@rbxts/services";
import type {
	ClassValue,
	RuntimeCamera,
	RuntimeDivide,
	RuntimeEnvironment,
	RuntimeMargin,
	RuntimePropValue,
	RuntimeRemConfig,
	RuntimeResolution,
	RuntimeRule,
	VariantEventBinding,
	VelaMotionDriver,
	VelaRuntimeConfig,
	VelaRuntimeTag,
} from "@rbxts/vela-runtime-core";
import {
	__VelaApply,
	__VelaDivide,
	__VelaEnv as __VelaEnvCore,
	__VelaMargin,
	__VelaMotion,
	__VelaOpacity as __VelaOpacityCore,
	__VelaRem as __VelaRemCore,
	__VelaResolution,
	__VelaValue,
	__VelaVariant,
} from "@rbxts/vela-runtime-core";
import Vide from "@rbxts/vide";

/// `create()` hands its tag straight to `Instance.new()`, so the lowercase tags
/// the transformer writes only resolve through `jsx`, which carries the
/// ReflectionService map — and the `action`/`*Changed` pass-through with it.
/// It is absent from @rbxts/vide's published types.
const videJsx = (
	Vide as unknown as {
		jsx: (tag: string, props: object) => Vide.Node;
	}
).jsx;

type VelaRemScaler = {
	scale: <T>(value: T, slot: number) => () => T;
	scaleText: (value: number, slot: number) => () => number;
};

type VelaRuntimeHostProps = {
	__velaTag: VelaRuntimeTag;
	__velaRules?: readonly RuntimeRule[];
	/// The React host is handed booleans, because a re-render brings the next
	/// ones. Nothing re-runs this component, so each test arrives as a thunk.
	__velaTests?: readonly (() => boolean)[];
	__velaRem?: readonly string[];
	__velaDivide?: RuntimeDivide;
	__velaMargin?: RuntimeMargin;
	__velaOpacity?: number;
	className?: ClassValue | (() => ClassValue);
	children?: Vide.Node;
} & Record<string, unknown>;

type VelaRuntimeHostComponent = (props: VelaRuntimeHostProps) => Vide.Node;

/// One reading of the viewport for the whole place, as a source rather than a
/// per-component subscription: every host derives from it, and Vide only reruns
/// the ones whose resolution actually reads what changed. Rem is a field of it,
/// so the scaler reads the same source rather than keeping a second one.
namespace __VelaEnvSource {
	function read(): RuntimeEnvironment {
		return __VelaEnvCore.readRuntimeEnvironment(
			__VelaWorkspace.CurrentCamera as RuntimeCamera | undefined,
		);
	}

	const state = Vide.source(read());
	let cameraConnection: RBXScriptConnection | undefined;

	function refresh() {
		state(read());
	}

	/// Every consumer re-derives off a set, so a resize goes through the
	/// debounce rather than landing a frame's worth of intermediate sizes.
	const viewport = __VelaEnvCore.debounceViewport(refresh);

	function watchCamera() {
		cameraConnection?.Disconnect();

		const camera = __VelaWorkspace.CurrentCamera;
		cameraConnection =
			camera === undefined
				? undefined
				: camera
						.GetPropertyChangedSignal("ViewportSize")
						.Connect(viewport.call);
	}

	__VelaWorkspace.GetPropertyChangedSignal("CurrentCamera").Connect(() => {
		watchCamera();
		viewport.call();
	});
	watchCamera();

	// This module is loaded by the emitted preamble, which only then calls the
	// factory that configures the curve — so the first read above used the
	// default one. Without this the correction would be left to whichever
	// viewport signal happened to fire next.
	__VelaRemCore.whenConfigured(refresh);

	export const current = state as () => RuntimeEnvironment;
}

namespace __VelaRemSource {
	function ratio(): number {
		return __VelaRemCore.ratio(__VelaEnvSource.current().rem);
	}

	/// No slot table: a thunk costs nothing to rebuild, and React needed one
	/// only because a fresh binding reads as a new subscription.
	export function scaler(): VelaRemScaler {
		function scale<T>(value: T, _slot: number): () => T {
			return () => __VelaRemCore.apply(value as never, ratio()) as never;
		}

		function scaleText(value: number, _slot: number): () => number {
			return () => math.min(value * ratio(), __VelaRemCore.TEXT_SIZE_CEILING);
		}

		return { scale, scaleText };
	}
}

/// What a module gets when it scales an offset without needing the host. The
/// curve is configured here rather than at import time because a file can reach
/// rem without ever constructing the host that would otherwise carry the config.
export function createVelaRemScaler(config?: RuntimeRemConfig): VelaRemScaler {
	__VelaRemCore.configure(config);

	return __VelaRemSource.scaler();
}

export namespace __VelaOpacity {
	const Context = Vide.context(1);

	type ProviderProps = { value: number; children: () => Vide.Node };

	/// Multiplied here rather than at the context, where the inner value would
	/// simply win.
	export const Provider = (props: ProviderProps) => {
		const total = Context() * props.value;

		return Context(total, props.children);
	};

	/// React clones the element to fold the inherited alpha in. Vide has already
	/// built the instance by the time this runs, so it is applied instead.
	export function Fade(props: { children?: Vide.Node }): Vide.Node {
		return applyAlpha(props.children, Context());
	}

	function applyAlpha(node: Vide.Node, alpha: number): Vide.Node {
		if (alpha >= 1) {
			return node;
		}

		if (!typeIs(node, "Instance")) {
			return node;
		}

		const faded: Record<string, unknown> = {};
		for (const name of __VelaOpacityCore.transparencyProps(
			node.ClassName.lower(),
		)) {
			const current = (node as unknown as Record<string, number>)[name];
			if (typeIs(current, "number")) {
				faded[name] = __VelaOpacityCore.compose(current, alpha);
			}
		}

		return Vide.apply(node)(faded as never);
	}
}

export function createVelaRuntimeHost(
	config: VelaRuntimeConfig,
	motionDriver?: VelaMotionDriver,
) {
	if (motionDriver !== undefined) {
		__VelaMotion.setDriver(motionDriver);
	}

	__VelaRemCore.configure(config.theme.rem);

	const theme = __VelaEnvCore.normalizeTheme(config);
	const preflight = config.preflight;

	return (props: VelaRuntimeHostProps): Vide.Node => {
		const tag = props.__velaTag;
		const instanceCapable = typeIs(tag, "string");
		const hostTag = instanceCapable ? (tag as string) : undefined;
		const rules = (props.__velaRules ?? []) as RuntimeRule[];
		const tests = props.__velaTests ?? [];
		const rawClassName = props.className;

		const hovered = Vide.source(false);
		const pressed = Vide.source(false);
		const focused = Vide.source(false);

		function environment(): RuntimeEnvironment {
			const base = __VelaEnvSource.current();
			const readTests: boolean[] = [];
			for (const test of tests) {
				readTests.push(test());
			}

			return {
				width: base.width,
				rem: base.rem,
				orientation: base.orientation,
				input: base.input,
				colorScheme: base.colorScheme,
				hovered: hovered(),
				pressed: pressed(),
				focused: focused(),
				tests: readTests,
			};
		}

		function className(): ClassValue {
			return typeIs(rawClassName, "function")
				? (rawClassName as () => ClassValue)()
				: (rawClassName as ClassValue);
		}

		const resolution = Vide.derive(() =>
			__VelaResolution.resolveRuntimeResolution(
				theme,
				environment(),
				rules,
				className(),
				preflight,
				hostTag,
			),
		);

		const statics: Record<string, unknown> = {};
		for (const [key, value] of pairs(props as Record<string, unknown>)) {
			const name = key as string;
			if (
				name !== "__velaTag" &&
				name !== "__velaRules" &&
				name !== "__velaTests" &&
				name !== "__velaRem" &&
				name !== "__velaDivide" &&
				name !== "__velaMargin" &&
				name !== "__velaOpacity" &&
				name !== "className" &&
				name !== "children"
			) {
				statics[name] = value;
			}
		}

		// Which props the resolution can write is fixed by the class list and the
		// rules, both of which are known here. Reading it once untracked is what
		// turns that into the set of names to bind.
		const shape = Vide.untrack(() => resolution());
		const bound = new Set<string>();
		const remProps = new Set<string>();
		for (const name of props.__velaRem ?? []) {
			bound.add(name);
			remProps.add(name);
		}
		if (statics.TextSize !== undefined) {
			bound.add("TextSize");
		}

		// A composer fills the axis a rule left out from what the element already
		// declares — `md:w-1/2` beside a static `h-6` — so it has to be handed
		// those props rather than an empty table.
		function declaredProps(
			current: RuntimeResolution,
		): Record<string, unknown> {
			const remRatio = current.remRatio ?? 1;
			const declared: Record<string, unknown> = {};

			for (const [name, value] of pairs(statics)) {
				const raw = readDerivable(value);
				if (raw === undefined) {
					continue;
				}
				declared[name as string] =
					remRatio !== 1 && remProps.has(name as string)
						? __VelaRemCore.apply(raw as RuntimePropValue, remRatio)
						: raw;
			}

			return declared;
		}

		for (const [name] of pairs(shape.props as Record<string, unknown>)) {
			bound.add(name as string);
		}
		// Discovered from the resolution alone: seeding here would bind every
		// static the element was handed, and a handler bound as a thunk is what
		// Vide would connect to the signal.
		for (const [name] of pairs(composedProps(shape, preflight, {}))) {
			bound.add(name as string);
		}
		for (const rule of rules) {
			for (const entry of rule.effects.props) {
				bound.add(COMPOSED_BY_CONTRIBUTOR[entry.name] ?? entry.name);
			}
		}

		const applied: Record<string, unknown> = {};
		for (const [name, value] of pairs(statics)) {
			applied[name as string] = value;
		}

		const alpha = props.__velaOpacity ?? 1;

		for (const name of bound) {
			applied[name] = () => {
				const current = resolution();
				if (hostTag !== undefined && alpha < 1) {
					__VelaResolution.composeInheritedOpacity(current, hostTag, alpha);
				}
				const composed = composedProps(
					current,
					preflight,
					declaredProps(current),
				);
				const value = composed[name];

				return name === "TextSize" && typeIs(value, "number")
					? math.min(value, __VelaRemCore.TEXT_SIZE_CEILING)
					: value;
			};
		}

		// Which states the class list reads is fixed by the list and the rules,
		// so the snapshot answers it. The trackers compose onto whatever handler
		// the consumer already wrote.
		if (instanceCapable) {
			const bindings: VariantEventBinding[] = [];
			if (shape.usesHover === true) {
				for (const binding of __VelaVariant.hoverTracking(hovered)) {
					bindings.push(binding);
				}
			}
			if (shape.usesActive === true) {
				for (const binding of __VelaVariant.activeTracking(pressed)) {
					bindings.push(binding);
				}
			}
			if (shape.usesFocus === true) {
				for (const binding of __VelaVariant.focusTracking(tag, focused)) {
					bindings.push(binding);
				}
			}

			// Vide writes a handler under the property name itself, and composes
			// onto whatever the consumer already put there.
			for (const binding of bindings) {
				const previous = applied[binding.name];
				applied[binding.name] = (...args: unknown[]) => {
					binding.handler(...args);
					if (typeIs(previous, "function")) {
						(previous as (...args: unknown[]) => void)(...args);
					}
				};
			}
		}

		let slot = 1;
		(applied as Record<number, unknown>)[slot] = helperChildren(
			shape,
			rules,
			resolution,
		);
		slot += 1;

		function currentDivide(): RuntimeDivide | undefined {
			const current = resolution();
			return __VelaDivide.resolveDivideConfig(
				props.__velaDivide,
				current.divide,
				current.remRatio ?? 1,
			);
		}

		// A separator carries resolved values like a helper does, so its own
		// props follow the resolution. Whether it exists at all is fixed here.
		const divide = Vide.untrack(currentDivide);
		if (divide !== undefined) {
			const separator = () =>
				videJsx("frame", {
					BackgroundColor3: () => divideColor(currentDivide() ?? divide),
					BackgroundTransparency: () =>
						(currentDivide() ?? divide).transparency ?? 0,
					BorderSizePixel: 0,
					Size: () => divideSize(currentDivide() ?? divide),
				});

			for (const child of interleaveDivideSeparators(
				separator,
				flattenChildren(props.children),
			)) {
				(applied as Record<number, unknown>)[slot] = child;
				slot += 1;
			}
		} else if (props.children !== undefined) {
			(applied as Record<number, unknown>)[slot] = props.children;
		}

		const renderElement = () =>
			instanceCapable
				? videJsx(hostTag as string, applied)
				: (tag as (props: never) => Vide.Node)(applied as never);
		const wrapsMargin =
			props.__velaMargin !== undefined ||
			shape.margin !== undefined ||
			rawClassName !== undefined;
		if (!wrapsMargin) {
			return renderElement();
		}

		const margin = () => {
			const current = resolution();
			return __VelaMargin.resolveMarginConfig(
				props.__velaMargin,
				current.margin,
				current.remRatio ?? 1,
			);
		};
		const wrapperProps = prepareMarginWrapper(margin, applied);
		const padding = videJsx("uipadding", {
			PaddingTop: () => new UDim(0, margin()?.top ?? 0),
			PaddingRight: () => new UDim(0, margin()?.right ?? 0),
			PaddingBottom: () => new UDim(0, margin()?.bottom ?? 0),
			PaddingLeft: () => new UDim(0, margin()?.left ?? 0),
		});

		return videJsx("frame", {
			...wrapperProps,
			[1]: padding,
			[2]: renderElement(),
		});
	};
}

function readDerivable(value: unknown): unknown {
	return typeIs(value, "function") ? (value as () => unknown)() : value;
}

function prepareMarginWrapper(
	margin: () => RuntimeMargin | undefined,
	hostProps: Record<string, unknown>,
): Record<string, unknown> {
	const wrapperProps: Record<string, unknown> = {
		BackgroundTransparency: 1,
		BorderSizePixel: 0,
	};

	for (const name of __VelaMargin.MARGIN_WRAPPER_PROPS) {
		const value = hostProps[name];
		if (value !== undefined) {
			wrapperProps[name] = value;
			hostProps[name] = undefined;
		}
	}

	const declaredSize = wrapperProps.Size;
	const automaticSize = hostProps.AutomaticSize;
	if (declaredSize !== undefined) {
		wrapperProps.Size = () => {
			const size = readDerivable(declaredSize);
			const current = margin();
			return typeIs(size, "UDim2")
				? new UDim2(
						size.X.Scale,
						size.X.Offset + (current?.left ?? 0) + (current?.right ?? 0),
						size.Y.Scale,
						size.Y.Offset + (current?.top ?? 0) + (current?.bottom ?? 0),
					)
				: size;
		};
		hostProps.Size = UDim2.fromScale(1, 1);
	} else if (automaticSize !== undefined) {
		wrapperProps.AutomaticSize = automaticSize;
	} else {
		wrapperProps.AutomaticSize = Enum.AutomaticSize.XY;
	}

	return wrapperProps;
}

/// A rule can name an axis rather than a property: `md:w-1/2` writes `SizeX`,
/// which the composers fold into `Size`. Written straight through it would
/// reach the instance, where no such member exists.
const COMPOSED_BY_CONTRIBUTOR: Record<string, string> = {
	SizeX: "Size",
	SizeY: "Size",
	PositionX: "Position",
	PositionY: "Position",
	TranslateX: "Position",
	TranslateY: "Position",
};

function divideColor(divide: RuntimeDivide): Color3 {
	return (
		(divide.color !== undefined
			? __VelaValue.parseColor3(divide.color)
			: undefined) ?? Color3.fromRGB(229, 231, 235)
	);
}

function divideSize(divide: RuntimeDivide): UDim2 {
	return divide.axis === "x"
		? new UDim2(0, divide.thickness, 1, 0)
		: new UDim2(1, 0, 0, divide.thickness);
}

/// Vide hands a component its children as the node itself, or as a plain array
/// when there is more than one. Interleaving needs them one by one, so the
/// arrays are opened up — but only the plain ones: an action is a table too,
/// and it is the metatable that tells them apart.
function flattenChildren(node: unknown): defined[] {
	const flat: defined[] = [];

	function walk(value: unknown) {
		if (value === undefined) {
			return;
		}
		if (typeIs(value, "table") && getmetatable(value) === undefined) {
			for (const [key, entry] of pairs(value as Record<string, unknown>)) {
				if (typeIs(key, "number")) {
					walk(entry);
				}
			}
			return;
		}
		flat.push(value as defined);
	}

	walk(node);

	return flat;
}

/// Separators go between consecutive children that take a layout slot. A child
/// Vide has already built answers that itself; anything else — a thunk, a
/// binding — is taken at its word and counted as content.
function interleaveDivideSeparators(
	separator: () => Vide.Node,
	children: defined[],
): defined[] {
	const result: defined[] = [];
	let seenContentChild = false;

	for (const child of children) {
		if (typeIs(child, "Instance") && child.IsA("UIBase")) {
			result.push(child);
			continue;
		}
		if (seenContentChild) {
			const between = separator();
			if (between !== undefined) {
				result.push(between as defined);
			}
		}
		seenContentChild = true;
		result.push(child);
	}

	return result;
}

function composedProps(
	resolution: RuntimeResolution,
	preflight: boolean,
	declared: Record<string, unknown>,
): Record<string, unknown> {
	const hostProps: Record<string, unknown> = {};
	for (const [name, value] of pairs(declared)) {
		hostProps[name as string] = value;
	}
	for (const [name, value] of pairs(resolution.props)) {
		hostProps[name as string] = value;
	}
	__VelaApply.applyComposedResolution(hostProps, resolution, preflight);

	return hostProps;
}

function helperProps(
	resolution: RuntimeResolution,
	tag: string,
): Record<string, unknown> | undefined {
	__VelaApply.applyHelperDefaults(resolution.helpers);

	for (const helper of resolution.helpers) {
		if (helper.tag === tag) {
			return __VelaApply.helperToProps(helper.props);
		}
	}

	return undefined;
}

/// A helper carries resolved values like any other prop — a `p-4` padding
/// follows rem, and a variant can repaint a stroke. Built from the snapshot
/// alone they would freeze at creation, which for rem means freezing at the
/// 1x1 viewport the first frame has not replaced yet.
///
/// Every tag a rule could ever ask for is built here rather than when the rule
/// first fires, because Vide refuses to open a reactive scope inside one — and
/// a helper built inside the children effect is exactly that. What the returned
/// thunk leaves out, Vide unparents; `hover:rounded-lg` costs one UICorner that
/// spends most of its life detached.
function helperChildren(
	shape: RuntimeResolution,
	rules: readonly RuntimeRule[],
	resolution: () => RuntimeResolution,
): () => defined[] {
	__VelaApply.applyHelperDefaults(shape.helpers);

	const tags: string[] = [];
	const instances = new Map<string, defined>();

	function build(tag: string) {
		if (instances.has(tag)) {
			return;
		}

		const child = videJsx(__VelaApply.hostClassName(tag), {});
		if (child === undefined) {
			return;
		}

		// One effect for the whole helper rather than a thunk per prop: which
		// props it carries is a rule's to change, and a name the resolution has
		// dropped must keep its last value rather than be written back as nil.
		Vide.effect(() => {
			const props = helperProps(resolution(), tag);
			if (props === undefined) {
				return;
			}
			for (const [name, value] of pairs(props)) {
				(child as unknown as Record<string, unknown>)[name as string] = value;
			}
		});

		tags.push(tag);
		instances.set(tag, child as defined);
	}

	for (const helper of shape.helpers) {
		build(helper.tag);
	}
	for (const rule of rules) {
		for (const helper of rule.effects.helpers) {
			build(helper.tag);
		}
	}

	return () => {
		const current = resolution();
		__VelaApply.applyHelperDefaults(current.helpers);

		const present = new Set<string>();
		for (const helper of current.helpers) {
			present.add(helper.tag);
		}

		// Ordered by the tags as they were built, so a helper that comes and goes
		// does not reshuffle its siblings.
		const children: defined[] = [];
		for (const tag of tags) {
			const child = present.has(tag) ? instances.get(tag) : undefined;
			if (child !== undefined) {
				children.push(child);
			}
		}

		return children;
	};
}

export type {
	VelaMotionDriver,
	VelaRemScaler,
	VelaRuntimeConfig,
	VelaRuntimeHostComponent,
};
