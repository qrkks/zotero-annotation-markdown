import type { PreferenceStore } from "./types.js";

export const ENABLED_PREF_KEY = "extensions.annotationMarkdown.enabled";
export const FONT_SCALE_PERCENT_PREF_KEY = "extensions.annotationMarkdown.fontScalePercent";
export const PASTE_AS_PLAIN_TEXT_PREF_KEY = "extensions.annotationMarkdown.pasteAsPlainText";
export const MATH_ENABLED_PREF_KEY = "extensions.annotationMarkdown.mathEnabled";
export const PERFORMANCE_DIAGNOSTICS_PREF_KEY = "extensions.annotationMarkdown.performanceDiagnostics";
export const LIGHTWEIGHT_MODE_PREF_KEY = "extensions.annotationMarkdown.lightweightMode";
export const RENDER_STRATEGY_PREF_KEY = "extensions.annotationMarkdown.renderStrategy";
export const RENDER_STRATEGIES = ["auto", "eager", "lazy"] as const;
export type RenderStrategy = (typeof RENDER_STRATEGIES)[number];

export interface Settings {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  getFontScale(): number;
  setFontScale(fontScale: number): void;
  isPlainTextPasteEnabled(): boolean;
  setPlainTextPasteEnabled(enabled: boolean): void;
  isMathEnabled(): boolean;
  setMathEnabled(enabled: boolean): void;
  isPerformanceDiagnosticsEnabled(): boolean;
  setPerformanceDiagnosticsEnabled(enabled: boolean): void;
  isLightweightModeEnabled(): boolean;
  setLightweightModeEnabled(enabled: boolean): void;
  getRenderStrategy(): RenderStrategy;
  setRenderStrategy(strategy: RenderStrategy): void;
}

interface CreateSettingsOptions {
  prefs?: PreferenceStore;
  key?: string;
  fontScalePercentKey?: string;
  pasteAsPlainTextKey?: string;
  mathEnabledKey?: string;
  performanceDiagnosticsKey?: string;
  lightweightModeKey?: string;
  renderStrategyKey?: string;
}

const DEFAULT_FONT_SCALE = 1;
const DEFAULT_FONT_SCALE_PERCENT = 100;
const MIN_FONT_SCALE = 0.8;
const MAX_FONT_SCALE = 1.5;

export function createSettings({
  prefs,
  key = ENABLED_PREF_KEY,
  fontScalePercentKey = FONT_SCALE_PERCENT_PREF_KEY,
  pasteAsPlainTextKey = PASTE_AS_PLAIN_TEXT_PREF_KEY,
  mathEnabledKey = MATH_ENABLED_PREF_KEY,
  performanceDiagnosticsKey = PERFORMANCE_DIAGNOSTICS_PREF_KEY,
  lightweightModeKey = LIGHTWEIGHT_MODE_PREF_KEY,
  renderStrategyKey = RENDER_STRATEGY_PREF_KEY
}: CreateSettingsOptions = {}): Settings {
  let memoryEnabled = true;
  let memoryFontScale = DEFAULT_FONT_SCALE;
  let memoryPlainTextPaste = true;
  let memoryMathEnabled = true;
  let memoryPerformanceDiagnostics = false;
  let memoryLightweightMode = false;
  let memoryRenderStrategy: RenderStrategy = "auto";

  return {
    isEnabled() {
      if (prefs?.get) {
        return Boolean(prefs.get(key, true));
      }

      return memoryEnabled;
    },

    setEnabled(enabled) {
      const value = Boolean(enabled);

      if (prefs?.set) {
        prefs.set(key, value);
      }

      memoryEnabled = value;
    },

    getFontScale() {
      if (prefs?.get) {
        return normalizeFontScalePercent(prefs.get(fontScalePercentKey, DEFAULT_FONT_SCALE_PERCENT));
      }

      return memoryFontScale;
    },

    setFontScale(fontScale) {
      const value = normalizeFontScale(fontScale);

      if (prefs?.set) {
        prefs.set(fontScalePercentKey, Math.round(value * 100));
      }

      memoryFontScale = value;
    },

    isPlainTextPasteEnabled() {
      if (prefs?.get) {
        return Boolean(prefs.get(pasteAsPlainTextKey, true));
      }

      return memoryPlainTextPaste;
    },

    setPlainTextPasteEnabled(enabled) {
      const value = Boolean(enabled);

      if (prefs?.set) {
        prefs.set(pasteAsPlainTextKey, value);
      }

      memoryPlainTextPaste = value;
    },

    isMathEnabled() {
      if (prefs?.get) {
        return Boolean(prefs.get(mathEnabledKey, true));
      }

      return memoryMathEnabled;
    },

    setMathEnabled(enabled) {
      const value = Boolean(enabled);

      if (prefs?.set) {
        prefs.set(mathEnabledKey, value);
      }

      memoryMathEnabled = value;
    },

    isPerformanceDiagnosticsEnabled() {
      if (prefs?.get) {
        return Boolean(prefs.get(performanceDiagnosticsKey, false));
      }

      return memoryPerformanceDiagnostics;
    },

    setPerformanceDiagnosticsEnabled(enabled) {
      const value = Boolean(enabled);

      if (prefs?.set) {
        prefs.set(performanceDiagnosticsKey, value);
      }

      memoryPerformanceDiagnostics = value;
    },

    isLightweightModeEnabled() {
      if (prefs?.get) {
        return Boolean(prefs.get(lightweightModeKey, false));
      }

      return memoryLightweightMode;
    },

    setLightweightModeEnabled(enabled) {
      const value = Boolean(enabled);

      if (prefs?.set) {
        prefs.set(lightweightModeKey, value);
      }

      memoryLightweightMode = value;
    },

    getRenderStrategy() {
      if (prefs?.get) {
        return normalizeRenderStrategy(prefs.get(renderStrategyKey, "auto"));
      }

      return memoryRenderStrategy;
    },

    setRenderStrategy(strategy) {
      const value = normalizeRenderStrategy(strategy);

      if (prefs?.set) {
        prefs.set(renderStrategyKey, value);
      }

      memoryRenderStrategy = value;
    }
  };
}

function normalizeRenderStrategy(value: unknown): RenderStrategy {
  return RENDER_STRATEGIES.includes(value as RenderStrategy) ? (value as RenderStrategy) : "auto";
}

function normalizeFontScalePercent(value: unknown): number {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isFinite(number)) {
    return DEFAULT_FONT_SCALE;
  }

  return normalizeFontScale(number / 100);
}

function normalizeFontScale(value: unknown): number {
  const number = Number.parseFloat(String(value));
  if (!Number.isFinite(number)) {
    return DEFAULT_FONT_SCALE;
  }

  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, number));
}
