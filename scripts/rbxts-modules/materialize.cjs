const fs = require("node:fs");
const path = require("node:path");

// roblox-ts derives module scope from the realpath, so the hoisted workspace
// install at the repo root reads as "directly under node_modules" and is
// rejected. Materialize real copies locally for the compile only; they are not
// published, and leaving them in place would make consumers resolve React
// through this package instead of their own.
const packageRoot = process.cwd();
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

const manifest = require(path.join(packageRoot, "package.json"));
const selfName = manifest.name.split("/")[1];

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

const CORE_PACKAGE = "@rbxts/vela-runtime-core";

// The core is a workspace sibling, so pnpm links it under its dependents rather
// than hoisting it to the root scope the loop above reads — and the wipe that
// starts this script takes that link with it. Its version stands still while
// its build changes, so it is refreshed every run.
if ((manifest.dependencies ?? {})[CORE_PACKAGE]) {
	const coreRoot = path.join(packageRoot, "..", "runtime-core");
	const coreTarget = path.join(targetDir, "vela-runtime-core");
	const coreBuild = path.join(coreRoot, "out", "init.luau");

	if (!fs.existsSync(coreBuild)) {
		console.error(
			`materialize-rbxts-modules: missing ${coreBuild}; build ${CORE_PACKAGE} first.`,
		);
		process.exit(1);
	}

	fs.mkdirSync(coreTarget, { recursive: true });

	for (const entry of ["out", "default.project.json", "package.json"]) {
		fs.cpSync(path.join(coreRoot, entry), path.join(coreTarget, entry), {
			recursive: true,
			dereference: true,
		});
	}
}
