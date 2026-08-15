import path from "node:path";

import type { BuildStats } from "./builder.js";
import type { CliOptions } from "./options.js";

export type Reporter = {
	info(message: string): void;
	warn(message: string): void;
	header(options: CliOptions): void;
	summary(stats: BuildStats, prefix?: string): void;
};

export function createReporter(quiet: boolean): Reporter {
	const info = (message: string) => {
		if (!quiet) {
			process.stdout.write(`${message}\n`);
		}
	};

	return {
		info,
		warn(message) {
			process.stderr.write(`vela: warning: ${message}\n`);
		},
		header(options) {
			const from = path.relative(options.projectRoot, options.srcDir) || ".";
			const to = path.relative(options.projectRoot, options.outDir) || ".";
			info(`vela ${options.command}: ${from} -> ${to}`);
		},
		summary(stats, prefix = "") {
			for (const diagnostic of stats.diagnostics) {
				process.stderr.write(`${diagnostic.text}\n`);
			}

			const parts = [
				`${stats.transformed} transformed`,
				`${stats.copied} copied`,
			];

			if (stats.removed > 0) {
				parts.push(`${stats.removed} removed`);
			}

			if (stats.errors > 0) {
				parts.push(`${stats.errors} error${stats.errors === 1 ? "" : "s"}`);
			}

			if (stats.warnings > 0) {
				parts.push(
					`${stats.warnings} warning${stats.warnings === 1 ? "" : "s"}`,
				);
			}

			info(`${prefix}${parts.join(", ")} (${stats.durationMs}ms)`);
		},
	};
}
