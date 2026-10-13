/** Typed outcomes from the static SVG boundary, separate from generated HTML. */
export type SvgFailureKind = "structure" | "unsupported" | "security" | "limits" | "unavailable";
export interface SvgOmissionDiagnostic {
  code: "ignored-display-hint";
  kind: "compatibility";
  property: string;
  location: "attribute" | "stylesheet";
  count: number;
}
export interface SvgFailureDiagnostic {
  code: "svg-rejected";
  kind: SvgFailureKind;
  message: string;
}
export type SvgDiagnostic = SvgOmissionDiagnostic | SvgFailureDiagnostic;
export interface SvgRenderResult {
  status: "complete" | "degraded" | "fallback";
  html: string;
  originalSource: string;
  omittedCount: number;
  diagnostics: SvgDiagnostic[];
  reason: string | null;
}
export class SvgPolicyError extends Error {
  constructor(readonly kind: SvgFailureKind, message: string) { super(message); }
}

const DISPLAY_HINTS = new Set(["text-rendering", "shape-rendering", "cursor"]);
const KEYWORD = /^[A-Za-z][A-Za-z-]{0,63}$/;
const MAX_ISSUES = 8;

export function createSvgDiagnostics(allowDegradation: boolean) {
  const diagnostics: SvgOmissionDiagnostic[] = [];
  let omittedCount = 0;
  return {
    get diagnostics() { return diagnostics; },
    get omittedCount() { return omittedCount; },
    omitDisplayHint(property: string, value: string, location: SvgOmissionDiagnostic["location"]): boolean {
      if (!allowDegradation || !DISPLAY_HINTS.has(property)) return false;
      // Only an inert identifier can be omitted. Functions, URLs, escapes,
      // priorities and arbitrary unknown properties never qualify.
      if (!KEYWORD.test(value)) throw new SvgPolicyError("unsupported", "Only keyword SVG display hints may be omitted.");
      omittedCount++;
      const existing = diagnostics.find(issue => issue.property === property && issue.location === location);
      if (existing) existing.count++;
      else if (diagnostics.length < MAX_ISSUES) diagnostics.push({code:"ignored-display-hint",kind:"compatibility",property,location,count:1});
      return true;
    },
    warningText(): string {
      const properties = [...new Set(diagnostics.map(issue => issue.property))].join(", ");
      return `Compatibility preview: ${omittedCount} display hint${omittedCount === 1 ? " was" : "s were"} not applied (${properties}). Appearance may differ.`;
    }
  };
}
export type SvgDiagnostics = ReturnType<typeof createSvgDiagnostics>;
