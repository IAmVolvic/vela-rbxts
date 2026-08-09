const fs = require("node:fs");
const path = require("node:path");

// roblox-ts requires @rbxts packages under the project's own node_modules
// (module scope is derived from the realpath), but the hoisted workspace
// install puts them at the repo root. Materialize real copies locally; Rojo
// syncs the same directory, so Studio sees them too.
const projectRoot = path.join(__dirname, "..");
const sourceDir = path.join(projectRoot, "..", "..", "node_modules", "@rbxts");
const targetDir = path.join(projectRoot, "node_modules", "@rbxts");

function readVersions(scopeDir) {
	const versions = {};

	for (const entry of fs.readdirSync(scopeDir)) {
		const manifestPath = path.join(scopeDir, entry, "package.json");

		try {
			versions[entry] = JSON.parse(
				fs.readFileSync(manifestPath, "utf8"),
			).version;
		} catch {
			return undefined;
		}
	}

	return versions;
}

if (!fs.existsSync(sourceDir)) {
	console.error(
		`materialize-rbxts-modules: missing ${sourceDir}; run pnpm install first.`,
	);
	process.exit(1);
}

const sourceVersions = readVersions(sourceDir);
const targetIsRealDir =
	fs.existsSync(targetDir) && !fs.lstatSync(targetDir).isSymbolicLink();
const targetVersions = targetIsRealDir ? readVersions(targetDir) : undefined;

if (
	!sourceVersions ||
	!targetVersions ||
	JSON.stringify(sourceVersions) !== JSON.stringify(targetVersions)
) {
	fs.rmSync(targetDir, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(targetDir), { recursive: true });
	fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
	console.log(
		`materialize-rbxts-modules: copied @rbxts packages into ${targetDir}`,
	);
}

// The runtime is a workspace package, so pnpm links it under the dependent
// rather than hoisting it to the root scope the copy above reads. Its version
// stands still while its build changes, so this one is refreshed every run.
const runtimeRoot = path.join(projectRoot, "..", "..", "packages", "runtime");
const runtimeTarget = path.join(targetDir, "vela-runtime");
const runtimeBuild = path.join(runtimeRoot, "out", "init.luau");

if (!fs.existsSync(runtimeBuild)) {
	console.error(
		`materialize-rbxts-modules: missing ${runtimeBuild}; build @rbxts/vela-runtime first.`,
	);
	process.exit(1);
}

fs.rmSync(runtimeTarget, { recursive: true, force: true });
fs.mkdirSync(runtimeTarget, { recursive: true });

for (const entry of ["out", "default.project.json", "package.json"]) {
	fs.cpSync(path.join(runtimeRoot, entry), path.join(runtimeTarget, entry), {
		recursive: true,
		dereference: true,
	});
}
