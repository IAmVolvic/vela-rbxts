export function detectLinuxRuntimeKind(): "gnu" | "musl" {
	if (typeof process.report?.getReport !== "function") {
		return "musl";
	}

	const report = process.report.getReport() as {
		header?: {
			glibcVersionRuntime?: string;
		};
	};

	return report.header?.glibcVersionRuntime ? "gnu" : "musl";
}

export function getHostCompilerTarget(): string | undefined {
	switch (process.platform) {
		case "darwin":
			return process.arch === "arm64"
				? "aarch64-apple-darwin"
				: "x86_64-apple-darwin";
		case "linux":
			return `${process.arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-${detectLinuxRuntimeKind()}`;
		case "win32":
			return process.arch === "arm64"
				? "aarch64-pc-windows-msvc"
				: "x86_64-pc-windows-msvc";
		default:
			return undefined;
	}
}

export function getCurrentCompilerBinaryPackageName(): string {
	if (process.platform === "darwin") {
		return `@vela-rbxts/compiler-darwin-${process.arch}`;
	}

	if (process.platform === "win32") {
		if (process.arch !== "x64") {
			throw new Error(
				`Unsupported compiler binary platform: ${process.platform}/${process.arch}.`,
			);
		}

		return "@vela-rbxts/compiler-win32-x64-msvc";
	}

	if (process.platform === "linux") {
		const runtimeKind = detectLinuxRuntimeKind();
		if (process.arch === "x64") {
			return `@vela-rbxts/compiler-linux-x64-${runtimeKind}`;
		}
		if (process.arch === "arm64") {
			return "@vela-rbxts/compiler-linux-arm64-gnu";
		}
	}

	throw new Error(
		`Unsupported compiler binary platform: ${process.platform}/${process.arch}.`,
	);
}
