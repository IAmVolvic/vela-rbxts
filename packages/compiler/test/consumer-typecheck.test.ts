import { fileURLToPath } from "node:url";
import { transform } from "@vela-rbxts/compiler";
import ts from "typescript";
import { expect, test } from "vitest";

// The runtime is inlined into the file being compiled, so it is typechecked
// under the consumer's own compiler options rather than this repo's.
const emittedFileName = fileURLToPath(
	new URL("./App.vela.tsx", import.meta.url),
);
const rbxtsRoot = fileURLToPath(
	new URL("../../../node_modules/@rbxts", import.meta.url),
);

const strictConsumerOptions: ts.CompilerOptions = {
	allowSyntheticDefaultImports: true,
	downlevelIteration: true,
	jsx: ts.JsxEmit.React,
	jsxFactory: "React.createElement",
	jsxFragmentFactory: "React.Fragment",
	module: ts.ModuleKind.CommonJS,
	moduleResolution: ts.ModuleResolutionKind.Node10,
	moduleDetection: ts.ModuleDetectionKind.Force,
	noLib: true,
	skipLibCheck: true,
	strict: true,
	noUncheckedIndexedAccess: true,
	target: ts.ScriptTarget.ESNext,
	typeRoots: [rbxtsRoot],
	types: ["types", "compiler-types"],
	noEmit: true,
};

function typecheckEmit(source: string) {
	const result = transform(source);
	expect(result.changed).toBe(true);

	const host = ts.createCompilerHost(strictConsumerOptions, true);
	const readFile = host.readFile.bind(host);
	const fileExists = host.fileExists.bind(host);

	host.readFile = (name) =>
		name === emittedFileName ? result.code : readFile(name);
	host.fileExists = (name) =>
		name === emittedFileName ? true : fileExists(name);

	const program = ts.createProgram(
		[emittedFileName],
		strictConsumerOptions,
		host,
	);
	const emitted = program.getSourceFile(emittedFileName);

	return ts
		.getPreEmitDiagnostics(program, emitted)
		.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
		);
}

// `hover:` is what pulls the runtime host into the emit, and the runtime's
// indexed reads used to be typed as if an index could never miss.
test("the inlined runtime typechecks under noUncheckedIndexedAccess", () => {
	expect(
		typecheckEmit(`
import React from "@rbxts/react";

export const Badge = () => <frame className="bg-amber-300 hover:bg-amber-400" />;
`),
	).toEqual([]);
});

// The gradient path is the one that builds a ColorSequence out of an array
// whose length is only known at runtime.
test("the inlined runtime typechecks a composed gradient under noUncheckedIndexedAccess", () => {
	expect(
		typecheckEmit(`
import React from "@rbxts/react";

export const Sheet = (props: { className?: string }) => (
	<frame className={props.className}>
		<frame className="bg-gradient-to-r from-red-500 via-green-500 to-blue-500" />
	</frame>
);
`),
	).toEqual([]);
});
