const fs = require("node:fs");
const path = require("node:path");

// The runtime carries the default theme so the compiler never has to emit it,
// and the compiler diffs against the same file — one source of truth, copied in
// rather than imported because rbxtsc rejects a module outside `rootDir`.
const packageRoot = path.join(__dirname, "..");
const source = path.join(packageRoot, "..", "config", "src", "defaults.json");
const target = path.join(packageRoot, "src", "config-defaults.json");

if (!fs.existsSync(source)) {
	console.error(`materialize-config-defaults: missing ${source}.`);
	process.exit(1);
}

const contents = fs.readFileSync(source);

try {
	if (fs.readFileSync(target).equals(contents)) {
		process.exit(0);
	}
} catch {}

fs.writeFileSync(target, contents);
console.log(`materialize-config-defaults: wrote ${target}`);
