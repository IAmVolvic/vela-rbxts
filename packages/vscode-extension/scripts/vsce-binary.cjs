const fs = require("node:fs");
const path = require("node:path");

const extensionDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extensionDir, "..", "..");

/**
 * `nodeLinker: hoisted` installs workspace binaries into the repo root's .bin
 * rather than beside the package, so both layouts have to be searched — packing
 * and publishing each broke on the package-local path alone.
 */
function resolveVsceBinary() {
	const binaryName = process.platform === "win32" ? "vsce.cmd" : "vsce";
	const candidates = [
		path.join(extensionDir, "node_modules", ".bin", binaryName),
		path.join(repoRoot, "node_modules", ".bin", binaryName),
	];
	const found = candidates.find((candidate) => fs.existsSync(candidate));

	if (!found) {
		throw new Error(
			`Could not find the vsce binary. Looked in:\n  ${candidates.join("\n  ")}\nRun pnpm install first.`,
		);
	}

	return found;
}

module.exports = { resolveVsceBinary };
