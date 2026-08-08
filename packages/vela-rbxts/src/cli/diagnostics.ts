import type { HostDiagnostic } from "@vela-rbxts/rbxtsc-host";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type FormattedDiagnostic = {
	severity: DiagnosticSeverity;
	text: string;
};

export function toSeverity(level: string): DiagnosticSeverity {
	switch (level.toLowerCase()) {
		case "error":
			return "error";
		case "warning":
			return "warning";
		default:
			return "info";
	}
}

export function formatDiagnostic(
	relativePath: string,
	sourceText: string,
	diagnostic: HostDiagnostic,
): FormattedDiagnostic {
	const severity = toSeverity(diagnostic.level);
	const phase = diagnostic.source === "compiler" ? "compiler" : "host";
	const position = locate(sourceText, diagnostic);
	const location =
		position === undefined
			? relativePath
			: `${relativePath}:${position.line}:${position.column}`;

	return {
		severity,
		text: `${location} - ${severity} vela/${phase}(${diagnostic.code}): ${diagnostic.message}`,
	};
}

type Position = { line: number; column: number };

function locate(
	sourceText: string,
	diagnostic: HostDiagnostic,
): Position | undefined {
	const range = diagnostic.range;
	if (range && range.start <= Buffer.byteLength(sourceText)) {
		return toPosition(
			sourceText,
			byteOffsetToCharOffset(sourceText, range.start),
		);
	}

	// The compiler cannot anchor every diagnostic — a dynamic className among
	// them. Falling back to the first textual match matches the rbxtsc host.
	const token = diagnostic.token;
	if (token === undefined) {
		return undefined;
	}

	const offset = sourceText.indexOf(token);
	return offset < 0 ? undefined : toPosition(sourceText, offset);
}

function byteOffsetToCharOffset(
	sourceText: string,
	byteOffset: number,
): number {
	return Buffer.from(sourceText, "utf8")
		.subarray(0, byteOffset)
		.toString("utf8").length;
}

function toPosition(sourceText: string, charOffset: number): Position {
	const lines = sourceText.slice(0, charOffset).split("\n");

	return {
		line: lines.length,
		column: lines[lines.length - 1].length + 1,
	};
}
