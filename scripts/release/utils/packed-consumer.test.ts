import { describe, expect, test } from "vitest";

import { assertPackedConsumerOutput } from "./packed-consumer";

describe("packed consumer luau assertions", () => {
	test("reports missing required fragments with the emitted file path", () => {
		expect(() => {
			assertPackedConsumerOutput("print(\"hello\")", "out/client/App.luau");
		}).toThrow(
			"Packed consumer Luau output is missing required fragment in out/client/App.luau: BackgroundColor3 = Color3.fromRGB(49, 65, 88)",
		);
	});

	test("reports forbidden fragments with the emitted file path", () => {
		expect(() => {
			assertPackedConsumerOutput(
				[
					"BackgroundColor3 = Color3.fromRGB(49, 65, 88)",
					"Size = __VelaRem.scale(UDim2.fromOffset(320, 108), ",
					"CornerRadius = __VelaRem.scale(UDim.new(0, 6), ",
					"uistroke",
					"Thickness = __VelaRem.scale(1, ",
					"Thickness = __VelaRem.scale(2, ",
					"Color = Color3.fromRGB(98, 116, 142)",
					"Color3.fromRGB(21, 93, 252)",
					"PaddingLeft = __VelaRem.scale(UDim.new(0, 16), ",
					"PaddingRight = __VelaRem.scale(UDim.new(0, 16), ",
					"PaddingTop = __VelaRem.scale(UDim.new(0, 12), ",
					"PaddingBottom = __VelaRem.scale(UDim.new(0, 12), ",
					"Padding = __VelaRem.scale(UDim.new(0, 16), ",
					'"node_modules", "@rbxts", "vela-runtime"',
					"local VelaRuntimeHost = createVelaRuntimeHost(",
					"React.createElement(VelaRuntimeHost",
					"__velaRules",
					"__velaTag",
					"rbxts-tailwind",
				].join("\n"),
				"out/client/App.luau",
			);
		}).toThrow(
			"Packed consumer Luau output contains forbidden fragment in out/client/App.luau: rbxts-tailwind",
		);
	});
});
