import fs from "node:fs";
import path from "node:path";
import { transformSourceForHost } from "@vela-rbxts/rbxtsc-host";

import { type FormattedDiagnostic, formatDiagnostic } from "./diagnostics.js";
import {
	isFile,
	listFilesRecursive,
	removeEmptyDirectories,
	removeFile,
	toSystemPath,
	writeFileIfChanged,
} from "./files.js";
import type { CliOptions } from "./options.js";
import { MANIFEST_FILE } from "./options.js";

const MANIFEST_VERSION = 1;

export type BuildStats = {
	transformed: number;
	copied: number;
	written: number;
	removed: number;
	errors: number;
	warnings: number;
	diagnostics: FormattedDiagnostic[];
	durationMs: number;
};

export type Builder = {
	buildAll(): BuildStats;
	rebuild(relativePaths: readonly string[]): BuildStats;
	clean(): void;
};

type Manifest = {
	version: number;
	outDir: string;
	files: string[];
};

export function createBuilder(options: CliOptions): Builder {
	const manifestPath = path.resolve(options.projectRoot, MANIFEST_FILE);
	let emitted = readManifest(manifestPath, options);

	function emit(relativePath: string, stats: MutableStats): void {
		const sourcePath = toSystemPath(options.srcDir, relativePath);
		const outputPath = toSystemPath(options.outDir, relativePath);

		if (!relativePath.endsWith(".tsx")) {
			if (writeFileIfChanged(outputPath, fs.readFileSync(sourcePath))) {
				stats.written += 1;
			}
			stats.copied += 1;
			emitted.add(relativePath);
			return;
		}

		const sourceText = fs.readFileSync(sourcePath, "utf8");
		const result = transformSourceForHost({
			fileName: sourcePath,
			sourceText,
			projectRoot: options.projectRoot,
		});

		for (const diagnostic of result.diagnostics) {
			const formatted = formatDiagnostic(relativePath, sourceText, diagnostic);
			stats.diagnostics.push(formatted);

			if (formatted.severity === "error") {
				stats.errors += 1;
			} else if (formatted.severity === "warning") {
				stats.warnings += 1;
			}
		}

		if (writeFileIfChanged(outputPath, result.sourceText)) {
			stats.written += 1;
		}

		if (result.changed) {
			stats.transformed += 1;
		} else {
			stats.copied += 1;
		}

		emitted.add(relativePath);
	}

	function drop(relativePath: string, stats: MutableStats): void {
		const outputPath = toSystemPath(options.outDir, relativePath);

		if (removeFile(outputPath)) {
			stats.removed += 1;
		}

		emitted.delete(relativePath);
		removeEmptyDirectories(path.dirname(outputPath), options.outDir);
	}

	return {
		buildAll() {
			const started = Date.now();
			const stats = createStats();
			const sources = listFilesRecursive(options.srcDir);
			const live = new Set(sources);

			for (const relativePath of sources) {
				emit(relativePath, stats);
			}

			for (const relativePath of [...emitted]) {
				if (!live.has(relativePath)) {
					drop(relativePath, stats);
				}
			}

			emitted = live;
			writeManifest(manifestPath, options, emitted);

			return finish(stats, started);
		},

		rebuild(relativePaths) {
			const started = Date.now();
			const stats = createStats();

			for (const relativePath of relativePaths) {
				if (isFile(toSystemPath(options.srcDir, relativePath))) {
					emit(relativePath, stats);
				} else {
					drop(relativePath, stats);
				}
			}

			writeManifest(manifestPath, options, emitted);

			return finish(stats, started);
		},

		clean() {
			fs.rmSync(options.outDir, { recursive: true, force: true });
			emitted = new Set();
			writeManifest(manifestPath, options, emitted);
		},
	};
}

type MutableStats = Omit<BuildStats, "durationMs">;

function createStats(): MutableStats {
	return {
		transformed: 0,
		copied: 0,
		written: 0,
		removed: 0,
		errors: 0,
		warnings: 0,
		diagnostics: [],
	};
}

function finish(stats: MutableStats, started: number): BuildStats {
	return { ...stats, durationMs: Date.now() - started };
}

// Pruning is driven by what an earlier run recorded, never by whatever else
// happens to sit in the output directory.
function readManifest(manifestPath: string, options: CliOptions): Set<string> {
	let manifest: Manifest;

	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
	} catch {
		return new Set();
	}

	if (
		manifest.version !== MANIFEST_VERSION ||
		path.resolve(options.projectRoot, manifest.outDir) !== options.outDir ||
		!Array.isArray(manifest.files)
	) {
		return new Set();
	}

	return new Set(manifest.files);
}

function writeManifest(
	manifestPath: string,
	options: CliOptions,
	emitted: ReadonlySet<string>,
): void {
	const manifest: Manifest = {
		version: MANIFEST_VERSION,
		outDir: path
			.relative(options.projectRoot, options.outDir)
			.split(path.sep)
			.join("/"),
		files: [...emitted].sort(),
	};

	fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
	fs.writeFileSync(
		manifestPath,
		`${JSON.stringify(manifest, undefined, "\t")}\n`,
	);
}
