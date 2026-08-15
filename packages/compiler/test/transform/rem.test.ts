import { readFileSync } from "node:fs";
import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { emitted, hostConfig } from "./helpers";

const videRuntimeSource = readFileSync(
	new URL("../../../runtime-vide/src/index.ts", import.meta.url),
	"utf8",
);

// A statically lowered element never renders again, so an offset that has to
// follow the viewport leaves as a binding rather than as a value.
const staticRem = {
	configJson: JSON.stringify(
		defineConfig({ theme: { rem: { min: 16, max: 16 } } }),
	),
};

test("a static offset leaves as a rem binding with the namespace above it", () => {
	const result = transform('<frame className="w-4 p-2" />');

	expect(result.needsRuntimeHost).toBe(false);
	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 4)}",
	);
	expect(emitted(result.code)).toContain(
		"PaddingTop={__VelaRem.scale(new UDim(0, 8), 0)}",
	);
	expect(result.code).toMatch(
		/const __VelaRem = createVelaRemScaler\(\{[\s\S]*?"min": 8\.0/,
	);
	// Only the scaler, not the whole host.
	expect(result.code).not.toContain("createVelaRuntimeHost");
});

test("a pure scale value keeps its literal instead of paying for a binding", () => {
	const result = transform('<frame className="w-full h-1/2" />');

	expect(emitted(result.code)).toContain("Size={UDim2.fromScale(1, 0.5)}");
	expect(result.code).not.toContain("__VelaRem");
});

test("pinning rem takes the binding out of the emit entirely", () => {
	const result = transform('<frame className="w-4 p-2" />', staticRem);

	expect(emitted(result.code)).toContain("Size={UDim2.fromOffset(16, 0)}");
	expect(emitted(result.code)).toContain("PaddingTop={new UDim(0, 8)}");
	expect(result.code).not.toContain("__VelaRem");
});

// The host re-renders on a rem change of its own accord, so its props stay
// values and it is handed the names of the ones that are offsets.
test("a runtime host is named the props it should scale itself", () => {
	const result = transform('<frame className="w-4 p-2 hover:w-8" />');

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/__velaRem=\{\[\s*"Size"\s*\]\}/);
	expect(result.code).toContain("Size={(UDim2.fromOffset(16, 0) as never)}");
	// A helper is a host instance the runtime host never reads back, so it
	// takes the binding on this path too.
	expect(emitted(result.code)).toContain(
		"PaddingTop={(__VelaRem.scale(new UDim(0, 8), 0) as never)}",
	);
});

test("the Vide runtime host consumes rem metadata reactively", () => {
	const result = transform('<frame className="w-4 hover:w-8" />', {
		configJson: JSON.stringify(defineConfig({ framework: "vide" })),
	});

	expect(result.code).toContain('from "@rbxts/vela-runtime-vide"');
	expect(result.code).toMatch(/__velaRem=\{\[\s*"Size"\s*\]\}/);
	expect(videRuntimeSource).toContain(
		"for (const name of props.__velaRem ?? [])",
	);
	expect(videRuntimeSource).toContain("current.remRatio ?? 1");
	expect(videRuntimeSource).toContain("__VelaRemCore.TEXT_SIZE_CEILING");
});

test("the Vide margin wrapper reads its base spec and current rem ratio", () => {
	const result = transform('<frame className="m-4 hover:bg-red-500" />', {
		configJson: JSON.stringify(defineConfig({ framework: "vide" })),
	});

	expect(result.code).toContain("__velaMargin={");
	expect(videRuntimeSource).toContain("props.__velaMargin,");
	expect(videRuntimeSource).toContain("current.margin,");
	expect(videRuntimeSource).toContain(
		"PaddingTop: () => new UDim(0, margin()?.top ?? 0)",
	);
});

test("a rem config reaches the runtime host through the config it is handed", () => {
	const result = transform('<frame className="w-4 hover:w-8" />', {
		configJson: JSON.stringify(
			defineConfig({ theme: { rem: { min: 12, max: 32 } } }),
		),
	});

	expect(hostConfig(result.code).theme.rem).toEqual(
		expect.objectContaining({ min: 12, max: 32 }),
	);
});

// The runtime scales by `rem / base`, so a clamp pinned away from `base` is a
// constant ratio rather than no ratio. Dropping it from the emit would leave a
// static offset at 1 while everything the host resolves moved.
test("pinning rem away from base keeps the binding", () => {
	const result = transform('<frame className="w-4 p-2" />', {
		configJson: JSON.stringify(
			defineConfig({ theme: { rem: { min: 24, max: 24 } } }),
		),
	});

	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 4)}",
	);
	expect(result.code).toContain("createVelaRemScaler(");
});

// Roblox stops honoring TextSize past 100, so a scaled size stops there rather
// than tweening toward a size the engine never paints.
test("a scaled text size caps at the ceiling Roblox honors", () => {
	const result = transform('<textlabel className="text-6xl" />');

	expect(emitted(result.code)).toContain(
		"TextSize={__VelaRem.scaleText(60, 0)}",
	);

	// The host re-renders on a rem change itself, so it takes the size as a
	// value and caps it where the runtime does.
	const host = transform('<textlabel className="text-6xl hover:text-sm" />');

	expect(host.needsRuntimeHost).toBe(true);
	expect(host.code).toContain("TextSize={(60 as never)}");
});

test("scales a shadow offset with its other pixel dimensions", () => {
	const result = transform('<frame className="shadow-lg" />');

	expect(result.code).toMatch(
		/Offset=\{__VelaRem\.scale\(UDim2\.fromOffset\(0, 10\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/BlurRadius=\{__VelaRem\.scale\(new UDim\(0, 15\), \d+\)\}/,
	);
});

test("an inverted rem clamp collapses onto min instead of reaching the runtime", () => {
	const result = transform('<frame className="w-4 hover:w-8" />', {
		configJson: JSON.stringify({
			theme: { rem: { min: 32, max: 16 } },
		}),
	});

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"min": 32\.0,\s*"max": 32\.0/);
});

// A SurfaceGui is drawn on a part, at the pixel space the part gives it, so the
// viewport the curve follows says nothing about what happens under one.
test("a container named in pinnedUnder keeps the literal offsets below it", () => {
	const result = transform(
		'<surfacegui><frame className="w-4 p-2" /></surfacegui>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain("Size={UDim2.fromOffset(16, 0)}");
	expect(emitted(result.code)).toContain("PaddingTop={new UDim(0, 8)}");
	// Nothing below it scaled, so the file needs neither the scaler nor the pin
	// the runtime would otherwise have to be told about.
	expect(result.code).not.toContain("__VelaRem");
	expect(result.code).not.toContain("__VelaBoundary.Pin");
});

test("the pin stops at the container that opened it", () => {
	const result = transform(
		'<screengui><surfacegui><frame className="w-4" /></surfacegui><frame className="w-4" /></screengui>',
	);

	expect(emitted(result.code)).toContain("Size={UDim2.fromOffset(16, 0)}");
	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 0)}",
	);
});

// A component was compiled in a file of its own, against the viewport, so the
// only thing that can tell it where it was rendered is the scope around it.
test("a component under the pin is handed it at runtime", () => {
	const result = transform("<surfacegui><Panel /></surfacegui>");

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaBoundary.Pin><Panel/></__VelaBoundary.Pin>",
	);
	expect(result.code).toMatch(
		/import \{[^}]*__VelaBoundary[^}]*\} from "@rbxts\/vela-runtime";/,
	);
});

test("a runtime host under the pin resolves its own class value pinned", () => {
	const result = transform(
		'<surfacegui><frame className="w-4 hover:w-8" /></surfacegui>',
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaRemPinned={true}");
	// It was handed the pin, so there is nothing left for it to scale.
	expect(result.code).not.toContain("__velaRem={");
});

test("a Vide pin defers its children into the scope that holds them", () => {
	const result = transform("<surfacegui><Panel /></surfacegui>", {
		configJson: JSON.stringify(defineConfig({ framework: "vide" })),
	});

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaBoundary.Pin>{()=><Panel/>}</__VelaBoundary.Pin>",
	);
});

test("emptying pinnedUnder puts the container back on the curve", () => {
	const result = transform(
		'<surfacegui><frame className="w-4" /></surfacegui>',
		{
			configJson: JSON.stringify(
				defineConfig({ theme: { rem: { pinnedUnder: [] } } }),
			),
		},
	);

	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 0)}",
	);
});

// The runtime is told where a pin lands rather than where one could land, so
// the list of containers is compile-time only.
test("the pinned containers never travel with the config", () => {
	const result = transform('<frame className="w-4 hover:w-8" />');

	expect(result.code).not.toContain("pinnedUnder");
	expect(hostConfig(result.code).theme.rem.pinnedUnder).toBeUndefined();
});
