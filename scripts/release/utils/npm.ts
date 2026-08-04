import { dirname, join } from "node:path";

import { runCommandCapture } from "./exec";

export function resolveNpmCommand() {
	const commandName = process.platform === "win32" ? "npm.cmd" : "npm";
	const localCommand = join(dirname(process.execPath), commandName);
	return localCommand;
}

export async function packageVersionExistsOnNpm(
	packageName: string,
	version: string,
) {
	const npmCommand = resolveNpmCommand();
	try {
		// `--prefer-online` because this decides whether a version is missing, and
		// a cached packument would answer for a write made seconds ago.
		runCommandCapture(npmCommand, [
			"view",
			`${packageName}@${version}`,
			"version",
			"--json",
			"--prefer-online",
		]);
		return true;
	} catch {
		return false;
	}
}
