import { __VelaColor } from "./color";
import { __VelaLua } from "./lua";
import type {
	RuntimeDivide,
	RuntimeDivideState,
	RuntimeResolution,
	RuntimeTheme,
} from "./types";
import { __VelaValue } from "./value";

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
					state.transparency = __VelaValue.opacityToTransparency(opacity);
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
