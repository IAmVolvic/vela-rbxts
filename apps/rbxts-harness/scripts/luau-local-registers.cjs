// Luau caps a function at 200 live local registers. roblox-ts emits one tab per
// block level, so indentation is enough to tell which locals are still live: a
// block's locals are freed at its `end`, and a nested function starts its own
// register file.
function localsDeclared(line) {
	const match = line.match(
		/^\t*local (function\s+[A-Za-z0-9_]+|[^=]+?)\s*(?:=|$)/,
	);
	if (!match) return 0;
	if (match[1].startsWith("function")) return 1;
	return match[1].split(",").filter((name) => name.trim()).length;
}

function functionName(line, index) {
	const named =
		line.match(/local function ([A-Za-z0-9_]+)/) ??
		line.match(/^\t*function ([A-Za-z0-9_.:]+)/) ??
		line.match(/local ([A-Za-z0-9_]+) = function/);
	return named ? named[1] : `anonymous@${index + 1}`;
}

/// The busiest register file in the module, as `{ name, line, registers }`.
function peakLocalRegisters(luau) {
	const lines = luau.split("\n");
	const indents = lines.map((line) =>
		line.trim() ? line.match(/^\t*/)[0].length : undefined,
	);
	const frames = [
		{
			indent: 0,
			isFunction: true,
			locals: 0,
			name: "<module>",
			line: 1,
			peak: 0,
		},
	];
	let worst = { name: "<module>", line: 1, registers: 0 };

	const record = () => {
		let start = frames.length - 1;
		while (start > 0 && !frames[start].isFunction) start--;
		const live = frames
			.slice(start)
			.reduce((total, frame) => total + frame.locals, 0);
		if (live > frames[start].peak) frames[start].peak = live;
		if (live > worst.registers) {
			worst = {
				name: frames[start].name,
				line: frames[start].line,
				registers: live,
			};
		}
	};

	for (let index = 0; index < lines.length; index++) {
		const indent = indents[index];
		if (indent === undefined) continue;

		while (frames.length > 1 && frames[frames.length - 1].indent > indent)
			frames.pop();

		const declared = localsDeclared(lines[index]);
		if (declared > 0) {
			frames[frames.length - 1].locals += declared;
			record();
		}

		let next = index + 1;
		while (next < lines.length && indents[next] === undefined) next++;
		if (next < lines.length && indents[next] > indent) {
			const isFunction = /\bfunction\b/.test(lines[index]);
			frames.push({
				indent: indents[next],
				isFunction,
				locals: 0,
				name: isFunction
					? functionName(lines[index], index)
					: frames[frames.length - 1].name,
				line: index + 1,
				peak: 0,
			});
		}
	}

	return worst;
}

module.exports = { peakLocalRegisters };
