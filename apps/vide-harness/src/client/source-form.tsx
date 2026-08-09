import Vide from "@rbxts/vide";

// Never mounted. This is the *input* form a Vide project writes, kept here so
// the type seam in vela-env.d.ts is checked against real usage: `className` has
// to reach intrinsics, components, and the derivable form a Vide source needs.
export function StaticForm() {
	return <frame className="bg-slate-800 rounded-lg p-4 size-full" />;
}

export function DerivableForm() {
	const active = Vide.source(false);

	return <frame className={() => (active() ? "bg-red-500" : "bg-blue-500")} />;
}

function Card(props: { className?: string; children?: Vide.Node }) {
	return <frame className={props.className}>{props.children}</frame>;
}

export function ComponentForm() {
	return <Card className="bg-slate-800">{undefined}</Card>;
}
