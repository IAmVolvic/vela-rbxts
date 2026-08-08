import fs from "node:fs";
import path from "node:path";
import type { CliOptions } from "./options.js";
import { VELA_DIR } from "./options.js";

const TRANSFORMER_SPECIFIERS = [
	"vela-rbxts/transformer",
	"@vela-rbxts/rbxtsc-host",
];

export function ensureVelaDirIgnored(projectRoot: string): void {
	const velaDir = path.resolve(projectRoot, VELA_DIR);
	const ignorePath = path.join(velaDir, ".gitignore");

	if (fs.existsSync(ignorePath)) {
		return;
	}

	fs.mkdirSync(velaDir, { recursive: true });
	fs.writeFileSync(ignorePath, "*\n");
}

export function collectSetupWarnings(options: CliOptions): string[] {
	const warnings: string[] = [];

	if (!fs.existsSync(options.srcDir)) {
		warnings.push(
			`Source directory "${relative(options.projectRoot, options.srcDir)}" does not exist.`,
		);
		return warnings;
	}

	const tsconfigPath = path.resolve(options.projectRoot, "tsconfig.json");
	const tsconfig = readJsonFile(tsconfigPath);

	if (tsconfig === undefined) {
		return warnings;
	}

	const compilerOptions = asRecord(tsconfig.compilerOptions) ?? {};
	const outRelative = relative(options.projectRoot, options.outDir);
	const rootDir = compilerOptions.rootDir;

	if (typeof rootDir === "string" && normalize(rootDir) !== outRelative) {
		warnings.push(
			`tsconfig.json compilerOptions.rootDir is "${rootDir}" but the generated tree is "${outRelative}". Point rootDir and include at "${outRelative}" so rbxtsc compiles the lowered sources.`,
		);
	}

	if (usesTransformerPlugin(compilerOptions.plugins)) {
		warnings.push(
			'tsconfig.json still registers the "vela-rbxts/transformer" plugin. Remove it — the CLI already lowered these sources.',
		);
	}

	return warnings;
}

function usesTransformerPlugin(plugins: unknown): boolean {
	if (!Array.isArray(plugins)) {
		return false;
	}

	return plugins.some((entry) => {
		const record = asRecord(entry);
		const transform = record?.transform;
		return (
			typeof transform === "string" &&
			TRANSFORMER_SPECIFIERS.some((specifier) =>
				transform.startsWith(specifier),
			)
		);
	});
}

function readJsonFile(filePath: string): Record<string, unknown> | undefined {
	let text: string;

	try {
		text = fs.readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}

	try {
		return asRecord(JSON.parse(stripJsonComments(text)));
	} catch {
		return undefined;
	}
}

// tsconfig.json allows comments and trailing commas; the setup check is a hint,
// so a file this misses simply produces no warnings.
function stripJsonComments(text: string): string {
	return text
		.replace(
			/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
			(_match, str) => (str === undefined ? "" : (str as string)),
		)
		.replace(/,(\s*[}\]])/g, "$1");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function relative(from: string, to: string): string {
	return normalize(path.relative(from, to));
}

function normalize(value: string): string {
	return value
		.split(path.sep)
		.join("/")
		.replace(/^\.\//, "")
		.replace(/\/$/, "");
}
