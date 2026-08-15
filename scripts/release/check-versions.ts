import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectReleaseUnits } from "./release-config";
import { runMain } from "./utils/main";

const CARGO_MANIFESTS = [
	"packages/compiler/Cargo.toml",
	"packages/lsp/Cargo.toml",
] as const;

function readCargoVersion(manifestPath: string): string {
	const contents = readFileSync(join(process.cwd(), manifestPath), "utf8");
	const match = contents.match(/^version\s*=\s*"([^"]+)"/m);

	if (!match) {
		throw new Error(`Missing version field in ${manifestPath}.`);
	}

	return match[1];
}

async function main() {
	const releaseUnits = await collectReleaseUnits();
	const versions = new Map<string, string[]>();

	for (const unit of releaseUnits) {
		const names = versions.get(unit.version) ?? [];
		names.push(`${unit.name} (${unit.path})`);
		versions.set(unit.version, names);
	}

	if (versions.size !== 1) {
		const details = Array.from(versions.entries())
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([version, names]) => `${version}\n  ${names.join("\n  ")}`)
			.join("\n");
		throw new Error(
			`Release units are not on a single version. The release tag drives every package, so they must move together.\n${details}`,
		);
	}

	const [version] = Array.from(versions.keys());
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
		throw new Error(`Release version "${version}" is not a valid semver version.`);
	}

	for (const manifestPath of CARGO_MANIFESTS) {
		const cargoVersion = readCargoVersion(manifestPath);
		if (cargoVersion !== version) {
			throw new Error(
				`${manifestPath} is on ${cargoVersion}, but the release version is ${version}. Crate versions move in lockstep with the packages.`,
			);
		}
	}

	if (process.argv.includes("--print")) {
		console.log(version);
		return;
	}

	console.log(`All ${releaseUnits.length} release units are on ${version}.`);
}

runMain("release:check-versions", main);
