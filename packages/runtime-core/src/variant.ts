import type {
	RuntimeCondition,
	RuntimeEnvironment,
	VariantEventBinding,
	VelaRuntimeTag,
} from "./types";

export namespace __VelaVariant {
	export function matchesVariant(
		prefix: string,
		environment: RuntimeEnvironment,
	): boolean {
		switch (prefix) {
			case "sm":
				return environment.width >= 640;
			case "md":
				return environment.width >= 768;
			case "lg":
				return environment.width >= 1024;
			case "portrait":
				return environment.orientation === "portrait";
			case "landscape":
				return environment.orientation === "landscape";
			case "touch":
				return environment.input === "touch";
			case "mouse":
				return environment.input === "mouse";
			case "gamepad":
				return environment.input === "gamepad";
			case "dark":
				return environment.colorScheme === "dark";
			case "hover":
				return environment.hovered;
			case "active":
				return environment.pressed;
			case "focus":
				return environment.focused;
			default:
				return false;
		}
	}

	export function conditionUsesState(
		condition: RuntimeCondition,
		kind: "hover" | "active" | "focus",
	): boolean {
		if (condition.kind === kind) {
			return true;
		}
		if (condition.kind === "all") {
			return condition.conditions.some((entry) =>
				conditionUsesState(entry, kind),
			);
		}
		return false;
	}

	/// Wraps one Event entry, keeping whatever handler the consumer declared and
	/// whatever an earlier tracker already composed onto it.
	export function composeEvent(
		hostProps: Record<string, unknown>,
		name: string,
		handler: (...args: unknown[]) => void,
	) {
		const existing = hostProps.Event;
		const events: Record<string, unknown> = {};
		if (typeIs(existing, "table")) {
			for (const [key, value] of pairs(existing as Record<string, unknown>)) {
				events[key as string] = value;
			}
		}

		const previous = events[name];
		events[name] = (...args: unknown[]) => {
			handler(...args);
			if (typeIs(previous, "function")) {
				(previous as (...args: unknown[]) => void)(...args);
			}
		};

		hostProps.Event = events;
	}

	/// Attaches MouseEnter/MouseLeave to drive the hover state.
	/// What a variant needs connected, named rather than attached: `Event` is
	/// how @rbxts/react spells a handler, and Vide writes one under the property
	/// name itself. Each host runtime composes these its own way.
	export function hoverTracking(
		setHovered: (hovered: boolean) => void,
	): VariantEventBinding[] {
		return [
			{ name: "MouseEnter", handler: () => setHovered(true) },
			{ name: "MouseLeave", handler: () => setHovered(false) },
		];
	}

	/// The input object arrives first here, because a binding is connected to
	/// the signal itself. @rbxts/react prepends the instance to every handler's
	/// arguments, which is why the attach form below reads one place further in.
	export function activeTracking(
		setPressed: (pressed: boolean) => void,
	): VariantEventBinding[] {
		return [
			{
				name: "InputBegan",
				handler: (...args: unknown[]) => {
					if (isPressInput(args[0])) {
						setPressed(true);
					}
				},
			},
			{
				name: "InputEnded",
				handler: (...args: unknown[]) => {
					if (isPressInput(args[0])) {
						setPressed(false);
					}
				},
			},
			{ name: "MouseLeave", handler: () => setPressed(false) },
		];
	}

	export function focusTracking(
		tag: VelaRuntimeTag,
		setFocused: (focused: boolean) => void,
	): VariantEventBinding[] {
		const gained = tag === "textbox" ? "Focused" : "SelectionGained";
		const lost = tag === "textbox" ? "FocusLost" : "SelectionLost";

		return [
			{ name: gained, handler: () => setFocused(true) },
			{ name: lost, handler: () => setFocused(false) },
		];
	}

	export function attachHoverTracking(
		hostProps: Record<string, unknown>,
		setHovered: (hovered: boolean) => void,
	) {
		composeEvent(hostProps, "MouseEnter", () => setHovered(true));
		composeEvent(hostProps, "MouseLeave", () => setHovered(false));
	}

	/// Drives the pressed state from mouse and touch input. A release that lands
	/// outside the element never reaches its `InputEnded`, so leaving the element
	/// clears the state too.
	export function attachActiveTracking(
		hostProps: Record<string, unknown>,
		setPressed: (pressed: boolean) => void,
	) {
		composeEvent(hostProps, "InputBegan", (...args: unknown[]) => {
			if (isPressInput(args[1])) {
				setPressed(true);
			}
		});
		composeEvent(hostProps, "InputEnded", (...args: unknown[]) => {
			if (isPressInput(args[1])) {
				setPressed(false);
			}
		});
		composeEvent(hostProps, "MouseLeave", () => setPressed(false));
	}

	export function isPressInput(input: unknown): boolean {
		if (!typeIs(input, "Instance") || !input.IsA("InputObject")) {
			return false;
		}

		return (
			input.UserInputType === Enum.UserInputType.MouseButton1 ||
			input.UserInputType === Enum.UserInputType.Touch
		);
	}

	/// Text boxes carry their own keyboard focus events; every other element reads
	/// focus as the selection a gamepad or `GuiService` moved onto it.
	export function attachFocusTracking(
		hostProps: Record<string, unknown>,
		tag: VelaRuntimeTag,
		setFocused: (focused: boolean) => void,
	) {
		let gained = "SelectionGained";
		let lost = "SelectionLost";
		if (tag === "textbox") {
			gained = "Focused";
			lost = "FocusLost";
		}

		composeEvent(hostProps, gained, () => setFocused(true));
		composeEvent(hostProps, lost, () => setFocused(false));
	}

	export function matchesRuntimeCondition(
		condition: RuntimeCondition,
		environment: RuntimeEnvironment,
	): boolean {
		switch (condition.kind) {
			case "all":
				return condition.conditions.every((entry) =>
					matchesRuntimeCondition(entry, environment),
				);
			case "width":
				return (
					environment.width >= condition.minWidth &&
					(condition.maxWidth === undefined ||
						environment.width <= condition.maxWidth)
				);
			case "orientation":
				return environment.orientation === condition.value;
			case "input":
				return environment.input === condition.value;
			case "color-scheme":
				return environment.colorScheme === condition.value;
			case "hover":
				return environment.hovered;
			case "active":
				return environment.pressed;
			case "focus":
				return environment.focused;
			case "test":
				return (
					(environment.tests?.[condition.index] ?? false) === condition.expected
				);
			default:
				return false;
		}
	}
}
