export type PreferenceValue = boolean | number | string;

export interface PreferenceStore {
  get?(key: string, defaultValue?: PreferenceValue): unknown;
  set?(key: string, value: PreferenceValue): void;
}

export interface ReaderController {
  start(): void | PromiseLike<void>;
  renderNow(): void;
  stop(): void;
  refresh?(): void;
}

export interface MarkdownRenderer {
  render(source: unknown): string;
}

export interface ReaderRegistry<Reader> {
  register(reader: Reader | null | undefined): PromiseLike<void>;
  unregister(reader: Reader): void;
  shutdown(): void;
  refresh(): void;
}
