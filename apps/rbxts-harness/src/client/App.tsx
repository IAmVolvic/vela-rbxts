import React from "@rbxts/react";

export const App = () => {
	const [active, setActive] = React.useState(false);
	const [roomy, setRoomy] = React.useState(false);

	React.useEffect(() => {
		// Yielding directly in the effect never returns, which wedges React's
		// commit phase and freezes every later state update.
		let running = true;
		task.spawn(() => {
			while (running) {
				task.wait(1);
				setActive((v) => !v);
				setRoomy((v) => !v);
			}
		});

		return () => {
			running = false;
		};
	}, []);

	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset>
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				className="rounded-md bg-slate-700 border border-slate-500 px-4 py-3 w-80 h-27 gap-4"
			>
				<textlabel
					BackgroundTransparency={1}
					Text="rbxts consumer harness"
					TextScaled
					TextWrapped
				/>
				<textlabel
					BackgroundTransparency={1}
					Text="layout and spacing baseline"
					TextScaled
					TextWrapped
				/>
				<frame
					BackgroundTransparency={1}
					className={[
						"bg-blue-600 border-2 border-blue-600",
						active && "rounded-md",
					]}
				/>
				<frame
					BackgroundTransparency={1}
					className="rounded-md md:px-4 portrait:w-80 touch:px-3"
				/>
				<frame
					BackgroundTransparency={1}
					className={{ "px-4": roomy, "px-2": !roomy }}
				/>
				<frame BackgroundTransparency={1} className="rounded" />
				<frame
					BackgroundTransparency={1}
					className="tracking-wide focus:px-4 bg-[oops] from-blue-600/50 blorb-2"
				/>
				<frame
					BackgroundTransparency={1}
					className="right-4 bottom-2 order-2 self-center content-between"
				/>
				<frame BackgroundTransparency={1} className="grid grid-cols-3 gap-2" />
				<frame
					BackgroundTransparency={1}
					className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 basis-1/2"
				/>
				<frame
					BackgroundTransparency={1}
					className="mx-auto pointer-events-none space-y-2 ring-2 ring-rose-500"
				/>
				<imagelabel BackgroundTransparency={1} className="object-cover" />
				<frame className="bg-slate-700 md:bg-blue-600 transition duration-300 ease-out" />
				<frame className="bg-blue-600 animate-spin" />
				<frame className="bg-[#ff0000] size-6" />
				<frame className="bg-blue-600/50 hover:bg-blue-600 transition size-6" />
				<frame className="m-4 w-20 h-6 bg-slate-500 rounded-md" />
				<frame className="flex-col divide-y-2 divide-slate-500 w-20 h-12">
					<frame BackgroundTransparency={1} />
					<frame BackgroundTransparency={1} />
				</frame>
				<textlabel
					BackgroundTransparency={1}
					Text="static & <styled>"
					className="uppercase underline"
				/>
				<textlabel
					BackgroundTransparency={1}
					Text={roomy ? "roomy" : "tight"}
					className="capitalize line-through"
				/>
				<textlabel
					BackgroundTransparency={1}
					Text="typography probe"
					className="leading-tight italic font-bold"
				/>
			</frame>
		</screengui>
	);
};
