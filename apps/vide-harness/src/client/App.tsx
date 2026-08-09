import Vide from "@rbxts/vide";

// The source form a Vide project actually writes. Everything here is lowered by
// the transformer against `framework: "vide"`, so what Studio renders is the
// real emit rather than a hand-port of the React one.

function Row(props: { children?: Vide.Node }) {
	return (
		<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 72)}>
			{props.children}
		</frame>
	);
}

function StaticCase() {
	return (
		<frame className="bg-slate-800 rounded-lg p-4 size-full">
			<textlabel
				className="text-white size-full"
				BackgroundTransparency={1}
				Text="static + rem"
				TextSize={18}
			/>
		</frame>
	);
}

function ClassValueCase(props: { active: () => boolean }) {
	// A Vide source has to reach the host as a thunk; the transformer keeps the
	// branch tests deferred for exactly this.
	return (
		<frame
			className={() => (props.active() ? "bg-red-500" : "bg-blue-500")}
			Size={UDim2.fromScale(1, 1)}
		/>
	);
}

function BreakpointCase() {
	return <frame className="w-full md:w-1/2 bg-emerald-500 h-full" />;
}

function OpacityCase() {
	return (
		<frame className="opacity-50 size-full">
			<textlabel
				className="bg-red-500 size-full"
				Text="opacity-50"
				TextSize={18}
			/>
		</frame>
	);
}

export function App() {
	const active = Vide.source(false);

	// Nothing re-renders in Vide, so a flipping source is the only way to see
	// whether the thunked test actually re-drives the rule.
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
				Size={UDim2.fromOffset(420, 360)}
			>
				<uilistlayout Padding={new UDim(0, 8)} />
				<uipadding
					PaddingTop={new UDim(0, 12)}
					PaddingRight={new UDim(0, 12)}
					PaddingBottom={new UDim(0, 12)}
					PaddingLeft={new UDim(0, 12)}
				/>
				<Row>{StaticCase()}</Row>
				<Row>{ClassValueCase({ active })}</Row>
				<Row>{BreakpointCase()}</Row>
				<Row>{OpacityCase()}</Row>
			</frame>
		</screengui>
	);
}
