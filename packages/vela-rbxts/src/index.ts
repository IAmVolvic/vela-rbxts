import type { ClassValue } from "@vela-rbxts/types";

export {
	defaultConfig,
	defineConfig,
	type MotionDriver,
	type PluginApi,
	type PluginHandler,
	type PluginPropMap,
	type PluginUtilities,
	type PluginUtilityValue,
	plugin,
	type ResolvedPlugins,
	type TailwindConfig,
	type TailwindConfigInput,
	type VelaPlugin,
} from "@vela-rbxts/config";

export { createRbxtscTransformerBridge as createTransformer } from "@vela-rbxts/rbxtsc-host";
export type {
	ClassValue,
	StylableProps,
} from "@vela-rbxts/types";

declare global {
	namespace React {
		interface Attributes {
			className?: ClassValue;
		}
	}

	// Vide's analogue of `React.Attributes`: `ActionAttributes` carries it to
	// every intrinsic and `JSX.IntrinsicAttributes` to every component. It is a
	// UMD global, so this is where the augmentation merges. A Vide prop may be
	// a source, and a class value is no exception.
	namespace Vide {
		interface Attributes {
			className?: ClassValue | (() => ClassValue);
		}
	}
}
