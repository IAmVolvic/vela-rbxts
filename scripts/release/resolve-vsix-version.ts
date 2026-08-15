import { createRequire } from "node:module";
import { join } from "node:path";

import { getFlagValue } from "./release-config";
import { REPO_ROOT, readJsonFile } from "./utils/fs";
import { writeGithubOutput } from "./utils/github-output";
import { runMain } from "./utils/main";
import { fetchPublishedVsixVersions } from "./utils/marketplace";

const require = createRequire(import.meta.url);
const { nextFreeVsixBuildNumber, resolveMarketplaceVsixVersion } =
	require("./utils/vsix-version.cjs") as {
		nextFreeVsixBuildNumber: (input: {
			publishedVersions: readonly string[];
			now?: Date;
		}) => number;
		resolveMarketplaceVsixVersion: (input: {
			overrideVersion?: string;
			buildNumber?: string | number;
		}) => string;
	};

type ExtensionPackageJson = {
	name?: string;
	publisher?: string;
};

async function resolveExtensionId() {
	const manifest = await readJsonFile<ExtensionPackageJson>(
		join(REPO_ROOT, "packages/vscode-extension/package.json"),
	);
	const publisher = manifest.publisher?.trim();
	const name = manifest.name?.trim();
	if (!publisher || !name) {
		throw new Error(
			"packages/vscode-extension/package.json needs both publisher and name to address the Marketplace.",
		);
	}

	return `${publisher}.${name}`;
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const overrideVersion =
		getFlagValue(rawArgs, "--version")?.trim() ??
		process.env.VSIX_VERSION?.trim() ??
		"";
	const explicitBuildNumber =
		getFlagValue(rawArgs, "--build-number")?.trim() ??
		process.env.VSIX_BUILD_NUMBER?.trim() ??
		"";

	let version: string;
	if (overrideVersion) {
		version = resolveMarketplaceVsixVersion({ overrideVersion });
		console.error(`Using the explicit VSIX version ${version}.`);
	} else if (explicitBuildNumber) {
		version = resolveMarketplaceVsixVersion({
			buildNumber: explicitBuildNumber,
		});
		console.error(
			`Using the explicit build number ${explicitBuildNumber} -> ${version}.`,
		);
	} else {
		const extensionId = await resolveExtensionId();
		const publishedVersions = await fetchPublishedVsixVersions(extensionId);
		const buildNumber = nextFreeVsixBuildNumber({ publishedVersions });
		version = resolveMarketplaceVsixVersion({ buildNumber });
		console.error(
			`${extensionId} has ${publishedVersions.length} published version(s); the next free build number is ${buildNumber} -> ${version}.`,
		);
	}

	writeGithubOutput({ vsix_version: version });

	console.log(version);
}

runMain("release:vsix:version", main);
