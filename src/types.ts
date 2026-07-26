/**
 * Small contracts shared across runtime modules.
 *
 * Zotero-specific host shapes stay in their boundary modules so these contracts
 * remain usable by isolated tests and non-host logic.
 */
export type PreferenceValue = boolean | number | string;

/** Minimal preference storage used by the settings abstraction. */
export interface PreferenceStore {
  get?(key: string, defaultValue?: PreferenceValue): unknown;
  set?(key: string, value: PreferenceValue): void;
}

/** Lifecycle exposed by one controller attached to one Zotero Reader. */
export interface ReaderController {
  start(): void | PromiseLike<void>;
  renderNow(): void;
  stop(): void;
  refresh?(): void;
}

/** Converts annotation source into safe HTML without owning DOM state. */
export interface MarkdownRenderer {
  render(source: unknown): string;
}

/** Owns controller registration and cleanup for a set of host Reader objects. */
export interface ReaderRegistry<Reader> {
  register(reader: Reader | null | undefined): PromiseLike<void>;
  unregister(reader: Reader): void;
  shutdown(): void;
  refresh(): void;
}
