# Promotional website

The English-first, bilingual landing page is published at <https://qrkks.github.io/zotero-annotation-markdown/>. It introduces the plugin and links to GitHub Releases and the existing user guide. Detailed instructions stay in `docs/`.

From the repository root, using Node.js 24 and the pnpm version in the root `package.json`:

```powershell
pnpm install --frozen-lockfile
pnpm run site:install
pnpm run site:dev
```

The dev URL is <http://127.0.0.1:5173/zotero-annotation-markdown/>. To inspect the deployable build:

```powershell
pnpm run site:build
pnpm run site:preview
```

Open <http://127.0.0.1:4173/zotero-annotation-markdown/>. Check all four examples, copying source, enlarged SVG and Mermaid previews, English/Chinese navigation, tab arrow keys, Escape in the dialog, mobile widths, and reduced motion. Math must show a square root, fraction, and summation without red error text. Check the console and failed network requests.

The site has its own lockfile; `site:install` explicitly uses pnpm's `--ignore-workspace` flag so a clean installation uses the site package rather than returning to the parent workspace. This preserves the plugin dependency graph. Vite builds the page and Motion interactions. A Vite plugin bundles the actual annotation renderer with the same esbuild target used by the add-on, emits a separate hashed JS asset, and includes upstream notices. This avoids a Rolldown optimization that corrupts the surrogate ranges in KaTeX's lexer. Restart the dev server after changing the shared renderer. SVG and Mermaid source examples are imported from `docs/examples/`. The SVG illustration remains an isolated image, as in Zotero. The website's dialog is a simple enlarged preview; the plugin provides its own zoom/pan viewer.

English is served at the project root and Chinese at `zh-CN/`. Both are complete static HTML pages, generated from the same template and `src/content.js`, with a crawlable language link. The URL determines the language so direct links remain consistent. Existing `?lang=zh-CN` and `?lang=en` links move to the corresponding static URL, preserving other query parameters and the fragment. Animations are brief, user-triggered after the initial reveal, and respect `prefers-reduced-motion`.

The page also has a staggered headline reveal and marker stroke, a compact glass header on scroll, feature hover treatments, button feedback, and a closing-section reveal. Moving the mouse into the headline replays the marker stroke once; leaving it lets the stroke finish. The header keeps its original layout space while its inner bar contracts, so content does not jump. Section reveals run once; hover movement is limited to fine pointers. With reduced motion enabled, text and rules remain visible, decorative movement is disabled, and the compact header changes immediately. Check both languages at narrow phone widths and verify that the sticky header leaves dialogs, keyboard focus, and fragment links usable.

## Search and link previews

The build emits localized titles/descriptions, self-referencing canonicals, reciprocal `hreflang` links, Open Graph and Twitter cards, factual SoftwareApplication data, and a two-page `sitemap.xml`. The build check verifies the generated HTML without executing JavaScript, local asset paths under the GitHub Pages prefix, and the social image. It runs as part of `site:build` and the Website workflow.

The shared 1200×630 image is `public/social-preview.png`. Its editable HTML/CSS source is `artwork/social-preview.html`; it is artwork rather than a public landing page. To regenerate it, serve `site/` with a local static server, open `/artwork/social-preview.html` at a 1200×630 viewport, wait for the local fonts, capture a PNG, and replace the public image. The template uses the existing icon and locally installed fonts.

For Search Console, use the URL-prefix property `https://qrkks.github.io/zotero-annotation-markdown/` and submit `https://qrkks.github.io/zotero-annotation-markdown/sitemap.xml`. If HTML-tag verification is required, put the exact Google-issued verification meta tag in the template's `<head>`; the build preserves it on both language pages. Keep the verification tag while the property remains in use. Search Console ownership and sitemap submission are account-side steps, separate from publishing this site.

This project lives below the host root. A `robots.txt` inside the project directory would not control crawling; only `https://qrkks.github.io/robots.txt` can do that. This build does not publish an ineffective project-level robots file or change other Pages projects. The HTML contains no `noindex` directive.

## Deployment and rollback

`.github/workflows/pages.yml` validates pull requests and publishes `site/dist/` on relevant pushes to `main`. The repository's Pages source must be **GitHub Actions** (`build_type: workflow`). Only the deploy job has Pages write and OIDC permissions. No API keys or third-party hosting account are needed.

To roll back a website change, revert its commit on `main` and push the revert; the same workflow republishes the restored site. For a transient deployment failure, rerun the failed Website workflow. Deploying the website does not create a plugin tag or Release.
