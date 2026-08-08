import fs from "node:fs";
import path from "node:path";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

/** Relative paths use "/" so a manifest written on Windows still reads elsewhere. */
export function listFilesRecursive(root: string): string[] {
	const found: string[] = [];
	walk(root, "", found);
	found.sort();
	return found;
}

function walk(root: string, prefix: string, found: string[]): void {
	let entries: fs.Dirent[];

	try {
		entries = fs.readdirSync(path.join(root, prefix), { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

		if (entry.isDirectory()) {
			if (!SKIPPED_DIRECTORIES.has(entry.name)) {
				walk(root, relativePath, found);
			}
			continue;
		}

		if (entry.isFile()) {
			found.push(relativePath);
		}
	}
}

export function toSystemPath(root: string, relativePath: string): string {
	return path.join(root, ...relativePath.split("/"));
}

export function toRelativePath(root: string, filePath: string): string {
	return path.relative(root, filePath).split(path.sep).join("/");
}

export function isFile(filePath: string): boolean {
	try {
		return fs.statSync(filePath).isFile();
	} catch {
		return false;
	}
}

/** Skipping an identical write keeps `rbxtsc -w` from rebuilding untouched files. */
export function writeFileIfChanged(
	filePath: string,
	contents: Buffer | string,
): boolean {
	const next = typeof contents === "string" ? Buffer.from(contents) : contents;

	try {
		if (fs.readFileSync(filePath).equals(next)) {
			return false;
		}
	} catch {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
	}

	fs.writeFileSync(filePath, next);
	return true;
}

export function removeFile(filePath: string): boolean {
	try {
		fs.rmSync(filePath);
		return true;
	} catch {
		return false;
	}
}

export function removeEmptyDirectories(
	directory: string,
	stopAt: string,
): void {
	let current = directory;

	while (current !== stopAt && current.startsWith(stopAt)) {
		try {
			if (fs.readdirSync(current).length > 0) {
				return;
			}
			fs.rmdirSync(current);
		} catch {
			return;
		}

		current = path.dirname(current);
	}
}
