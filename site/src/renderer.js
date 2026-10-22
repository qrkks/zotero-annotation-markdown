import { createMarkdownRenderer } from '../../src/markdown-renderer.ts';

export const renderer = createMarkdownRenderer({
  windowRef: window,
  isSvgEnabled: () => true,
  isMermaidEnabled: () => true,
});
