export const ENABLED_PREF_KEY = "extensions.annotationMarkdown.enabled";
export const FONT_SCALE_PERCENT_PREF_KEY = "extensions.annotationMarkdown.fontScalePercent";
export const PASTE_AS_PLAIN_TEXT_PREF_KEY = "extensions.annotationMarkdown.pasteAsPlainText";
export const MATH_ENABLED_PREF_KEY = "extensions.annotationMarkdown.mathEnabled";
export const PERFORMANCE_DIAGNOSTICS_PREF_KEY = "extensions.annotationMarkdown.performanceDiagnostics";
export const LIGHTWEIGHT_MODE_PREF_KEY = "extensions.annotationMarkdown.lightweightMode";
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
  lightweightModeKey = LIGHTWEIGHT_MODE_PREF_KEY
} = {}) {
  let memoryEnabled = true;
  let memoryFontScale = DEFAULT_FONT_SCALE;
  let memoryPlainTextPaste = true;
  let memoryMathEnabled = true;
  let memoryPerformanceDiagnostics = false;
  let memoryLightweightMode = false;

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
    }
  };
}

function normalizeFontScalePercent(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return DEFAULT_FONT_SCALE;
  }

  return normalizeFontScale(number / 100);
}

function normalizeFontScale(value) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_FONT_SCALE;
  }

  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, number));
}
