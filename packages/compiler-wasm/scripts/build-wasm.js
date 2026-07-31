import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const CRATE_DIR = resolve(PACKAGE_DIR, "../compiler");
const OUT_DIR = join(PACKAGE_DIR, "dist");
const OUT_NAME = "vela_compiler";

// `web`, not `bundler`: it loads the same way under a bundler and a plain
// module script, and the caller decides where the payload is fetched from.
const TARGET = "web";

const WASM_PACK_LEFTOVERS = [
	"package.json",
	"README.md",
	"LICENSE",
	".gitignore",
];

const EXPECTED_ARTIFACTS = [
	`${OUT_NAME}.js`,
	`${OUT_NAME}.d.ts`,
	`${OUT_NAME}_bg.wasm`,
	`${OUT_NAME}_bg.wasm.d.ts`,
];

function assertToolchain() {
	const wasmPack = spawnSync("wasm-pack", ["--version"], { encoding: "utf8" });
	if (wasmPack.error || wasmPack.status !== 0) {
		throw new Error(
			"wasm-pack was not found on PATH. Install it with `cargo install wasm-pack` (or see https://drager.github.io/wasm-pack/installer/).",
		);
	}

	const targets = spawnSync("rustup", ["target", "list", "--installed"], {
		encoding: "utf8",
	});
	if (
		targets.status === 0 &&
		!targets.stdout.includes("wasm32-unknown-unknown")
	) {
		throw new Error(
			"The wasm32-unknown-unknown target is not installed. Add it with `rustup target add wasm32-unknown-unknown`.",
		);
	}
}

async function main() {
	assertToolchain();

	const result = spawnSync(
		"wasm-pack",
		[
			"build",
			"--target",
			TARGET,
			"--release",
			"--out-dir",
			OUT_DIR,
			"--out-name",
			OUT_NAME,
		],
		{ cwd: CRATE_DIR, stdio: "inherit" },
	);

	if (result.status !== 0) {
		throw new Error(
			`wasm-pack exited with status ${result.status ?? "unknown"}.`,
		);
	}

	// wasm-pack writes an npm package of its own into --out-dir; this one has its own manifest.
	for (const leftover of WASM_PACK_LEFTOVERS) {
		await rm(join(OUT_DIR, leftover), { force: true });
	}

	for (const artifact of EXPECTED_ARTIFACTS) {
		const artifactPath = join(OUT_DIR, artifact);
		if (!existsSync(artifactPath)) {
			throw new Error(
				`Expected wasm artifact ${artifact} at ${artifactPath}, but it was not found.`,
			);
		}
	}

	const { size } = await stat(join(OUT_DIR, `${OUT_NAME}_bg.wasm`));
	console.log(
		`Built ${OUT_NAME}_bg.wasm (${(size / 1024 / 1024).toFixed(2)} MiB) and its glue into ${OUT_DIR}`,
	);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`compiler-wasm build failed: ${message}`);
	process.exit(1);
});
