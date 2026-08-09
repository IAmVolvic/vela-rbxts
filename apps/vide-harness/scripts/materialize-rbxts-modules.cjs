const fs = require("node:fs");
const path = require("node:path");

// roblox-ts requires @rbxts packages under the project's own node_modules
// (module scope is derived from the realpath), but the hoisted workspace
// install puts them at the repo root.
//
// Only what this app declares is copied, transitively. Rojo maps this directory
// into the place, and the hoisted root scope also holds `react`/`react-roblox`
// for the React harness — copying the scope wholesale would ship those into a
// Vide place that never requires them.
const projectRoot = path.join(__dirname, "..");
const sourceDir = path.join(projectRoot, "..", "..", "node_modules", "@rbxts");
const targetDir = path.join(projectRoot, "node_modules", "@rbxts");
const SCOPE = "@rbxts/";

function scopedDependencies(manifestPath) {
	let manifest;

	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	} catch {
		return [];
	}

	return Object.keys({
		...manifest.dependencies,
		...manifest.devDependencies,
		...manifest.peerDependencies,
	})
		.filter((name) => name.startsWith(SCOPE))
		.map((name) => name.slice(SCOPE.length));
}

function resolveRequired() {
	const required = new Set();
	const pending = scopedDependencies(path.join(projectRoot, "package.json"));

	while (pending.length > 0) {
		const name = pending.pop();

		if (required.has(name) || !fs.existsSync(path.join(sourceDir, name))) {
			continue;
		}

		required.add(name);
		pending.push(
			...scopedDependencies(path.join(sourceDir, name, "package.json")),
		);
	}

	return [...required].sort();
}

function readVersions(scopeDir, names) {
	const versions = {};

	for (const name of names) {
		const manifestPath = path.join(scopeDir, name, "package.json");

		try {
			versions[name] = JSON.parse(
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

const required = resolveRequired();
const sourceVersions = readVersions(sourceDir, required);
const targetIsRealDir =
	fs.existsSync(targetDir) && !fs.lstatSync(targetDir).isSymbolicLink();
const targetVersions = targetIsRealDir
	? readVersions(targetDir, required)
	: undefined;
const targetIsExact =
	targetIsRealDir &&
	fs.readdirSync(targetDir).sort().join(",") === required.join(",");

if (
	!sourceVersions ||
	!targetVersions ||
	!targetIsExact ||
	JSON.stringify(sourceVersions) !== JSON.stringify(targetVersions)
) {
	fs.rmSync(targetDir, { recursive: true, force: true });
	fs.mkdirSync(targetDir, { recursive: true });

	for (const name of required) {
		fs.cpSync(path.join(sourceDir, name), path.join(targetDir, name), {
			recursive: true,
			dereference: true,
		});
	}

	console.log(
		`materialize-rbxts-modules: copied ${required.join(", ")} into ${targetDir}`,
	);
}

// The runtime packages are workspace packages, so pnpm links them under the
// dependent rather than hoisting them to the root scope the copy above reads,
// and the wipe takes those links with it. Their versions stand still while
// their builds change, so these are refreshed every run.
for (const name of ["runtime-core", "runtime-vide"]) {
	const sourceRoot = path.join(projectRoot, "..", "..", "packages", name);
	const target = path.join(targetDir, `vela-${name}`);
	const build = path.join(sourceRoot, "out", "init.luau");

	if (!fs.existsSync(build)) {
		console.error(
			`materialize-rbxts-modules: missing ${build}; build @rbxts/vela-${name} first.`,
		);
		process.exit(1);
	}

	fs.rmSync(target, { recursive: true, force: true });
	fs.mkdirSync(target, { recursive: true });

	for (const entry of ["out", "default.project.json", "package.json"]) {
		fs.cpSync(path.join(sourceRoot, entry), path.join(target, entry), {
			recursive: true,
			dereference: true,
		});
	}
}
