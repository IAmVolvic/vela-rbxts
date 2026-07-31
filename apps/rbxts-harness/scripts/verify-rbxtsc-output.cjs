const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const transformerModule = require("vela-rbxts/transformer");
const transformer =
	typeof transformerModule === "function"
		? transformerModule
		: transformerModule.default;

const projectRoot = path.join(__dirname, "..");

// A clean build so the transformer runs on every file and its diagnostics all
// land in this invocation's output.
fs.rmSync(path.join(projectRoot, "out"), { recursive: true, force: true });
const build = spawnSync(
	path.join(projectRoot, "node_modules", ".bin", "rbxtsc"),
	["-p", "tsconfig.json"],
	{ cwd: projectRoot, encoding: "utf8" },
);
const buildOutput = `${build.stdout ?? ""}${build.stderr ?? ""}`;

if (build.status !== 0) {
	console.error(buildOutput);
	console.error("rbxtsc build failed");
	process.exit(1);
}

const appLuauPath = path.join(projectRoot, "out", "client", "App.luau");
const source = fs.readFileSync(appLuauPath, "utf8");

const requiredDiagnostics = [
	'Tailwind "m" utilities have no Roblox equivalent, so "m-4" is ignored.',
	'Unknown variant "hover" in "hover:px-4"',
	'Arbitrary value "[#ff0000]" is not supported yet',
	'Color opacity modifier "/50" is not supported',
	'Unsupported utility family "blorb" in className literal.',
];

// Bare `rounded` must resolve to the default radius, not a theme-key error.
const forbiddenDiagnostics = ['"DEFAULT"', "unknown-theme-key"];

const requiredFragments = [
	"CornerRadius = UDim.new(0, 4)",
	"Position = UDim2.new(1, -16, 1, -8)",
	"SortOrder = Enum.SortOrder.LayoutOrder",
	"FillDirectionMaxCells = 3",
	"CellPadding = UDim2.fromOffset(8, 8)",
	"AnchorPoint = Vector2.new(0.5, 0.5)",
	"Position = UDim2.fromScale(0.5, 0.5)",
	"Size = UDim2.fromScale(0.5, 0)",
	"AnchorPoint = Vector2.new(0.5, 0)",
	"Interactable = false",
	"Padding = UDim.new(0, 8)",
	"FillDirection = Enum.FillDirection.Vertical",
	"ApplyStrokeMode = Enum.ApplyStrokeMode.Border",
	"ScaleType = Enum.ScaleType.Crop",
	"LayoutOrder = 2",
	"ItemLineAlignment = Enum.ItemLineAlignment.Center",
	"VerticalFlex = Enum.UIFlexAlignment.SpaceBetween",
	"LineHeight = 1.25",
	"Enum.FontWeight.Bold",
	"Enum.FontStyle.Italic",
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
	"__velaTransition",
	"TweenService",
	'__velaAnimation = "spin"',
	"startPresetAnimation",
	'Text = "<u>STATIC &amp; &lt;STYLED&gt;</u>"',
	"RichText = true",
	"__velaText",
	'transform = "capitalize"',
	'decoration = "strike"',
	"applyTextConfig",
];

// Intentional regression checks for the deleted runtime package and artifact paths.
const forbiddenFragments = [
	"Color3.fromRGB(255, 0, 0)",
	'React.createElement("RbxtsTailwindRuntimeHost"',
	"__rbxtsTailwindRuntimeHost",
	"RbxtsTailwindRuntimeHost",
	"__rbxtsTailwindRules",
	"__rbxtsTailwindTag",
	"rbxts-tailwind",
	"rbxtsTailwind",
	"createTailwindRuntimeHost",
	".size(",
	":size(",
	"size()",
	'className = { "bg-blue-600", active and "rounded-md" }',
	"@vela-rbxts/runtime",
	"vela-rbxts/runtime",
	"__vela__",
	"runtime-host",
	'"node_modules", "@vela-rbxts"',
	" as never",
];

const requiredPatterns = [
	{
		description: "runtime helper is inlined into the Luau output",
		pattern: /__createVelaRuntimeHost/,
	},
	{
		description: "transition config reaches the runtime host element",
		pattern: /__velaTransition\s*=\s*\{[\s\S]{0,160}?0\.3/,
	},
	{
		description: "transition easing direction is serialized",
		pattern: /__velaTransition\s*=\s*\{[\s\S]{0,160}?direction\s*=\s*"Out"/,
	},
	{
		description: "runtime className keeps dynamic rounded-md condition",
		pattern: /className\s*=\s*[^\n]*rounded-md/,
	},
	{
		description: "runtime className map keeps px-4 key",
		pattern: /\["px-4"\]\s*=/,
	},
	{
		description: "runtime className map keeps px-2 key",
		pattern: /\["px-2"\]\s*=/,
	},
	{
		description: "runtime helper aliases string.len locally",
		pattern: /local __velaStringLen = string\.len/,
	},
	{
		description: "runtime helper aliases string.sub locally",
		pattern: /local __velaStringSub = string\.sub/,
	},
	{
		description: "runtime helper calls the string len alias",
		pattern: /__velaStringLen\([^)]*\)/,
	},
	{
		description: "runtime helper calls the string sub alias",
		pattern: /__velaStringSub\([^)]*\)/,
	},
	{
		description: "runtime helper aliases table.getn locally",
		pattern: /local __velaTableGetn = table\.getn/,
	},
	{
		description: "runtime helper calls the table getn alias",
		pattern: /__velaTableGetn\([^)]*\)/,
	},
];

const forbiddenPatterns = [
	{
		description: "legacy className array literal should not remain",
		pattern: /className\s*=\s*\{\s*"bg-blue-600"\s*,/,
	},
	{
		description: "runtime helper must not call string.len as a method",
		pattern: /string:len\s*\(/,
	},
	{
		description: "runtime helper must not call string.sub as a method",
		pattern: /string:sub\s*\(/,
	},
	{
		description: "runtime helper must not call string.len directly",
		pattern: /string\.len\s*\(/,
	},
	{
		description: "runtime helper must not call string.sub directly",
		pattern: /string\.sub\s*\(/,
	},
	{
		description: "runtime helper must not call table.getn as a method",
		pattern: /table:getn\s*\(/,
	},
	{
		description: "runtime helper must not call table.getn directly",
		pattern: /table\.getn\s*\(/,
	},
	{
		description: "runtime helper must not call string size method",
		pattern: /[:.]size\s*\(/,
	},
	{
		description: "runtime helper must not use emitted length property",
		pattern: /\.length\b/,
	},
];

const failures = [];

if (typeof transformer !== "function") {
	failures.push("vela-rbxts/transformer does not export a program transformer");
}

for (const fragment of requiredDiagnostics) {
	if (!buildOutput.includes(fragment)) {
		failures.push(`rbxtsc output is missing expected diagnostic: ${fragment}`);
	}
}

for (const fragment of forbiddenDiagnostics) {
	if (buildOutput.includes(fragment)) {
		failures.push(
			`rbxtsc output contains forbidden diagnostic text: ${fragment}`,
		);
	}
}

for (const fragment of requiredFragments) {
	if (!source.includes(fragment)) {
		failures.push(`emitted Luau is missing ${fragment}`);
	}
}

for (const check of requiredPatterns) {
	if (!check.pattern.test(source)) {
		failures.push(
			`emitted Luau is missing expected pattern: ${check.description}`,
		);
	}
}

for (const fragment of forbiddenFragments) {
	if (source.includes(fragment)) {
		failures.push(`emitted Luau still contains forbidden fragment ${fragment}`);
	}
}

for (const check of forbiddenPatterns) {
	if (check.pattern.test(source)) {
		failures.push(
			`emitted Luau still contains forbidden pattern: ${check.description}`,
		);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
