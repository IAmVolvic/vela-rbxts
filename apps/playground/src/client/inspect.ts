const HELPER_CLASS_NAMES = [
	"UICorner",
	"UIStroke",
	"UIPadding",
	"UIListLayout",
	"UIGridLayout",
	"UIGradient",
	"UIAspectRatioConstraint",
	"UISizeConstraint",
	"UIFlexItem",
	"UIScale",
];

function formatColor(color: Color3): string {
	return string.format(
		"%d, %d, %d",
		math.round(color.R * 255),
		math.round(color.G * 255),
		math.round(color.B * 255),
	);
}

function formatNumber(value: number): string {
	return value === math.floor(value)
		? tostring(value)
		: string.format("%.3f", value);
}

function describeHelper(helper: Instance): string {
	if (helper.IsA("UICorner")) {
		return `UICorner ${tostring(helper.CornerRadius)}`;
	}
	if (helper.IsA("UIStroke")) {
		return `UIStroke ${formatNumber(helper.Thickness)}px ${formatColor(helper.Color)} (${helper.ApplyStrokeMode.Name})`;
	}
	if (helper.IsA("UIPadding")) {
		return `UIPadding T${tostring(helper.PaddingTop)} R${tostring(helper.PaddingRight)} B${tostring(helper.PaddingBottom)} L${tostring(helper.PaddingLeft)}`;
	}
	if (helper.IsA("UIListLayout")) {
		return `UIListLayout ${helper.FillDirection.Name} pad ${tostring(helper.Padding)}`;
	}
	if (helper.IsA("UIGridLayout")) {
		return `UIGridLayout cell ${tostring(helper.CellSize)} pad ${tostring(helper.CellPadding)}`;
	}
	return helper.ClassName;
}

export function inspectPreview(instance: GuiObject | undefined): string {
	if (!instance) {
		return "no preview instance yet";
	}

	const lines: string[] = [
		`${instance.ClassName}`,
		`Size ${tostring(instance.Size)}`,
		`AnchorPoint ${tostring(instance.AnchorPoint)}  Position ${tostring(instance.Position)}`,
		`BackgroundColor3 ${formatColor(instance.BackgroundColor3)}  Transparency ${formatNumber(instance.BackgroundTransparency)}`,
		`Rotation ${formatNumber(instance.Rotation)}  ZIndex ${instance.ZIndex}  Visible ${tostring(instance.Visible)}`,
	];

	if (instance.IsA("TextLabel") || instance.IsA("TextButton")) {
		lines.push(
			`TextColor3 ${formatColor(instance.TextColor3)}  TextSize ${formatNumber(instance.TextSize)}  RichText ${tostring(instance.RichText)}`,
		);
		lines.push(`Text ${string.format("%q", instance.Text)}`);
	}

	if (instance.IsA("ImageLabel") || instance.IsA("ImageButton")) {
		lines.push(
			`ImageColor3 ${formatColor(instance.ImageColor3)}  ScaleType ${instance.ScaleType.Name}`,
		);
	}

	const helpers: string[] = [];
	for (const child of instance.GetChildren()) {
		if (HELPER_CLASS_NAMES.includes(child.ClassName)) {
			helpers.push(describeHelper(child));
		}
	}

	lines.push("");
	lines.push(
		helpers.isEmpty()
			? "helper instances: none"
			: `helper instances (${helpers.size()}):`,
	);
	for (const helper of helpers) {
		lines.push(`  ${helper}`);
	}

	return lines.join("\n");
}
