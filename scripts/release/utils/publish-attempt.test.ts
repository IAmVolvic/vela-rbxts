import { describe, expect, test } from "vitest";

import { publishArtifactWithRecovery } from "./publish-attempt";

function createHarness(options: {
	publishResults: readonly ("ok" | "throw")[];
	existsResults: readonly boolean[];
}) {
	const publishResults = [...options.publishResults];
	const existsResults = [...options.existsResults];
	const waits: number[] = [];
	let publishCalls = 0;
	let existsCalls = 0;

	return {
		waits,
		get publishCalls() {
			return publishCalls;
		},
		get existsCalls() {
			return existsCalls;
		},
		publish: () => {
			const result = publishResults.shift() ?? "throw";
			publishCalls += 1;
			if (result === "throw") {
				throw new Error("npm error code E401");
			}
		},
		doesVersionExist: async () => {
			existsCalls += 1;
			return existsResults.shift() ?? false;
		},
		wait: async (ms: number) => {
			waits.push(ms);
		},
	};
}

describe("publish attempt recovery", () => {
	test("publishes without touching the registry when npm succeeds", async () => {
		const harness = createHarness({ publishResults: ["ok"], existsResults: [] });

		const outcome = await publishArtifactWithRecovery(harness);

		expect(outcome).toEqual({ status: "published" });
		expect(harness.publishCalls).toBe(1);
		expect(harness.existsCalls).toBe(0);
		expect(harness.waits).toEqual([]);
	});

	test("recovers a version the registry accepted despite a failing publish", async () => {
		const harness = createHarness({
			publishResults: ["throw"],
			existsResults: [true],
		});

		const outcome = await publishArtifactWithRecovery(harness);

		expect(outcome.status).toBe("recovered");
		expect(outcome.status === "recovered" && outcome.reason).toContain("E401");
		expect(harness.publishCalls).toBe(1);
	});

	test("re-reads the registry before believing the version is missing", async () => {
		const harness = createHarness({
			publishResults: ["throw"],
			existsResults: [false, false, true],
		});

		const outcome = await publishArtifactWithRecovery(harness);

		expect(outcome.status).toBe("recovered");
		expect(harness.existsCalls).toBe(3);
		expect(harness.publishCalls).toBe(1);
	});

	test("retries a publish whose version really is missing", async () => {
		const harness = createHarness({
			publishResults: ["throw", "ok"],
			existsResults: [false, false, false],
		});

		const outcome = await publishArtifactWithRecovery(harness);

		expect(outcome).toEqual({ status: "published" });
		expect(harness.publishCalls).toBe(2);
	});

	test("fails after the last attempt and reports the npm error", async () => {
		const harness = createHarness({
			publishResults: ["throw", "throw", "throw"],
			existsResults: [],
		});

		const outcome = await publishArtifactWithRecovery(harness);

		expect(outcome.status).toBe("failed");
		expect(outcome.status === "failed" && outcome.reason).toContain("E401");
		expect(harness.publishCalls).toBe(3);
	});

	test("waits between registry reads and between publish attempts", async () => {
		const harness = createHarness({
			publishResults: ["throw", "ok"],
			existsResults: [false, false, false],
		});

		await publishArtifactWithRecovery({
			...harness,
			registryChecks: 2,
			registryDelayMs: 100,
			retryDelayMs: 900,
		});

		expect(harness.waits).toEqual([100, 900]);
	});

	test("rejects a non-positive attempt count", async () => {
		const harness = createHarness({ publishResults: [], existsResults: [] });

		await expect(
			publishArtifactWithRecovery({ ...harness, publishAttempts: 0 }),
		).rejects.toThrow("publishAttempts must be at least 1");
	});
});
