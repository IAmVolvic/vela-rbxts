import React from "@rbxts/react";
import { inspectPreview } from "./inspect";
import { DEFAULT_CLASS_NAME, TOKEN_GROUPS } from "./tokens";

type PreviewTag = "frame" | "textlabel" | "imagelabel" | "scrollingframe";

const PREVIEW_TAGS: PreviewTag[] = [
	"frame",
	"textlabel",
	"imagelabel",
	"scrollingframe",
];

type PreviewProps = {
	tag: PreviewTag;
	className: string;
	onInstance: (instance: GuiObject | undefined) => void;
};

// Each tag is written out because the transformer only lowers `className` on a
// literal host element; a computed tag would never reach it.
function Preview({ tag, className, onInstance }: PreviewProps) {
	if (tag === "textlabel") {
		return (
			<textlabel
				ref={onInstance}
				Text="vela"
				TextScaled
				className={className}
			/>
		);
	}

	if (tag === "imagelabel") {
		return (
			<imagelabel
				ref={onInstance}
				Image="rbxasset://textures/ui/GuiImagePlaceholder.png"
				className={className}
			/>
		);
	}

	if (tag === "scrollingframe") {
		return <scrollingframe ref={onInstance} className={className} />;
	}

	return <frame ref={onInstance} className={className} />;
}

type ChipProps = {
	label: string;
	active?: boolean;
	onClick: () => void;
};

function Chip({ label, active, onClick }: ChipProps) {
	return (
		<textbutton
			Text={label}
			AutomaticSize={Enum.AutomaticSize.X}
			Size={new UDim2(0, 0, 0, 24)}
			Event={{ Activated: onClick }}
			className={[
				"px-2 rounded text-sm",
				active === true
					? "bg-blue-600 text-slate-100"
					: "bg-panel text-slate-300",
			]}
		/>
	);
}

export const App = () => {
	const [draft, setDraft] = React.useState(DEFAULT_CLASS_NAME);
	const [tag, setTag] = React.useState<PreviewTag>("frame");
	const [preview, setPreview] = React.useState<GuiObject | undefined>(
		undefined,
	);
	const [readout, setReadout] = React.useState("");

	React.useEffect(() => {
		// Polled rather than read once: transitions and animate-* keep moving the
		// instance after the render that produced it.
		let running = true;
		task.spawn(() => {
			while (running) {
				setReadout(inspectPreview(preview));
				task.wait(0.25);
			}
		});

		return () => {
			running = false;
		};
	}, [preview]);

	const appendToken = (token: string) => {
		setDraft((current) => {
			const trimmed = current.gsub("%s+$", "")[0];
			return trimmed === "" ? token : `${trimmed} ${token}`;
		});
	};

	return (
		<screengui
			ResetOnSpawn={false}
			IgnoreGuiInset
			ZIndexBehavior={Enum.ZIndexBehavior.Sibling}
		>
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={UDim2.fromOffset(780, 580)}
				className="bg-surface rounded-panel p-4 gap-3 flex-col border border-slate-700"
			>
				<textlabel
					BackgroundTransparency={1}
					Size={new UDim2(1, 0, 0, 24)}
					Text="vela playground — tokens resolve at runtime"
					TextXAlignment={Enum.TextXAlignment.Left}
					className="text-lg font-bold text-slate-100"
				/>

				<textbox
					Size={new UDim2(1, 0, 0, 36)}
					Text={draft}
					ClearTextOnFocus={false}
					TextXAlignment={Enum.TextXAlignment.Left}
					PlaceholderText="type utility tokens…"
					Change={{ Text: (rbx) => setDraft(rbx.Text) }}
					className="bg-panel rounded px-3 text-slate-100"
				/>

				<frame
					BackgroundTransparency={1}
					Size={new UDim2(1, 0, 0, 24)}
					className="flex-row gap-2 items-center"
				>
					{PREVIEW_TAGS.map((candidate) => (
						<Chip
							key={candidate}
							label={candidate}
							active={candidate === tag}
							onClick={() => setTag(candidate)}
						/>
					))}
					<Chip label="clear" onClick={() => setDraft("")} />
					<Chip label="reset" onClick={() => setDraft(DEFAULT_CLASS_NAME)} />
				</frame>

				<frame
					BackgroundTransparency={1}
					Size={new UDim2(1, 0, 0, 240)}
					className="flex-row gap-3"
				>
					<frame
						Size={UDim2.fromOffset(300, 240)}
						className="bg-panel rounded p-3 items-center justify-center"
					>
						<Preview tag={tag} className={draft} onInstance={setPreview} />
					</frame>

					<scrollingframe
						Size={new UDim2(1, -312, 1, 0)}
						CanvasSize={new UDim2(0, 0, 0, 340)}
						ScrollBarThickness={4}
						className="bg-panel rounded p-3"
					>
						<textlabel
							BackgroundTransparency={1}
							Size={new UDim2(1, 0, 1, 0)}
							Text={readout}
							TextXAlignment={Enum.TextXAlignment.Left}
							TextYAlignment={Enum.TextYAlignment.Top}
							className="text-sm text-slate-300"
						/>
					</scrollingframe>
				</frame>

				<scrollingframe
					BackgroundTransparency={1}
					Size={new UDim2(1, 0, 0, 190)}
					CanvasSize={new UDim2(0, 0, 0, 320)}
					ScrollBarThickness={4}
					className="flex-col gap-2"
				>
					{TOKEN_GROUPS.map((group) => (
						<frame
							key={group.label}
							BackgroundTransparency={1}
							Size={new UDim2(1, -8, 0, 24)}
							className="flex-row gap-2 items-center"
						>
							<textlabel
								BackgroundTransparency={1}
								Size={UDim2.fromOffset(76, 24)}
								Text={group.label}
								TextXAlignment={Enum.TextXAlignment.Left}
								className="text-sm text-slate-500"
							/>
							{group.tokens.map((token) => (
								<Chip
									key={token}
									label={token}
									onClick={() => appendToken(token)}
								/>
							))}
						</frame>
					))}
				</scrollingframe>

				<textlabel
					BackgroundTransparency={1}
					Size={new UDim2(1, 0, 0, 16)}
					Text="Unknown tokens are ignored here — compile-time diagnostics only appear in the rbxtsc build output."
					TextXAlignment={Enum.TextXAlignment.Left}
					className="text-sm text-slate-500"
				/>
			</frame>
		</screengui>
	);
};
