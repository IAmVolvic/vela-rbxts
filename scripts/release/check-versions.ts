import { collectReleaseUnits } from "./release-config";

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

	if (process.argv.includes("--print")) {
		console.log(version);
		return;
	}

	console.log(`All ${releaseUnits.length} release units are on ${version}.`);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:check-versions failed: ${message}`);
	process.exit(1);
});
