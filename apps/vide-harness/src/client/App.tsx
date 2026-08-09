import Vide from "@rbxts/vide";
import {
	__VelaOpacity,
	createVelaRemScaler,
	createVelaRuntimeHost,
} from "./vela-vide";

// Every case below is the React target's real output for the class list named
// in its comment, taken verbatim from `transform()` and ported to Vide. What
// had to change is the whole point of the spike, so nothing else was touched.

const __VelaRem = createVelaRemScaler({
	base: 16.0,
	min: 8.0,
	max: 64.0,
	baseResolution: { x: 1920.0, y: 1020.0 },
});

const VelaRuntimeHost = createVelaRuntimeHost({});

// "bg-slate-800 rounded-lg p-4 size-full" — unchanged from the React emit.
// `__VelaRem.scale` returning a thunk is what makes it hold.
function StaticCase() {
	return (
		<__VelaOpacity.Fade>
			<frame
				BackgroundColor3={Color3.fromRGB(29, 41, 61)}
				Size={UDim2.fromScale(1, 1)}
				BorderSizePixel={0}
			>
				<uicorner CornerRadius={__VelaRem.scale(new UDim(0, 8), 0)} />
				<uipadding
					PaddingTop={__VelaRem.scale(new UDim(0, 16), 1)}
					PaddingRight={__VelaRem.scale(new UDim(0, 16), 2)}
					PaddingBottom={__VelaRem.scale(new UDim(0, 16), 3)}
					PaddingLeft={__VelaRem.scale(new UDim(0, 16), 4)}
				/>
				<textlabel
					BackgroundTransparency={1}
					Size={UDim2.fromScale(1, 1)}
					Text="static + rem"
					TextColor3={Color3.fromRGB(255, 255, 255)}
					TextSize={18}
				/>
			</frame>
		</__VelaOpacity.Fade>
	);
}

// "bg-blue-500 hover:bg-blue-600 text-white" — unchanged from the React emit.
function HoverCase() {
	return (
		<VelaRuntimeHost
			BackgroundColor3={Color3.fromRGB(43, 127, 255) as never}
			TextColor3={Color3.fromRGB(255, 255, 255) as never}
			BorderSizePixel={0 as never}
			Size={UDim2.fromScale(1, 1) as never}
			Text={"hover me" as never}
			TextSize={18 as never}
			__velaRules={[
				{
					condition: { kind: "hover" },
					effects: {
						props: [
							{
								name: "BackgroundColor3",
								value: "Color3.fromRGB(21, 93, 252)",
							},
						],
						helpers: [],
					},
				},
			]}
			__velaTag={"textbutton"}
		/>
	);
}

// {active ? "bg-red-500" : "bg-blue-500"} — the React emit passes
// `__velaTests={[props.active ? true : false]}`. Vide never re-runs this body,
// so the test has to arrive as a thunk over the source.
function DynamicCase(props: { active: () => boolean }) {
	return (
		<VelaRuntimeHost
			BorderSizePixel={0 as never}
			BackgroundTransparency={1 as never}
			Size={UDim2.fromScale(1, 1) as never}
			__velaRules={[
				{
					condition: { kind: "test", index: 0, expected: true },
					effects: {
						props: [
							{
								name: "BackgroundColor3",
								value: "Color3.fromRGB(251, 44, 54)",
							},
							{ name: "BackgroundTransparency", value: "0" },
						],
						helpers: [],
					},
				},
				{
					condition: { kind: "test", index: 0, expected: false },
					effects: {
						props: [
							{
								name: "BackgroundColor3",
								value: "Color3.fromRGB(43, 127, 255)",
							},
							{ name: "BackgroundTransparency", value: "0" },
						],
						helpers: [],
					},
				},
			]}
			__velaTests={[() => !!props.active()]}
			__velaTag={"frame"}
		/>
	);
}

// "w-full md:w-1/2" — unchanged from the React emit.
function BreakpointCase() {
	return (
		<VelaRuntimeHost
			Size={UDim2.fromScale(1, 0) as never}
			BorderSizePixel={0 as never}
			BackgroundTransparency={1 as never}
			__velaRules={[
				{
					condition: { kind: "width", alias: "md", minWidth: 768 },
					effects: {
						props: [{ name: "SizeX", value: "new UDim(0.5, 0)" }],
						helpers: [],
					},
				},
			]}
			__velaTag={"frame"}
		/>
	);
}

// "opacity-50" on a parent with a "bg-red-500" child — unchanged from the
// React emit; the alpha was folded in statically on both.
function OpacityCase() {
	return (
		<__VelaOpacity.Fade>
			<frame
				BackgroundTransparency={0.5}
				BorderSizePixel={0}
				Size={UDim2.fromScale(1, 1)}
			>
				<textlabel
					BackgroundColor3={Color3.fromRGB(251, 44, 54)}
					BorderSizePixel={0}
					BackgroundTransparency={0.5}
					TextTransparency={0.5}
					Size={UDim2.fromScale(1, 1)}
					Text="opacity-50"
					TextSize={18}
				/>
			</frame>
		</__VelaOpacity.Fade>
	);
}

function Row(props: { children?: Vide.Node }) {
	return (
		<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 72)}>
			{props.children}
		</frame>
	);
}

export function App() {
	const active = Vide.source(false);

	// Nothing re-renders in Vide, so a flipping source is the only way to see
	// whether the test thunk actually re-drives the rule.
	task.spawn(() => {
		while (true) {
			task.wait(1);
			active(!active());
		}
	});

	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset={true}>
			<frame
				BackgroundColor3={Color3.fromRGB(15, 20, 32)}
				BorderSizePixel={0}
				Position={UDim2.fromScale(0.5, 0.5)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={UDim2.fromOffset(420, 420)}
			>
				<uilistlayout Padding={new UDim(0, 8)} />
				<uipadding
					PaddingTop={new UDim(0, 12)}
					PaddingRight={new UDim(0, 12)}
					PaddingBottom={new UDim(0, 12)}
					PaddingLeft={new UDim(0, 12)}
				/>
				<Row>{StaticCase()}</Row>
				<Row>{HoverCase()}</Row>
				<Row>{DynamicCase({ active })}</Row>
				<Row>{BreakpointCase()}</Row>
				<Row>{OpacityCase()}</Row>
			</frame>
		</screengui>
	);
}
