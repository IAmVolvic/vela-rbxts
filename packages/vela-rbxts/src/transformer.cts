import { createVelaProgramTransformer } from "@vela-rbxts/rbxtsc-host";

function createTransformer(
	...args: Parameters<typeof createVelaProgramTransformer>
) {
	return createVelaProgramTransformer(...args);
}

/** @deprecated Use createVelaProgramTransformer instead. */
const exportedTransformer = Object.assign(createTransformer, {
	createTransformer,
	createRbxtsTailwindProgramTransformer: createTransformer,
	default: createTransformer,
});

export = exportedTransformer;
