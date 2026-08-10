import { describe, expect, test } from "vitest";

import {
	extractReleaseNotes,
	normalizeVersion,
	parseChangelogSections,
} from "./changelog";

const CHANGELOG = `# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Something still in flight.

## [0.11.0] - 2026-08-08

### Added

- The \`vela\` CLI.

### Changed

- \`vela.config.ts\` is evaluated once per build.

## [0.10.0] - 2026-08-04

### Fixed

- A motion driver's \`transition\` is called as a method.

[Unreleased]: https://github.com/astra-void/vela-rbxts/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/astra-void/vela-rbxts/compare/v0.10.0...v0.11.0
`;

describe("version normalization", () => {
	test.each([
		["v0.11.0", "0.11.0"],
		["0.11.0", "0.11.0"],
		[" v0.11.0-next.0 ", "0.11.0-next.0"],
	])("normalizes %s to %s", (rawVersion, expectedVersion) => {
		expect(normalizeVersion(rawVersion)).toBe(expectedVersion);
	});
});

describe("changelog parsing", () => {
	test("reads every level-two section", () => {
		expect(parseChangelogSections(CHANGELOG).map((s) => s.label)).toEqual([
			"Unreleased",
			"0.11.0",
			"0.10.0",
		]);
	});

	test("keeps the trailing link block out of the oldest section", () => {
		const oldest = parseChangelogSections(CHANGELOG).at(-1);

		expect(oldest?.body).toBe(
			"### Fixed\n\n- A motion driver's `transition` is called as a method.",
		);
	});
});

describe("release notes extraction", () => {
	test("prefers the section matching the release tag", () => {
		const notes = extractReleaseNotes(CHANGELOG, "v0.11.0");

		expect(notes?.source).toBe("version");
		expect(notes?.heading).toBe("## [0.11.0] - 2026-08-08");
		expect(notes?.body).toBe(
			"### Added\n\n- The `vela` CLI.\n\n### Changed\n\n- `vela.config.ts` is evaluated once per build.",
		);
	});

	test("falls back to Unreleased when the version has no section yet", () => {
		const notes = extractReleaseNotes(CHANGELOG, "v0.12.0");

		expect(notes?.source).toBe("unreleased");
		expect(notes?.body).toBe("### Added\n\n- Something still in flight.");
	});

	test("skips an empty version section in favour of Unreleased", () => {
		const changelog =
			"## [Unreleased]\n\n- Pending.\n\n## [0.12.0] - 2026-09-01\n";

		expect(extractReleaseNotes(changelog, "0.12.0")).toEqual({
			source: "unreleased",
			heading: "## [Unreleased]",
			body: "- Pending.",
		});
	});

	test("returns nothing when neither section carries entries", () => {
		expect(
			extractReleaseNotes("# Changelog\n\n## [Unreleased]\n", "0.12.0"),
		).toBe(undefined);
	});
});
