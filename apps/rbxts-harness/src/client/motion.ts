import { TweenService } from "@rbxts/services";

const EASING_STYLES: Record<string, Enum.EasingStyle> = {
	linear: Enum.EasingStyle.Linear,
	quad: Enum.EasingStyle.Quad,
	cubic: Enum.EasingStyle.Cubic,
};

const EASING_DIRECTIONS: Record<string, Enum.EasingDirection> = {
	in: Enum.EasingDirection.In,
	out: Enum.EasingDirection.Out,
	"in-out": Enum.EasingDirection.InOut,
};

/**
 * Replaces the built-in transition driver with one the harness owns, leaving
 * `animate-*` on the built-in presets so the partial-driver fallback is what
 * actually runs. It reproduces the stock tween so the rendered result stays
 * comparable.
 */
export const harnessMotionDriver = {
	transition(
		instance: Instance,
		goal: Record<string, unknown>,
		spec: { time: number; style: string; direction: string; delay: number },
	) {
		const info = new TweenInfo(
			spec.time,
			EASING_STYLES[spec.style] ?? Enum.EasingStyle.Quad,
			EASING_DIRECTIONS[spec.direction] ?? Enum.EasingDirection.InOut,
			0,
			false,
			spec.delay,
		);

		TweenService.Create(instance, info, goal as never).Play();
	},
};
