const fs = require("node:fs");
const path = require("node:path");

// roblox-ts derives module scope from the realpath, so the hoisted workspace
// install at the repo root reads as "directly under node_modules" and is
// rejected. Materialize real copies locally for the compile only; they are not
// published, and leaving them in place would make consumers resolve React
// through this package instead of their own.
const packageRoot = path.join(__dirname, "..");
const sourceDir = path.join(packageRoot, "..", "..", "node_modules", "@rbxts");
const targetDir = path.join(packageRoot, "node_modules", "@rbxts");

if (!fs.existsSync(sourceDir)) {
	console.error(
		`materialize-rbxts-modules: missing ${sourceDir}; run pnpm install first.`,
	);
	process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

const selfName = require(path.join(packageRoot, "package.json")).name.split(
	"/",
)[1];

for (const entry of fs.readdirSync(sourceDir)) {
	// This package is itself hoisted under @rbxts, and `dereference` would copy
	// it into its own node_modules.
	if (entry === selfName) {
		continue;
	}

	fs.cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), {
		recursive: true,
		dereference: true,
	});
}
