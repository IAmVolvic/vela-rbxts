import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getFlagValue } from "./release-config";
import { extractReleaseNotes } from "./utils/changelog";
import { ARTIFACTS_ROOT, ensureDir, REPO_ROOT, readJsonFile } from "./utils/fs";
import { writeGithubOutput } from "./utils/github-output";
import { runMain } from "./utils/main";

async function resolveReleaseTag(rawArgs: readonly string[]) {
	const explicitTag =
		getFlagValue(rawArgs, "--release-tag")?.trim() ??
		process.env.RELEASE_TAG?.trim() ??
		"";
	if (explicitTag) {
		return explicitTag;
	}

	const refName = process.env.GITHUB_REF_NAME?.trim();
	if (refName?.startsWith("v")) {
		return refName;
	}

	const rootManifest = await readJsonFile<{ version?: string }>(
		join(REPO_ROOT, "package.json"),
	);
	const version = rootManifest.version?.trim();
	if (!version) {
		throw new Error("The root package.json has no version to write notes for.");
	}

	return `v${version}`;
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const releaseTag = await resolveReleaseTag(rawArgs);
	const outputPath =
		getFlagValue(rawArgs, "--out")?.trim() ||
		join(ARTIFACTS_ROOT, "release-notes.md");

	const changelog = await readFile(join(REPO_ROOT, "CHANGELOG.md"), "utf8");
	const notes = extractReleaseNotes(changelog, releaseTag);

	if (!notes) {
		console.error(
			`CHANGELOG.md carries no entries for ${releaseTag}; the release will fall back to generated notes.`,
		);
		writeGithubOutput({ notes_source: "generated", notes_file: "" });
		return;
	}

	if (notes.source === "unreleased") {
		console.error(
			`CHANGELOG.md has no ${releaseTag} section yet; using the Unreleased entries.`,
		);
	}

	await ensureDir(dirname(outputPath));
	await writeFile(outputPath, `${notes.body}\n`, "utf8");

	console.error(`Wrote ${releaseTag} notes from "${notes.heading}".`);
	writeGithubOutput({ notes_source: notes.source, notes_file: outputPath });
	console.log(outputPath);
}

runMain("release:notes", main);
