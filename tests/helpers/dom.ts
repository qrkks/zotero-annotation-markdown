/** Require fixture values without hiding missing nodes behind type assertions. */
export function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected a fixture value to exist");
  }
  return value;
}

function isElementType<T extends Element>(value: unknown, elementType: new () => T): value is T {
  if (typeof value !== "object" || value === null) return false;
  const owner: unknown = Reflect.get(value, "ownerDocument");
  const view: unknown = typeof owner === "object" && owner !== null ? Reflect.get(owner, "defaultView") : undefined;
  const localType: unknown = typeof view === "object" && view !== null ? Reflect.get(view, elementType.name) : elementType;
  return typeof localType === "function" && value instanceof localType;
}

export function requireElement<T extends Element>(value: unknown, elementType: new () => T): T {
  if (!isElementType(value, elementType)) throw new Error("Unexpected fixture element type");
  return value;
}

/** Preserve supplied edges, including intentionally unusual fixture geometry. */
export function fixtureRect(rect: Partial<DOMRect>): DOMRect {
  const x = rect.x ?? rect.left ?? 0;
  const y = rect.y ?? rect.top ?? 0;
  const width = rect.width ?? ((rect.right ?? x) - x);
  const height = rect.height ?? ((rect.bottom ?? y) - y);
  return {
    x, y, width, height, left: x, top: y, right: x + width, bottom: y + height,
    toJSON() { return { x, y, width, height }; },
    ...rect
  };
}

export function queryElement<T extends Element>(root: ParentNode | null | undefined, selector: string, elementType: new () => T): T;
export function queryElement(root: ParentNode | null | undefined, selector: string): Element;
export function queryElement(root: ParentNode | null | undefined, selector: string, elementType?: new () => Element): Element {
  const element = requireValue(root).querySelector(selector);
  if (!element) throw new Error(`Missing fixture element: ${selector}`);
  if (elementType && !isElementType(element, elementType)) {
    throw new Error(`Unexpected fixture element type: ${selector}`);
  }
  return element;
}
