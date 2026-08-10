export type ReleaseNotesSource = "version" | "unreleased";

export type ReleaseNotes = {
	source: ReleaseNotesSource;
	heading: string;
	body: string;
};

type ChangelogSection = {
	heading: string;
	label: string;
	body: string;
};

const HEADING_RE = /^##\s+\[?([^\]\n]+?)\]?(?:\s+-\s+.*)?$/;
const LINK_DEFINITION_RE = /^\[[^\]]+\]:\s/;

export function normalizeVersion(rawVersion: string) {
	return rawVersion.trim().replace(/^v/i, "");
}

function trimBlankEdges(lines: readonly string[]) {
	let start = 0;
	let end = lines.length;

	while (start < end && lines[start].trim() === "") {
		start += 1;
	}

	while (end > start && lines[end - 1].trim() === "") {
		end -= 1;
	}

	return lines.slice(start, end).join("\n");
}

export function parseChangelogSections(changelog: string): ChangelogSection[] {
	const sections: ChangelogSection[] = [];
	let heading: string | undefined;
	let label = "";
	let lines: string[] = [];

	const flush = () => {
		if (heading === undefined) {
			return;
		}

		sections.push({ heading, label, body: trimBlankEdges(lines) });
	};

	for (const line of changelog.split(/\r?\n/)) {
		const match = HEADING_RE.exec(line);
		if (match) {
			flush();
			heading = line.trim();
			label = match[1].trim();
			lines = [];
			continue;
		}

		// The reference-style link block at the end of the file belongs to no
		// section, but it is parsed as part of the oldest one.
		if (heading !== undefined && !LINK_DEFINITION_RE.test(line)) {
			lines.push(line);
		}
	}

	flush();

	return sections;
}

/// The root changelog is hand-maintained, so a release can reach this point
/// with its entries still sitting under `Unreleased`.
export function extractReleaseNotes(
	changelog: string,
	version: string,
): ReleaseNotes | undefined {
	const target = normalizeVersion(version);
	const sections = parseChangelogSections(changelog);

	const versionSection = sections.find(
		(section) => normalizeVersion(section.label) === target,
	);
	if (versionSection?.body) {
		return {
			source: "version",
			heading: versionSection.heading,
			body: versionSection.body,
		};
	}

	const unreleasedSection = sections.find(
		(section) => section.label.toLowerCase() === "unreleased",
	);
	if (unreleasedSection?.body) {
		return {
			source: "unreleased",
			heading: unreleasedSection.heading,
			body: unreleasedSection.body,
		};
	}

	return undefined;
}
