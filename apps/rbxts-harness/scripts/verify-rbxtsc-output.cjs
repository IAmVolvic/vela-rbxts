const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { peakLocalRegisters } = require("./luau-local-registers.cjs");

const transformerModule = require("vela-rbxts/transformer");
const transformer =
	typeof transformerModule === "function"
		? transformerModule
		: transformerModule.default;

const projectRoot = path.join(__dirname, "..");

// A clean build so the transformer runs on every file and its diagnostics all
// land in this invocation's output.
fs.rmSync(path.join(projectRoot, "out"), { recursive: true, force: true });
const rbxtscCli = path.join(
	path.dirname(require.resolve("roblox-ts/package.json")),
	"out",
	"CLI",
	"cli.js",
);
const build = spawnSync(process.execPath, [rbxtscCli, "-p", "tsconfig.json"], {
	cwd: projectRoot,
	encoding: "utf8",
});
const buildOutput = `${build.stdout ?? ""}${build.stderr ?? ""}`;

if (build.status !== 0) {
	console.error(buildOutput);
	console.error("rbxtsc build failed");
	process.exit(1);
}

const appLuauPath = path.join(projectRoot, "out", "client", "App.luau");
const source = fs.readFileSync(appLuauPath, "utf8");

const requiredDiagnostics = [
	'Tailwind "tracking" utilities have no Roblox equivalent, so "tracking-wide" is ignored.',
	'Unknown variant "checked" in "checked:px-4"',
	'Arbitrary value "[oops]" is not supported yet',
	'Color opacity modifier "/50" is not supported',
	'Unsupported utility family "blorb" in className literal.',
];

// Bare `rounded` must resolve to the default radius, not a theme-key error.
const forbiddenDiagnostics = ['"DEFAULT"', "unknown-theme-key"];

const requiredFragments = [
	"CornerRadius = UDim.new(0, 4)",
	"Color3.fromRGB(255, 0, 0)",
	"BackgroundTransparency = 0.5",
	'kind = "hover"',
	'kind = "active"',
	'kind = "color-scheme"',
	"VelaColorScheme",
	'kind = "focus"',
	"attachHoverTracking",
	"attachActiveTracking",
	"attachFocusTracking",
	"MouseEnter",
	"InputBegan",
	"SelectionGained",
	"GetAttributeChangedSignal",
	// Held tween values seed from the merged props. Narrowing this back to
	// resolution.props loses every statically lowered base value, and a
	// variant then has nothing to tween from.
	"for name, value in pairs(hostProps) do",
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
	'Font.new("rbxasset://fonts/families/RobotoMono.json", Enum.FontWeight.Regular)',
	"GroupTransparency = 0.5",
	"ScrollingDirection = Enum.ScrollingDirection.Y",
	"ScrollBarThickness = 8",
	"ScrollBarImageColor3 = Color3.fromRGB(98, 116, 142)",
	"AutomaticCanvasSize = Enum.AutomaticSize.Y",
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
	"Size = UDim2.new(0, 120, 0.5, 0)",
	"PaddingTop = UDim.new(0, 7)",
	"CornerRadius = UDim.new(0, 10)",
	"TextSize = 13",
	"LineHeight = 1.6",
	"ZIndex = 15",
	// Plugin utilities: the class list expands statically and the property map
	// lands verbatim.
	"BackgroundColor3 = (Color3.fromRGB(29, 41, 61))",
	"BackgroundColor3 = Color3.fromRGB(69, 85, 108)",
	"LayoutOrder = 7",
	// The configured motion driver is imported and drives transitions; the
	// preset animations it does not implement stay on the built-in path.
	"harnessMotionDriver",
	'TS.import(script, script.Parent, "motion").harnessMotionDriver',
	"__VelaMotionDriver = motionDriver",
	"local driven = __VelaMotionDriver.transition",
	"local driven = __VelaMotionDriver.animate",
	// The runtime resolver reads the same plugin table for a dynamic className.
	"pluginUtilities",
	'["harness-card"] = "bg-slate-800 rounded-lg p-2 hover:bg-slate-700"',
	"local function createVelaRuntimeHost(config, motionDriver)",
	"React.createElement(VelaRuntimeHost",
	"__velaRules",
	"__velaTag",
	"__velaTransition",
	"TweenService",
	'property = "colors"',
	"transitionCoversProp",
	'__velaAnimation = "spin"',
	"startPresetAnimation",
	'Text = "<u>STATIC &amp; &lt;STYLED&gt;</u>"',
	"RichText = true",
	"__velaText",
	'transform = "capitalize"',
	'decoration = "strike"',
	"applyTextConfig",
	"__velaMargin",
	"prepareMarginWrapper",
	"renderMarginWrapper",
	"__velaDivide",
	'axis = "y"',
	"interleaveDivideSeparators",
];

// Intentional regression checks for the deleted runtime package and artifact paths.
const forbiddenFragments = [
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
		description: "runtime helper is inlined, scoped inside one initializer",
		pattern: /local VelaRuntimeHost = \(function\(\)/,
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
		description: "runtime helper lowers array size to the # operator",
		pattern: /function arraySize\(value\)\s*return #value\s*end/,
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
		description: "runtime helper must not use the deprecated table.getn",
		pattern: /table\s*[.:]\s*getn\b/,
	},
	{
		description: "runtime helper must not call an unlowered size method",
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

// Luau refuses to compile a function that needs more than 200 live locals, and
// the inlined runtime shares the module's register file with the consumer's own
// code. The budget is the ceiling minus the room a real component needs.
const REGISTER_BUDGET = 120;
const peak = peakLocalRegisters(source);

if (peak.registers > REGISTER_BUDGET) {
	failures.push(
		`emitted Luau spends ${peak.registers} local registers in ${peak.name} (line ${peak.line}), over the ${REGISTER_BUDGET} budget`,
	);
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
