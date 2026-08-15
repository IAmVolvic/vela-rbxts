import { appendFileSync } from "node:fs";

export function writeGithubOutput(entries: Record<string, string>) {
	const githubOutput = process.env.GITHUB_OUTPUT;
	if (!githubOutput) {
		return;
	}

	const payload = Object.entries(entries)
		.map(([key, value]) => `${key}=${value}\n`)
		.join("");
	appendFileSync(githubOutput, payload, "utf8");
}
