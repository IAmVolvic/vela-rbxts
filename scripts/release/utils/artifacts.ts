import { join } from "node:path";

import { runCommandCapture } from "./exec";
import { ARTIFACT_DIRS } from "./fs";
import type { PackageJson } from "./package-json";

export const PACK_MANIFEST_PATH = join(ARTIFACT_DIRS.npm, "pack-manifest.json");
export const VERIFY_REPORT_PATH = join(ARTIFACT_DIRS.verify, "verification-report.json");

export type PackedArtifact = {
	packageName: string;
	version: string;
	tarballFileName: string;
	tarballPath: string;
	sourceDir: string;
	kind: "workspace" | "compiler" | "lsp";
};

export type PackManifest = {
	createdAt: string;
	artifactsRoot: string;
	artifacts: PackedArtifact[];
};

export function listTarEntries(tarballPath: string) {
	const { stdout } = runCommandCapture("tar", ["-tf", tarballPath]);
	return stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

export function readTarTextFile(tarballPath: string, entryPath: string) {
	const { stdout } = runCommandCapture("tar", ["-xOf", tarballPath, entryPath]);
	return stdout;
}

export function readTarballPackageManifest(tarballPath: string) {
	return JSON.parse(
		readTarTextFile(tarballPath, "package/package.json"),
	) as PackageJson;
}

export function assertTarballMatchesArtifact(
	manifest: PackageJson,
	artifact: PackedArtifact,
) {
	if (manifest.name !== artifact.packageName) {
		throw new Error(
			`Tarball package name mismatch for ${artifact.tarballFileName}. Expected ${artifact.packageName}, got ${String(manifest.name)}.`,
		);
	}
	if (manifest.version !== artifact.version) {
		throw new Error(
			`Tarball package version mismatch for ${artifact.tarballFileName}. Expected ${artifact.version}, got ${String(manifest.version)}.`,
		);
	}
}
