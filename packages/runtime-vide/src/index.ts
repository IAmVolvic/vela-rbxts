import { Workspace as __VelaWorkspace } from "@rbxts/services";
import type {
	ClassValue,
	RuntimeCamera,
	RuntimeEnvironment,
	RuntimeHelper,
	RuntimeRemConfig,
	RuntimeResolution,
	RuntimeRule,
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
/// the ones whose resolution actually reads what changed.
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

	export const current = state as () => RuntimeEnvironment;
	export const reread = refresh;
}

/// The rem curve lives in the core; this is the source a Vide tree reads it
/// through. There is no slot table because a thunk costs nothing to rebuild —
/// React needed one only because a fresh binding reads as a new subscription.
namespace __VelaRemSource {
	const rem = Vide.source(__VelaRemCore.resolve(undefined));

	function refresh() {
		rem(
			__VelaRemCore.resolve(
				__VelaWorkspace.CurrentCamera as RuntimeCamera | undefined,
			),
		);
	}

	let connected = false;

	function connect() {
		if (connected) {
			return;
		}

		connected = true;
		let cameraConnection: RBXScriptConnection | undefined;

		const watch = () => {
			cameraConnection?.Disconnect();
			const camera = __VelaWorkspace.CurrentCamera;
			cameraConnection =
				camera === undefined
					? undefined
					: camera.GetPropertyChangedSignal("ViewportSize").Connect(refresh);
		};

		__VelaWorkspace.GetPropertyChangedSignal("CurrentCamera").Connect(() => {
			watch();
			refresh();
		});
		watch();
		refresh();
	}

	__VelaRemCore.whenConfigured(() => {
		if (connected) {
			refresh();
		}
	});

	export function ratio(): number {
		return __VelaRemCore.ratio(rem());
	}

	export function scaler(): VelaRemScaler {
		connect();

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
				// Interaction variants land with the tracking that drives them.
				hovered: false,
				pressed: false,
				focused: false,
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

		let slot = 1;
		for (const helper of helperChildren(shape.helpers)) {
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

function helperChildren(helpers: RuntimeHelper[]): defined[] {
	__VelaApply.applyHelperDefaults(helpers);

	const children: defined[] = [];
	for (const helper of helpers) {
		const child = videJsx(
			__VelaApply.hostClassName(helper.tag),
			__VelaApply.helperToProps(helper.props),
		);
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
