import { setTimeout as delay } from "node:timers/promises";

import { getFlagValue, parseDryRunFlag, parseReleaseTag } from "./release-config";
import {
	PACK_MANIFEST_PATH,
	readTarballPackageManifest,
	type PackManifest,
	VERIFY_REPORT_PATH,
} from "./utils/artifacts";
import { runCommand } from "./utils/exec";
import { exists, readJsonFile } from "./utils/fs";
import { packageVersionExistsOnNpm, resolveNpmCommand } from "./utils/npm";
import { publishArtifactWithRecovery } from "./utils/publish-attempt";
import {
	type ArtifactPublishCandidate,
	assertNoDuplicateArtifactCoordinates,
	assertPublishPlanCoverage,
	computeOrderedPublishCandidates,
	formatArtifactCoordinate,
	resolvePublishDecisions,
} from "./utils/publish-plan";

async function main() {
	const rawArgs = process.argv.slice(2);
	const tag = parseReleaseTag(getFlagValue(rawArgs, "--tag"));
	const dryRun = parseDryRunFlag(rawArgs);

	if (!exists(PACK_MANIFEST_PATH)) {
		throw new Error(
			`Missing pack manifest at ${PACK_MANIFEST_PATH}. Run release:pack first.`,
		);
	}
	if (!exists(VERIFY_REPORT_PATH)) {
		throw new Error(
			`Missing verification report at ${VERIFY_REPORT_PATH}. Run release:verify before publishing.`,
		);
	}

	const packManifest = await readJsonFile<PackManifest>(PACK_MANIFEST_PATH);
	assertNoDuplicateArtifactCoordinates(packManifest.artifacts);

	if (packManifest.artifacts.length === 0) {
		throw new Error("Pack manifest has no artifacts to publish.");
	}

	console.log(`Total artifacts in pack manifest: ${packManifest.artifacts.length}`);

	const publishCandidates: ArtifactPublishCandidate[] = [];
	for (const artifact of packManifest.artifacts) {
		const tarManifest = await readTarballPackageManifest(artifact.tarballPath);
		if (tarManifest.name !== artifact.packageName) {
			throw new Error(
				`Tarball package name mismatch for ${artifact.tarballFileName}. Expected ${artifact.packageName}, got ${String(tarManifest.name)}.`,
			);
		}
		if (tarManifest.version !== artifact.version) {
			throw new Error(
				`Tarball package version mismatch for ${artifact.tarballFileName}. Expected ${artifact.version}, got ${String(tarManifest.version)}.`,
			);
		}

		publishCandidates.push({ artifact, manifest: tarManifest });
	}

	const orderedArtifacts = computeOrderedPublishCandidates(publishCandidates);
	assertPublishPlanCoverage(publishCandidates, orderedArtifacts);

	console.log(`Total publish candidates: ${publishCandidates.length}`);

	console.log(`Publish plan (tag=${tag}, dryRun=${dryRun}):`);
	for (const artifact of orderedArtifacts) {
		console.log(
			`- ${artifact.artifact.packageName}@${artifact.artifact.version} -> ${artifact.artifact.tarballPath}`,
		);
	}

	const decisions = await resolvePublishDecisions(
		orderedArtifacts,
		packageVersionExistsOnNpm,
	);

	const npmCommand = resolveNpmCommand();
	const publishedPackages: string[] = [];
	const recoveredPackages: string[] = [];
	const skippedPackages: string[] = [];
	const failedPackages: string[] = [];

	for (const decision of decisions) {
		const coordinate = formatArtifactCoordinate(decision.artifact);
		if (decision.action === "skip") {
			console.log(`skipped already published ${coordinate}`);
			skippedPackages.push(coordinate);
			continue;
		}

		if (dryRun) {
			console.log(`would publish ${coordinate}`);
			publishedPackages.push(coordinate);
			continue;
		}

		const publishArgs = [
			"publish",
			decision.artifact.tarballPath,
			"--tag",
			tag,
			"--access",
			"public",
		];
		if (process.env.CI) {
			publishArgs.push("--provenance");
		}

		const outcome = await publishArtifactWithRecovery({
			publish: () => {
				runCommand(npmCommand, publishArgs);
			},
			doesVersionExist: () =>
				packageVersionExistsOnNpm(
					decision.artifact.packageName,
					decision.artifact.version,
				),
			wait: delay,
		});

		if (outcome.status === "published") {
			console.log(`published ${coordinate}`);
			publishedPackages.push(coordinate);
			continue;
		}

		if (outcome.status === "recovered") {
			console.log(
				`published ${coordinate} despite a failing npm publish; the registry has it. Reported: ${outcome.reason}`,
			);
			publishedPackages.push(coordinate);
			recoveredPackages.push(coordinate);
			continue;
		}

		failedPackages.push(coordinate);
		console.error(`failed ${coordinate}: ${outcome.reason}`);
	}

	console.log("Publish summary:");
	console.log(`- published count: ${publishedPackages.length}`);
	console.log(`- recovered after a failing publish count: ${recoveredPackages.length}`);
	console.log(`- skipped already-published count: ${skippedPackages.length}`);
	console.log(`- failed count: ${failedPackages.length}`);
	console.log(`- published packages: ${publishedPackages.length > 0 ? publishedPackages.join(", ") : "(none)"}`);
	console.log(`- recovered packages: ${recoveredPackages.length > 0 ? recoveredPackages.join(", ") : "(none)"}`);
	console.log(`- skipped packages: ${skippedPackages.length > 0 ? skippedPackages.join(", ") : "(none)"}`);

	if (failedPackages.length > 0) {
		throw new Error(`Failed to publish ${failedPackages.length} packages: ${failedPackages.join(", ")}`);
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:publish:npm failed: ${message}`);
	process.exit(1);
});
