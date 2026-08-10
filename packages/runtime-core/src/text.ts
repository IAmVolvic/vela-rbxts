import type { RuntimeResolution, RuntimeTextSpec } from "./types";

export namespace __VelaText {
	export function escapeRichText(value: string): string {
		const [amp] = value.gsub("&", "&amp;");
		const [lt] = amp.gsub("<", "&lt;");
		const [gt] = lt.gsub(">", "&gt;");
		return gt;
	}

	export function capitalizeAsciiWords(value: string): string {
		const [result] = value.gsub("%f[%a]%a", (letter) => letter.upper());
		return result;
	}

	/// Transforms `Text` per the merged compile-time and dynamic config. A
	/// consumer-managed `RichText` prop opts the element out of decorations, which
	/// would otherwise double-escape its markup.
	export function applyTextConfig(
		hostProps: Record<string, unknown>,
		base: RuntimeTextSpec | undefined,
		resolution: RuntimeResolution,
	) {
		const transformValue = resolution.textTransform ?? base?.transform;
		const decorationValue = resolution.textDecoration ?? base?.decoration;
		const transform = transformValue === "none" ? undefined : transformValue;
		const decoration = decorationValue === "none" ? undefined : decorationValue;
		if (transform === undefined && decoration === undefined) {
			return;
		}

		const text = hostProps.Text;
		if (!typeIs(text, "string")) {
			return;
		}

		let result = text;
		if (transform === "upper") {
			result = result.upper();
		} else if (transform === "lower") {
			result = result.lower();
		} else if (transform === "capitalize") {
			result = capitalizeAsciiWords(result);
		}

		if (decoration !== undefined && hostProps.RichText === undefined) {
			hostProps.RichText = true;
			if (decoration === "underline") {
				result = `<u>${escapeRichText(result)}</u>`;
			} else if (decoration === "strike") {
				result = `<s>${escapeRichText(result)}</s>`;
			}
		}

		hostProps.Text = result;
	}

	export function assignForwardedRef(
		ref: unknown,
		value: Instance | undefined,
	) {
		if (typeIs(ref, "function")) {
			(ref as (instance: Instance | undefined) => void)(value);
		} else if (typeIs(ref, "table")) {
			(ref as { current?: Instance }).current = value;
		}
	}
}
