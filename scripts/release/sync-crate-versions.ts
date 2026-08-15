import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectReleaseUnits } from "./release-config";
import { runMain } from "./utils/main";

const CARGO_CRATES = [
	{ name: "vela-rbxts-compiler", dir: "packages/compiler" },
	{ name: "vela-rbxts-lsp", dir: "packages/lsp" },
] as const;

const CARGO_LOCKS = ["packages/compiler/Cargo.lock", "packages/lsp/Cargo.lock"] as const;

function replaceOnce(contents: string, pattern: RegExp, replacement: string, where: string) {
	if (!pattern.test(contents)) {
		throw new Error(`Could not find ${pattern} in ${where}.`);
	}

	return contents.replace(pattern, replacement);
}

// changesets only versions workspace packages, so the crate manifests, their
// lock files, and the private root manifest are aligned here to keep the
// lockstep gate in check-versions.ts green.
async function main() {
	const releaseUnits = await collectReleaseUnits();
	const versions = new Set(releaseUnits.map((unit) => unit.version));

	if (versions.size !== 1) {
		throw new Error(
			`Release units disagree on a version (${[...versions].join(", ")}); run changeset version first.`,
		);
	}

	const [version] = [...versions];

	for (const crate of CARGO_CRATES) {
		const manifestPath = join(process.cwd(), crate.dir, "Cargo.toml");
		const manifest = replaceOnce(
			readFileSync(manifestPath, "utf8"),
			/^version\s*=\s*"[^"]+"/m,
			`version = "${version}"`,
			manifestPath,
		);
		writeFileSync(manifestPath, manifest);
	}

	// Lock files are untracked, so they only exist on local checkouts; cargo
	// reconciles a stale self-version on the next build anyway.
	for (const lockPath of CARGO_LOCKS) {
		const absolutePath = join(process.cwd(), lockPath);
		if (!existsSync(absolutePath)) {
			continue;
		}
		let contents = readFileSync(absolutePath, "utf8");

		for (const crate of CARGO_CRATES) {
			const entry = new RegExp(`(name = "${crate.name}"\\nversion = )"[^"]+"`);
			if (entry.test(contents)) {
				contents = contents.replace(entry, `$1"${version}"`);
			}
		}

		writeFileSync(absolutePath, contents);
	}

	const rootManifestPath = join(process.cwd(), "package.json");
	const rootManifest = replaceOnce(
		readFileSync(rootManifestPath, "utf8"),
		/^(\s*)"version":\s*"[^"]+"/m,
		`$1"version": "${version}"`,
		rootManifestPath,
	);
	writeFileSync(rootManifestPath, rootManifest);

	console.log(`Synced crate and root manifests to ${version}.`);
}

runMain("release:sync-crate-versions", main);
