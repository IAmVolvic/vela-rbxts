export type PublishAttemptOutcome =
	| { status: "published" }
	| { status: "recovered"; reason: string }
	| { status: "failed"; reason: string };

export type PublishAttemptOptions = {
	publish: () => void;
	doesVersionExist: () => Promise<boolean>;
	wait: (ms: number) => Promise<void>;
	publishAttempts?: number;
	registryChecks?: number;
	retryDelayMs?: number;
	registryDelayMs?: number;
};

export const DEFAULT_PUBLISH_ATTEMPTS = 3;
export const DEFAULT_REGISTRY_CHECKS = 3;
export const DEFAULT_RETRY_DELAY_MS = 5_000;
export const DEFAULT_REGISTRY_DELAY_MS = 5_000;

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

// A failed `npm publish` does not mean the version is absent: a large tarball
// can outlive the OIDC token it was signed with and report E401 after the
// registry already accepted it. Every failure is checked against the registry
// before it is retried, so a retry only runs against a version really missing.
export async function publishArtifactWithRecovery(
	options: PublishAttemptOptions,
): Promise<PublishAttemptOutcome> {
	const publishAttempts = options.publishAttempts ?? DEFAULT_PUBLISH_ATTEMPTS;
	const registryChecks = options.registryChecks ?? DEFAULT_REGISTRY_CHECKS;
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
	const registryDelayMs = options.registryDelayMs ?? DEFAULT_REGISTRY_DELAY_MS;

	if (publishAttempts < 1) {
		throw new Error(`publishAttempts must be at least 1, got ${publishAttempts}.`);
	}

	let lastReason = "";

	for (let attempt = 1; attempt <= publishAttempts; attempt += 1) {
		try {
			options.publish();
			return { status: "published" };
		} catch (error) {
			lastReason = describeError(error);
		}

		// A write the registry accepted can take a moment to be readable, so an
		// absent version is only believed after the reads stop changing.
		for (let check = 1; check <= registryChecks; check += 1) {
			if (await options.doesVersionExist()) {
				return { status: "recovered", reason: lastReason };
			}
			if (check < registryChecks) {
				await options.wait(registryDelayMs);
			}
		}

		if (attempt < publishAttempts) {
			await options.wait(retryDelayMs);
		}
	}

	return { status: "failed", reason: lastReason };
}
