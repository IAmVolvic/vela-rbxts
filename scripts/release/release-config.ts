import { discoverWorkspacePackages, type WorkspacePackage } from "./utils/package-json";

/// The runtime lives under the `@rbxts` scope so a consumer's stock roblox-ts
/// tsconfig and Rojo project already reach it — roblox-ts only resolves a
/// package whose scope directory is one of the configured `typeRoots`.
export const RUNTIME_PACKAGE_NAME = "@rbxts/vela-runtime";

/// The framework-neutral half every host runtime is built on. It publishes
/// under the same scope and for the same reason: a consumer's stock Rojo
/// project already maps `node_modules/@rbxts`, so it arrives with no new
/// mapping of its own.
export const RUNTIME_CORE_PACKAGE_NAME = "@rbxts/vela-runtime-core";

/// The Vide host runtime. A project installs whichever host its `framework`
/// names; both are built on the core.
export const RUNTIME_VIDE_PACKAGE_NAME = "@rbxts/vela-runtime-vide";

const RUNTIME_PACKAGE_NAMES = [
  RUNTIME_PACKAGE_NAME,
  RUNTIME_CORE_PACKAGE_NAME,
  RUNTIME_VIDE_PACKAGE_NAME,
] as const;

export const RELEASE_TAGS = ["next", "latest"] as const;
export type ReleaseTag = (typeof RELEASE_TAGS)[number];

export type ReleaseKind = "npm" | "native" | "lsp" | "vscode-extension";

export type ReleaseUnit = {
  name: string;
  version: string;
  path: string;
  absPath: string;
  kind: ReleaseKind;
  publishToNpm: boolean;
  private: boolean;
  source: WorkspacePackage;
};

export const EXPECTED_PUBLIC_RELEASE_NAMES = [
  "vela-rbxts",
  "@rbxts/vela-runtime",
  "@rbxts/vela-runtime-core",
  "@rbxts/vela-runtime-vide",
  "@vela-rbxts/compiler",
  "@vela-rbxts/compiler-wasm",
  "@vela-rbxts/config",
  "@vela-rbxts/core",
  "@vela-rbxts/ir",
  "@vela-rbxts/types",
  "@vela-rbxts/rbxtsc-host",
  "@vela-rbxts/lsp",
  "vela-rbxts-lsp",
] as const;

export const WORKSPACE_PUBLISH_PRIORITY = [
  "@rbxts/vela-runtime-core",
  "@rbxts/vela-runtime",
  "@rbxts/vela-runtime-vide",
  "@vela-rbxts/types",
  "@vela-rbxts/config",
  "@vela-rbxts/ir",
  "@vela-rbxts/core",
  "@vela-rbxts/rbxtsc-host",
  "@vela-rbxts/compiler",
  "@vela-rbxts/compiler-wasm",
  "@vela-rbxts/lsp",
  "vela-rbxts",
] as const;

export function parseReleaseTag(rawTag: string | undefined): ReleaseTag {
  const tag = rawTag?.trim();
  if (!tag || !RELEASE_TAGS.includes(tag as ReleaseTag)) {
    throw new Error(
      `Missing or invalid --tag. Expected one of: ${RELEASE_TAGS.join(", ")}.`,
    );
  }

  return tag as ReleaseTag;
}

export function parseDryRunFlag(rawArgs: readonly string[]) {
  return rawArgs.includes("--dry-run");
}

export function getFlagValue(
  rawArgs: readonly string[],
  flagName: string,
) {
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === flagName) {
      return rawArgs[index + 1];
    }

    const prefix = `${flagName}=`;
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }

  return undefined;
}

export async function collectReleaseUnits() {
  const workspacePackages = await discoverWorkspacePackages();
  const releaseUnits: ReleaseUnit[] = [];

  for (const pkg of workspacePackages) {
    if (!pkg.path.startsWith("packages/")) {
      continue;
    }

    const name = pkg.manifest.name?.trim();
    const version = pkg.manifest.version?.trim();
    if (!name || !version) {
      continue;
    }

    const isPrivate = pkg.manifest.private === true;
    const kind = classifyPackageKind(pkg.path, name);
    if (!kind) {
      continue;
    }

    const publishToNpm = kind !== "vscode-extension";
    const isPublicUnit =
      kind === "lsp" || kind === "vscode-extension" || !isPrivate;

    if (!isPublicUnit) {
      continue;
    }

    releaseUnits.push({
      name,
      version,
      path: pkg.path,
      absPath: pkg.absolutePath,
      kind,
      publishToNpm,
      private: isPrivate,
      source: pkg,
    });
  }

  validateReleaseUnitNames(releaseUnits);
  return releaseUnits.sort((left, right) => left.path.localeCompare(right.path));
}

function classifyPackageKind(path: string, packageName: string): ReleaseKind | undefined {
  if (path === "packages/vscode-extension") {
    return "vscode-extension";
  }

  if (path === "packages/compiler" || packageName === "@vela-rbxts/compiler") {
    return "native";
  }

  if (path === "packages/lsp" || packageName === "@vela-rbxts/lsp") {
    return "lsp";
  }

  if (
    packageName === "vela-rbxts" ||
    RUNTIME_PACKAGE_NAMES.includes(packageName as never) ||
    packageName.startsWith("@vela-rbxts/")
  ) {
    return "npm";
  }

  return undefined;
}

function validateReleaseUnitNames(releaseUnits: readonly ReleaseUnit[]) {
  for (const unit of releaseUnits) {
    if (unit.kind === "vscode-extension") {
      if (unit.name !== "vela-rbxts-lsp") {
        throw new Error(
          `Unexpected VS Code extension package name "${unit.name}" at ${unit.path}. Expected "vela-rbxts-lsp".`,
        );
      }
      continue;
    }

    if (
      unit.name !== "vela-rbxts" &&
      !RUNTIME_PACKAGE_NAMES.includes(unit.name as never) &&
      !unit.name.startsWith("@vela-rbxts/")
    ) {
      throw new Error(
        `Unexpected package name "${unit.name}" at ${unit.path}. Expected "vela-rbxts", ${RUNTIME_PACKAGE_NAMES.map((name) => `"${name}"`).join(", ")} or "@vela-rbxts/*".`,
      );
    }
  }

  const discoveredNames = new Set(releaseUnits.map((unit) => unit.name));
  for (const expectedName of EXPECTED_PUBLIC_RELEASE_NAMES) {
    if (!discoveredNames.has(expectedName)) {
      throw new Error(
        `Expected release package "${expectedName}" was not discovered from workspace metadata.`,
      );
    }
  }
}
