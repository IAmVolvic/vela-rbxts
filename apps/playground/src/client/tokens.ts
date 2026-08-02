export type TokenGroup = {
	label: string;
	tokens: string[];
};

export const TOKEN_GROUPS: TokenGroup[] = [
	{
		label: "Layout",
		tokens: [
			"size-24",
			"w-40",
			"h-20",
			"p-4",
			"gap-2",
			"flex-col",
			"items-center",
			"justify-center",
		],
	},
	{
		label: "Color",
		tokens: [
			"bg-slate-700",
			"bg-blue-600",
			"bg-rose-500",
			"bg-blue-600/50",
			"bg-surface",
		],
	},
	{
		label: "Border",
		tokens: [
			"rounded-md",
			"rounded-full",
			"rounded-panel",
			"border-2",
			"border-slate-500",
			"ring-2",
		],
	},
	{
		label: "Motion",
		tokens: [
			"transition",
			"duration-300",
			"ease-out",
			"hover:bg-rose-500",
			"animate-spin",
		],
	},
	{
		label: "Structure",
		tokens: ["m-4", "divide-y-2", "divide-slate-500", "mx-auto"],
	},
	{
		label: "Text",
		tokens: [
			"text-lg",
			"font-bold",
			"uppercase",
			"underline",
			"text-blue-600",
			"italic",
		],
	},
	{
		label: "Variants",
		tokens: ["md:bg-blue-600", "portrait:w-40", "touch:p-2"],
	},
];

export const DEFAULT_CLASS_NAME =
	"size-24 rounded-md bg-slate-700 border-2 border-slate-500 transition hover:bg-blue-600";
