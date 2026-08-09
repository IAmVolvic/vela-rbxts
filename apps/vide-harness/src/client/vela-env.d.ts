import type { ClassValue } from "vela-rbxts";

// Phase 0 probe: React's seam is `React.Attributes`. Vide's analogue is
// `Vide.Attributes`, which `ActionAttributes` carries to every intrinsic and
// `JSX.IntrinsicAttributes` carries to every component. Vide is an `export =`
// namespace with a UMD global, so which augmentation spelling actually merges
// is what this file answers.
declare global {
	namespace Vide {
		interface Attributes {
			className?: ClassValue | (() => ClassValue);
		}
	}
}
