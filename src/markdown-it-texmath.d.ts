/**
 * Minimal local declaration for the untyped markdown-it plugin.
 *
 * Keep this surface narrow; renderer-specific options are defined where used.
 */
declare module "markdown-it-texmath" {
  const markdownItTexmath: (markdown: unknown, options?: unknown) => void;

  export default markdownItTexmath;
}
