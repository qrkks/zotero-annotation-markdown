const DEFAULT_KEY = "extensions.annotationMarkdown.enabled";

export function createSettings({ prefs, key = DEFAULT_KEY } = {}) {
  let memoryValue = true;

  return {
    isEnabled() {
      if (prefs?.get) {
        return Boolean(prefs.get(key, true));
      }

      return memoryValue;
    },

    setEnabled(enabled) {
      const value = Boolean(enabled);

      if (prefs?.set) {
        prefs.set(key, value);
      }

      memoryValue = value;
    }
  };
}

