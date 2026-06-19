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
					"Size = UDim2.fromOffset(320, 108)",
					"CornerRadius = UDim.new(0, 6)",
					"uistroke",
					"Thickness = 1",
					"Thickness = 2",
					"Color = Color3.fromRGB(98, 116, 142)",
					"Color3.fromRGB(21, 93, 252)",
					"PaddingLeft = UDim.new(0, 16)",
					"PaddingRight = UDim.new(0, 16)",
					"PaddingTop = UDim.new(0, 12)",
					"PaddingBottom = UDim.new(0, 12)",
					"Padding = UDim.new(0, 16)",
					"__createVelaRuntimeHost",
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
