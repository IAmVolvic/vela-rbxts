const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REQUEST_TIMEOUT_MS = 15000;
const COMPLETION_KIND_COLOR = 16;

const root = path.join(__dirname, "..");
const binary = path.join(
	root,
	"..",
	"..",
	"packages",
	"lsp",
	"target",
	"release",
	"vela-rbxts-lsp",
);

if (!fs.existsSync(binary)) {
	console.error(
		`missing LSP binary at ${binary}; run \`pnpm --filter @vela-rbxts/lsp build\` first`,
	);
	process.exit(1);
}

const child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] });

let nextId = 1;
const pending = new Map();
const notifications = [];
const notificationWaiters = [];
let buffer = Buffer.alloc(0);

child.stdout.on("data", (chunk) => {
	buffer = Buffer.concat([buffer, chunk]);
	for (;;) {
		const headerEnd = buffer.indexOf("\r\n\r\n");
		if (headerEnd < 0) {
			return;
		}
		const header = buffer.subarray(0, headerEnd).toString("utf8");
		const match = /Content-Length:\s*(\d+)/i.exec(header);
		if (!match) {
			buffer = buffer.subarray(headerEnd + 4);
			continue;
		}
		const length = Number(match[1]);
		const start = headerEnd + 4;
		if (buffer.length < start + length) {
			return;
		}
		const message = JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
		buffer = buffer.subarray(start + length);
		dispatch(message);
	}
});

function dispatch(message) {
	if (message.id !== undefined && pending.has(message.id)) {
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) {
			reject(new Error(`${message.error.code}: ${message.error.message}`));
		} else {
			resolve(message.result);
		}
		return;
	}

	if (message.method) {
		notifications.push(message);
		for (const waiter of [...notificationWaiters]) {
			waiter();
		}
	}
}

function send(message) {
	const body = Buffer.from(JSON.stringify(message), "utf8");
	child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
	child.stdin.write(body);
}

function request(method, params) {
	const id = nextId++;
	send(
		params === undefined
			? { jsonrpc: "2.0", id, method }
			: { jsonrpc: "2.0", id, method, params },
	);
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		setTimeout(() => {
			if (pending.delete(id)) {
				reject(new Error(`timed out waiting for ${method} response`));
			}
		}, REQUEST_TIMEOUT_MS).unref();
	});
}

function notify(method, params) {
	send(
		params === undefined
			? { jsonrpc: "2.0", method }
			: { jsonrpc: "2.0", method, params },
	);
}

function waitForDiagnostics(uri) {
	return new Promise((resolve, reject) => {
		const check = () => {
			const found = notifications
				.filter(
					(entry) =>
						entry.method === "textDocument/publishDiagnostics" &&
						entry.params.uri === uri,
				)
				.pop();
			if (found) {
				resolve(found.params.diagnostics);
				return true;
			}
			return false;
		};

		if (check()) {
			return;
		}
		const timer = setTimeout(() => {
			reject(new Error(`timed out waiting for diagnostics of ${uri}`));
		}, REQUEST_TIMEOUT_MS);
		timer.unref();
		notificationWaiters.push(() => {
			if (check()) {
				clearTimeout(timer);
			}
		});
	});
}

function openFixture(name) {
	const filePath = path.join(root, "fixtures", name);
	const text = fs.readFileSync(filePath, "utf8");
	const uri = pathToFileURL(filePath).href;
	notify("textDocument/didOpen", {
		textDocument: { uri, languageId: "typescriptreact", version: 1, text },
	});
	return { uri, text };
}

// Fixtures are ASCII, so byte offsets equal UTF-16 columns.
function positionAt(text, index) {
	const before = text.slice(0, index);
	const line = (before.match(/\n/g) ?? []).length;
	return { line, character: index - before.lastIndexOf("\n") - 1 };
}

function offsetAt(text, position) {
	const lines = text.split("\n");
	let offset = 0;
	for (let line = 0; line < position.line; line++) {
		offset += lines[line].length + 1;
	}
	return offset + position.character;
}

function sliceRange(text, range) {
	return text.slice(offsetAt(text, range.start), offsetAt(text, range.end));
}

const failures = [];

function check(condition, message) {
	if (!condition) {
		failures.push(message);
	}
}

function diagnosticFor(diagnostics, token) {
	return diagnostics.find((entry) => entry.data?.token === token);
}

async function main() {
	const init = await request("initialize", {
		processId: process.pid,
		rootUri: pathToFileURL(root).href,
		capabilities: {},
	});
	check(
		init.serverInfo?.name === "vela-rbxts-lsp",
		`unexpected server name: ${init.serverInfo?.name}`,
	);
	check(Boolean(init.capabilities.completionProvider), "missing completion capability");
	check(Boolean(init.capabilities.colorProvider), "missing document color capability");
	check(Boolean(init.capabilities.hoverProvider), "missing hover capability");
	notify("initialized", {});

	const diagnosticsFixture = openFixture("Diagnostics.tsx");
	const diagnostics = await waitForDiagnostics(diagnosticsFixture.uri);

	const expectedCodes = [
		["tracking-wide", "no-roblox-equivalent"],
		["md:rounded-mdd", "unknown-theme-key"],
		["bg-[oops]", "unsupported-arbitrary-value"],
		["from-blue-600/50", "unsupported-opacity-modifier"],
		["blorb-2", "unsupported-utility-family"],
		["checked:px-2", "unknown-variant"],
		["duration-fast", "unsupported-transition-value"],
		["animate-ping", "unsupported-animation-value"],
		["scroll-smooth", "unsupported-scroll-value"],
		["font-handwriting", "unknown-theme-key"],
	];
	for (const [token, code] of expectedCodes) {
		const diagnostic = diagnosticFor(diagnostics, token);
		check(diagnostic, `missing diagnostic for token ${token}`);
		if (!diagnostic) {
			continue;
		}
		check(
			diagnostic.code === code,
			`token ${token} reported ${diagnostic.code}, expected ${code}`,
		);
		check(diagnostic.severity === 2, `token ${token} should be a warning`);
		const anchored = sliceRange(diagnosticsFixture.text, diagnostic.range);
		check(
			anchored === token,
			`token ${token} range anchors to ${JSON.stringify(anchored)}`,
		);
	}
	check(
		!diagnosticFor(diagnostics, "rounded"),
		'bare "rounded" should resolve to the default radius without diagnostics',
	);
	check(
		!diagnosticFor(diagnostics, "bg-slate-700"),
		'"bg-slate-700" should resolve without diagnostics',
	);
	check(
		!diagnosticFor(diagnostics, "px-4"),
		'object-key "px-4" should resolve without diagnostics',
	);
	for (const token of [
		"right-4",
		"order-2",
		"self-center",
		"grid-cols-3",
		"-translate-x-1/2",
		"basis-1/2",
		"mx-auto",
		"pointer-events-none",
		"space-y-2",
		"ring-2",
		"m-4",
		"-ml-2",
		"divide-y-2",
		"divide-slate-500",
		"hover:bg-blue-600",
		"active:bg-rose-500",
		"focus:border-blue-600",
		"bg-[#ff0000]",
		"bg-blue-600/50",
		"transition",
		"duration-300",
		"ease-out",
		"animate-spin",
		"uppercase",
		"underline",
		"scroll-y",
		"scrollbar-w-2",
		"scrollbar-slate-500",
		"canvas-auto",
		"font-mono",
		"font-bold",
	]) {
		check(
			!diagnosticFor(diagnostics, token),
			`"${token}" should resolve without diagnostics`,
		);
	}

	const colors = await request("textDocument/documentColor", {
		textDocument: { uri: diagnosticsFixture.uri },
	});
	check(
		Array.isArray(colors) && colors.length > 0,
		"documentColor returned no colors for bg-slate-700",
	);

	const slate700 = (colors ?? []).find(
		(entry) => sliceRange(diagnosticsFixture.text, entry.range) === "bg-slate-700",
	);
	check(slate700, "missing document color entry for bg-slate-700");
	if (slate700) {
		const presentations = await request("textDocument/colorPresentation", {
			textDocument: { uri: diagnosticsFixture.uri },
			range: slate700.range,
			color: { red: 98 / 255, green: 116 / 255, blue: 142 / 255, alpha: 1 },
		});
		const labels = (presentations ?? []).map((entry) => entry.label);
		// `bg-slate` (the DEFAULT shade) shares slate-500's RGB, so either may win
		// the exact-match tie.
		check(
			labels[0] === "bg-slate-500" || labels[0] === "bg-slate",
			`picking the slate-500 color should lead with a matching theme token, got ${labels[0]}`,
		);
		check(
			labels.includes("bg-slate-500"),
			"bg-slate-500 should be offered for its exact RGB",
		);
		check(
			labels.includes("bg-slate-700"),
			"the current token should stay available among presentations",
		);
		const presentationEdit = (presentations ?? []).find(
			(entry) => entry.label === "bg-slate-500",
		)?.textEdit;
		check(
			presentationEdit &&
				sliceRange(diagnosticsFixture.text, presentationEdit.range) ===
					"bg-slate-700",
			"presentation edit should replace the whole token",
		);
	}

	const hoverIndex = diagnosticsFixture.text.indexOf('"px-4"') + 3;
	const hover = await request("textDocument/hover", {
		textDocument: { uri: diagnosticsFixture.uri },
		position: positionAt(diagnosticsFixture.text, hoverIndex),
	});
	check(
		Boolean(hover?.contents?.value?.trim()),
		"hover over an object-key class returned no content",
	);

	const variantHoverIndex = diagnosticsFixture.text.indexOf("checked:px-2") + 2;
	const variantHover = await request("textDocument/hover", {
		textDocument: { uri: diagnosticsFixture.uri },
		position: positionAt(diagnosticsFixture.text, variantHoverIndex),
	});
	check(
		(variantHover?.contents?.value ?? "").includes("Unknown variant `checked`"),
		"hover over an unknown variant should call the variant out instead of claiming it runs",
	);

	const codeActionsFor = (diagnostic) =>
		request("textDocument/codeAction", {
			textDocument: { uri: diagnosticsFixture.uri },
			range: diagnostic.range,
			context: { diagnostics: [diagnostic] },
		});
	const actionEditTexts = (actions) =>
		(actions ?? []).map(
			(action) => action.edit?.changes?.[diagnosticsFixture.uri]?.[0]?.newText,
		);

	const variantDiagnostic = diagnosticFor(diagnostics, "hover:px-4");
	if (variantDiagnostic) {
		const texts = actionEditTexts(await codeActionsFor(variantDiagnostic));
		check(
			texts.includes("px-4"),
			"unknown-variant quickfix should offer dropping the variant to keep `px-4`",
		);
		check(texts.includes(""), "quickfix should still offer removing the token");
	}

	const typoDiagnostic = diagnosticFor(diagnostics, "md:rounded-mdd");
	if (typoDiagnostic) {
		const texts = actionEditTexts(await codeActionsFor(typoDiagnostic));
		check(
			texts.includes("md:rounded-md"),
			"theme-key quickfix should keep the typed `md:` variant",
		);
	}

	const completionsFixture = openFixture("Completions.tsx");
	await waitForDiagnostics(completionsFixture.uri);
	const typed = "md:bg-sl";
	const typedIndex = completionsFixture.text.indexOf(typed);
	const completion = await request("textDocument/completion", {
		textDocument: { uri: completionsFixture.uri },
		position: positionAt(completionsFixture.text, typedIndex + typed.length),
		context: { triggerKind: 1 },
	});
	check(
		completion?.isIncomplete === true,
		"completion should return an incomplete list so the server-side matcher stays in charge",
	);
	const items = completion?.items ?? [];
	check(items.length > 0, "completion returned no items");
	check(
		items.every((item) => item.label !== "md:"),
		"an already-typed variant should not be offered again",
	);

	const colorItem = items.find((item) => item.label === "bg-slate-500");
	check(colorItem, "missing bg-slate-500 completion for prefix md:bg-sl");
	if (colorItem) {
		check(
			colorItem.kind === COMPLETION_KIND_COLOR,
			`bg-slate-500 completion kind is ${colorItem.kind}, expected color`,
		);
		check(
			/^#[0-9a-fA-F]{6}$/.test(colorItem.detail ?? ""),
			`bg-slate-500 detail should be a hex swatch, got ${JSON.stringify(colorItem.detail)}`,
		);
		check(
			typeof colorItem.documentation === "string" &&
				/^#[0-9a-fA-F]{6}$/.test(colorItem.documentation),
			`color completion documentation must be the bare hex string so the client draws a swatch, got ${JSON.stringify(colorItem.documentation)}`,
		);
		check(
			typeof colorItem.sortText === "string" && colorItem.sortText.length > 0,
			"bg-slate-500 completion is missing sortText",
		);
		const editRange = colorItem.textEdit?.range;
		check(editRange, "bg-slate-500 completion is missing a text edit");
		if (editRange) {
			check(
				sliceRange(completionsFixture.text, editRange) === "bg-sl",
				"completion edit should replace only the utility after the typed variant",
			);
		}
	}

	const brokenFixture = openFixture("Broken.tsx");
	const brokenDiagnostics = await waitForDiagnostics(brokenFixture.uri);
	const brokenUnknownVariant = diagnosticFor(brokenDiagnostics, "checked:px-4");
	check(
		brokenUnknownVariant?.code === "unknown-variant",
		"a file that fails to parse should still surface diagnostics via the lexical fallback",
	);

	await request("shutdown");
	notify("exit");
}

main()
	.catch((error) => {
		failures.push(error.message);
	})
	.finally(() => {
		setTimeout(() => {
			child.kill();
			if (failures.length > 0) {
				console.error(failures.join("\n"));
				process.exit(1);
			}
			console.log("lsp-harness: all checks passed");
			process.exit(0);
		}, 200).unref();
		child.on("exit", () => {
			if (failures.length > 0) {
				console.error(failures.join("\n"));
				process.exit(1);
			}
			console.log("lsp-harness: all checks passed");
			process.exit(0);
		});
	});
