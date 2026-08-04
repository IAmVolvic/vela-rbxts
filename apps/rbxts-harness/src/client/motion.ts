import { TweenService } from "@rbxts/services";

// The spec names the Roblox enum members directly, so the driver indexes them
// rather than keeping a table of its own to drift out of date.
const EASING_STYLES = Enum.EasingStyle as unknown as Record<
	string,
	Enum.EasingStyle | undefined
>;

const EASING_DIRECTIONS = Enum.EasingDirection as unknown as Record<
	string,
	Enum.EasingDirection | undefined
>;

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
			EASING_DIRECTIONS[spec.direction] ?? Enum.EasingDirection.Out,
			0,
			false,
			spec.delay,
		);

		TweenService.Create(instance, info, goal as never).Play();
	},
};
