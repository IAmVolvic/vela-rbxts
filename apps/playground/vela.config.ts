import { defineConfig } from "vela-rbxts";

export default defineConfig({
	theme: {
		extend: {
			colors: {
				surface: "Color3.fromRGB(22, 26, 34)",
				panel: "Color3.fromRGB(31, 37, 48)",
			},
			radius: {
				panel: "new UDim(0, 10)",
			},
		},
	},
});
