export function runMain(label: string, main: () => Promise<void>) {
	main().catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`${label} failed: ${message}`);
		process.exit(1);
	});
}
