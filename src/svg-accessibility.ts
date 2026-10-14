/** Root accessibility metadata becomes bounded plain text on the SVG image. */
import { SvgPolicyError } from "./svg-diagnostics.js";

const ATTRIBUTES = new Set(["role", "aria-label", "aria-labelledby", "aria-describedby"]);
export const SVG_ACCESSIBILITY_LIMITS = { references: 16, text: 1024 } as const;

export function createSvgAccessibility(root: Element, validId: RegExp) {
  const metadata = new Map<string, string>();
  const referenceIds = new Map<string, string[]>();
  const plainText = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, SVG_ACCESSIBILITY_LIMITS.text);
  return {
    acceptAttribute(node: Element, attribute: Attr): boolean {
      const name = attribute.name;
      if (!ATTRIBUTES.has(name)) return false;
      if (node !== root || attribute.namespaceURI) throw new SvgPolicyError("unsupported", "SVG accessibility attributes are supported only on the root SVG.");
      const value = attribute.value.trim();
      if (name === "role" && value !== "img") throw new SvgPolicyError("unsupported", "Static SVG previews support only role=img.");
      if (name === "aria-label" && value.length > SVG_ACCESSIBILITY_LIMITS.text) throw new SvgPolicyError("limits", "SVG accessibility labels exceed 1,024 characters.");
      if (name === "aria-labelledby" || name === "aria-describedby") {
        const ids = value.split(/[\t\n\f\r ]+/).filter(Boolean);
        if (ids.length > SVG_ACCESSIBILITY_LIMITS.references) throw new SvgPolicyError("limits", "SVG accessibility metadata exceeds 16 local references.");
        if (ids.some(id => !validId.test(id))) throw new SvgPolicyError("unsupported", "SVG accessibility references must be simple local IDs.");
        referenceIds.set(name, ids);
      }
      metadata.set(name, value);
      // Expose metadata on the HTML image without copying SVG ID references
      // into the Reader DOM. The stored source remains unchanged.
      node.removeAttributeNode(attribute);
      return true;
    },
    finish(ids: ReadonlyMap<string, Element>): { label: string; description: string } {
      const resolve = (name: string) => plainText((referenceIds.get(name) ?? []).map(id => {
        const node = ids.get(id);
        if (!node || !root.contains(node)) throw new SvgPolicyError("unsupported", "SVG accessibility references must point to existing local elements.");
        return node.textContent ?? "";
      }).join(" "));
      const label = resolve("aria-labelledby") || plainText(metadata.get("aria-label") ?? "") ||
        root.querySelector("title")?.textContent?.trim().slice(0, 160) || "SVG diagram";
      const description = resolve("aria-describedby") || plainText(root.querySelector("desc")?.textContent ?? "");
      return { label, description };
    }
  };
}
