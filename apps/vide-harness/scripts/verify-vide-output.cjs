const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

fs.rmSync(path.join(projectRoot, "out"), { recursive: true, force: true });
const rbxtscCli = path.join(
	path.dirname(require.resolve("roblox-ts/package.json")),
	"out",
	"CLI",
	"cli.js",
);
const build = spawnSync(process.execPath, [rbxtscCli, "-p", "tsconfig.json"], {
	cwd: projectRoot,
	encoding: "utf8",
});
const buildOutput = `${build.stdout ?? ""}${build.stderr ?? ""}`;

if (build.status !== 0) {
	console.error(buildOutput);
	console.error("rbxtsc build failed");
	process.exit(1);
}

const source = fs.readFileSync(
	path.join(projectRoot, "out", "client", "App.luau"),
	"utf8",
);

const failures = [];

function expect(description, condition) {
	if (!condition) {
		failures.push(description);
	}
}

// The static path's only React dependency is the rem binding. Vide accepts a
// `Derivable`, so the emitted call site is unchanged and the thunk contract
// lives entirely in what the scaler returns.
expect(
	"rem-scaled offsets stay a plain call at the prop site",
	/CornerRadius = __VelaRem\.scale\(UDim\.new\(0, 8\), 0\)/.test(source),
);

// The React target passes evaluated booleans here. Vide has no re-render, so
// this is the one emit shape that has to differ.
expect(
	"branch tests reach the host as thunks",
	/__velaTests = \{ function\(\)/.test(source),
);

expect(
	"the host is reached as a Vide function component",
	/Vide\.jsx\(VelaRuntimeHost, \{/.test(source),
);

expect(
	"lowered host elements keep their lowercase tags",
	/__velaTag = "textbutton"/.test(source) && /__velaTag = "frame"/.test(source),
);

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`vide-harness: ${failure}`);
	}
	process.exit(1);
}

console.log(`vide-harness: verified ${4 - failures.length} lowering contracts`);
