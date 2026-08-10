import { TweenService as __VelaTweenService } from "@rbxts/services";
import { __VelaLua } from "./lua";
import type {
	RuntimePropValue,
	RuntimeResolution,
	RuntimeTransition,
	RuntimeTransitionState,
	VelaMotionDriver,
	VelaMotionSpec,
} from "./types";

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
