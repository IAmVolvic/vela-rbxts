import { Workspace as __VelaWorkspace } from "@rbxts/services";
import type {
	ClassValue,
	RuntimeCamera,
	RuntimeEnvironment,
	RuntimeHelper,
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
	__VelaEnv as __VelaEnvCore,
	__VelaMotion,
	__VelaOpacity as __VelaOpacityCore,
	__VelaRem as __VelaRemCore,
	__VelaResolution,
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

	function watchCamera() {
		cameraConnection?.Disconnect();

		const camera = __VelaWorkspace.CurrentCamera;
		cameraConnection =
			camera === undefined
				? undefined
				: camera.GetPropertyChangedSignal("ViewportSize").Connect(refresh);
	}

	__VelaWorkspace.GetPropertyChangedSignal("CurrentCamera").Connect(() => {
		watchCamera();
		refresh();
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
		for (const [name] of pairs(shape.props as Record<string, unknown>)) {
			bound.add(name as string);
		}
		for (const [name] of pairs(composedProps(shape, preflight))) {
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
			const fallback = statics[name];
			applied[name] = () => {
				const current = resolution();
				if (hostTag !== undefined && alpha < 1) {
					__VelaResolution.composeInheritedOpacity(current, hostTag, alpha);
				}
				const composed = composedProps(current, preflight);
				const resolved = composed[name] ?? current.props[name];
				return resolved ?? fallback;
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
		for (const helper of helperChildren(shape, resolution)) {
			(applied as Record<number, unknown>)[slot] = helper;
			slot += 1;
		}
		if (props.children !== undefined) {
			(applied as Record<number, unknown>)[slot] = props.children;
		}

		if (!instanceCapable) {
			return (tag as (props: never) => Vide.Node)(applied as never);
		}

		return videJsx(hostTag as string, applied);
	};
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

function composedProps(
	resolution: RuntimeResolution,
	preflight: boolean,
): Record<string, unknown> {
	const hostProps: Record<string, unknown> = {};
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
/// Which helpers exist is still fixed here; a rule that introduces one lands
/// with the tracking that would create and destroy it.
function helperChildren(
	shape: RuntimeResolution,
	resolution: () => RuntimeResolution,
): defined[] {
	__VelaApply.applyHelperDefaults(shape.helpers);

	const children: defined[] = [];
	for (const helper of shape.helpers) {
		const tag = helper.tag;
		const initial = __VelaApply.helperToProps(helper.props);
		const props: Record<string, unknown> = {};

		for (const [name, value] of pairs(initial)) {
			const propName = name as string;
			props[propName] = () =>
				helperProps(resolution(), tag)?.[propName] ?? value;
		}

		const child = videJsx(__VelaApply.hostClassName(tag), props);
		if (child !== undefined) {
			children.push(child);
		}
	}

	return children;
}

export type {
	VelaMotionDriver,
	VelaRemScaler,
	VelaRuntimeConfig,
	VelaRuntimeHostComponent,
};
