import { defineConfig, plugin } from "vela-rbxts";

export default defineConfig({
	plugins: [
		plugin(({ addUtilities, setMotionDriver, theme }) => {
			setMotionDriver({
				module: "client/motion",
				export: "harnessMotionDriver",
			});

			addUtilities({
				"harness-card": "bg-slate-800 rounded-lg p-2 hover:bg-slate-700",
				"harness-plate": {
					BackgroundColor3: theme("colors.slate.600"),
					BorderSizePixel: "0",
					LayoutOrder: "7",
				},
			});
		}),
	],
});
