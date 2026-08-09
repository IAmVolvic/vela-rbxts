import { Workspace } from "@rbxts/services";
import Vide from "@rbxts/vide";

// Phase 0 prototype of what `@rbxts/vela-runtime-vide` has to be. Only the
// shapes the spike exercises are implemented: rem scaling, the opacity fade,
// and a host that handles hover/test/width rules. Everything the React runtime
// resolves through parsing and theme lookup is stubbed down to the few literal
// forms the sample output actually emits.

// `create()` calls `Instance.new(tag)` verbatim, so a lowercase `__velaTag`
// dies there. Only `jsx` carries the ReflectionService lowercase map — and the
// `action`/`*Changed` pass-through with it — so the host routes through it.
// It is missing from @rbxts/vide's published index.d.ts.
const videJsx = (
	Vide as unknown as { jsx: (tag: string, props: object) => Vide.Node }
).jsx;

export type RuntimeCondition =
	| { kind: "hover" }
	| { kind: "pressed" }
	| { kind: "test"; index: number; expected: boolean }
	| { kind: "width"; alias: string; minWidth: number };

export type RuntimeRule = {
	condition: RuntimeCondition;
	effects: {
		props: Array<{ name: string; value: string }>;
		helpers: Array<unknown>;
	};
};

export type VelaHostProps = {
	__velaTag: string;
	__velaRules?: Array<RuntimeRule>;
	// The React target passes evaluated booleans. Vide has no re-render, so a
	// test has to arrive as a thunk or the rule it gates never re-evaluates.
	__velaTests?: Array<() => boolean>;
	children?: Vide.Node;
	[prop: string]: unknown;
};

function parseValue(source: string): unknown {
	const rgb = source.match("^Color3%.fromRGB%((%d+), (%d+), (%d+)%)$");
	if (rgb[0] !== undefined) {
		return Color3.fromRGB(
			tonumber(rgb[0]) as number,
			tonumber(rgb[1]) as number,
			tonumber(rgb[2]) as number,
		);
	}

	const udim = source.match("^new UDim%(([%d%.%-]+), ([%d%.%-]+)%)$");
	if (udim[0] !== undefined) {
		return new UDim(tonumber(udim[0]) as number, tonumber(udim[1]) as number);
	}

	const literal = tonumber(source);
	return literal !== undefined ? literal : source;
}

namespace Environment {
	const viewportWidth = Vide.source(
		Workspace.CurrentCamera?.ViewportSize.X ?? 0,
	);

	function watch(camera: Camera | undefined) {
		if (camera === undefined) {
			return;
		}
		viewportWidth(camera.ViewportSize.X);
		camera
			.GetPropertyChangedSignal("ViewportSize")
			.Connect(() => viewportWidth(camera.ViewportSize.X));
	}

	watch(Workspace.CurrentCamera);
	Workspace.GetPropertyChangedSignal("CurrentCamera").Connect(() =>
		watch(Workspace.CurrentCamera),
	);

	export const width = viewportWidth as () => number;
}

export type VelaRemScaler = {
	scale: <T>(value: T, slot: number) => () => T;
};

export function createVelaRemScaler(config: {
	base: number;
	min: number;
	max: number;
	baseResolution: { x: number; y: number };
}): VelaRemScaler {
	const ratio = () =>
		math.clamp(
			(config.base * Environment.width()) / config.baseResolution.x,
			config.min,
			config.max,
		) / config.base;

	// React hands back a Binding here. Vide's `Derivable<T>` means the emitted
	// call site can stay byte-identical as long as this returns a thunk.
	return {
		scale: <T,>(value: T, _slot: number) =>
			(() => {
				const factor = ratio();
				if (typeIs(value, "UDim")) {
					return new UDim(value.Scale, value.Offset * factor) as unknown as T;
				}
				if (typeIs(value, "number")) {
					return (value * factor) as unknown as T;
				}
				return value;
			}) as () => T,
	};
}

export namespace __VelaOpacity {
	export const Context = Vide.context(1);

	const TRANSPARENCY: Record<string, Array<string>> = {
		frame: ["BackgroundTransparency"],
		textlabel: ["BackgroundTransparency", "TextTransparency"],
		textbutton: ["BackgroundTransparency", "TextTransparency"],
		imagelabel: ["BackgroundTransparency", "ImageTransparency"],
	};

	// React clones the element to fold the inherited alpha in. Vide has already
	// built the instance by the time this runs, so it is applied instead.
	export function Fade(props: { children?: Vide.Node }): Vide.Node {
		const alpha = Context();
		const child = props.children;

		if (alpha >= 1 || !typeIs(child, "Instance")) {
			return child;
		}

		const channels = TRANSPARENCY[child.ClassName.lower()];
		if (channels === undefined) {
			return child;
		}

		const faded: Record<string, unknown> = {};
		for (const channel of channels) {
			const current = (child as unknown as Record<string, number>)[channel];
			faded[channel] = 1 - (1 - current) * alpha;
		}

		return Vide.apply(child)(faded as never);
	}
}

export function createVelaRuntimeHost(_config: unknown) {
	return (props: VelaHostProps): Vide.Node => {
		const tag = props.__velaTag;
		const rules = props.__velaRules ?? [];
		const tests = props.__velaTests ?? [];

		const hovered = Vide.source(false);
		const pressed = Vide.source(false);

		const statics: Record<string, unknown> = {};
		const children: defined[] = [];
		for (const [key, value] of pairs(props as Record<string, unknown>)) {
			if (
				key !== "__velaTag" &&
				key !== "__velaRules" &&
				key !== "__velaTests" &&
				key !== "children"
			) {
				statics[key as string] = value;
			}
		}
		if (props.children !== undefined) {
			children.push(props.children);
		}

		const matches = (condition: RuntimeCondition) => {
			if (condition.kind === "hover") {
				return hovered();
			}
			if (condition.kind === "pressed") {
				return pressed();
			}
			if (condition.kind === "width") {
				return Environment.width() >= condition.minWidth;
			}
			return (tests[condition.index]?.() ?? false) === condition.expected;
		};

		const resolved = Vide.derive(() => {
			const out = new Map<string, unknown>();
			for (const rule of rules) {
				if (!matches(rule.condition)) {
					continue;
				}
				for (const entry of rule.effects.props) {
					out.set(entry.name, parseValue(entry.value));
				}
			}
			return out;
		});

		const touched = new Set<string>();
		for (const rule of rules) {
			for (const entry of rule.effects.props) {
				touched.add(entry.name);
			}
		}

		const applied: Record<string, unknown> = {};
		for (const [key, value] of pairs(statics)) {
			applied[key as string] = value;
		}

		// A width/hover rule can name `SizeX`, which composes into `Size` rather
		// than being a property of its own.
		const axis = touched.has("SizeX") || touched.has("SizeY");
		if (axis) {
			touched.delete("SizeX");
			touched.delete("SizeY");
			const base = (statics.Size as UDim2 | undefined) ?? new UDim2();
			applied.Size = () => {
				const active = resolved();
				const x = (active.get("SizeX") as UDim | undefined) ?? base.X;
				const y = (active.get("SizeY") as UDim | undefined) ?? base.Y;
				return new UDim2(x.Scale, x.Offset, y.Scale, y.Offset);
			};
		}

		for (const name of touched) {
			const fallback = statics[name];
			applied[name] = () => resolved().get(name) ?? fallback;
		}

		if (tag === "textbutton" || tag === "imagebutton" || tag === "frame") {
			applied.MouseEnter = () => hovered(true);
			applied.MouseLeave = () => {
				hovered(false);
				pressed(false);
			};
		}
		if (tag === "textbutton" || tag === "imagebutton") {
			applied.MouseButton1Down = () => pressed(true);
			applied.MouseButton1Up = () => pressed(false);
		}

		let slot = 1;
		for (const child of children) {
			(applied as Record<number, unknown>)[slot] = child;
			slot += 1;
		}

		return videJsx(tag, applied);
	};
}
