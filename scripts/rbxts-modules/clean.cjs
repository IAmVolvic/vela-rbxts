const fs = require("node:fs");
const path = require("node:path");

// The compile-time copies must not survive the build: a consumer whose Rojo
// tree maps this package would otherwise get a second @rbxts/react under it,
// and two React copies mean hooks and context silently stop matching.
fs.rmSync(path.join(process.cwd(), "node_modules", "@rbxts"), {
	recursive: true,
	force: true,
});
