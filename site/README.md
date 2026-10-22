# Promotional website

The English-first, bilingual landing page is published at <https://qrkks.github.io/zotero-annotation-markdown/>. It introduces the plugin and links to GitHub Releases and the existing user guide. Detailed instructions stay in `docs/`.

From the repository root, using Node.js 24 and the pnpm version in the root `package.json`:

```powershell
pnpm install --frozen-lockfile
pnpm --dir site install --frozen-lockfile
pnpm run site:dev
```

The dev URL is <http://127.0.0.1:5173/zotero-annotation-markdown/>. To inspect the deployable build:

```powershell
pnpm run site:build
pnpm run site:preview
```

Open <http://127.0.0.1:4173/zotero-annotation-markdown/>. Check all four examples, enlarged SVG and Mermaid previews, English/Chinese switching and persistence, tab arrow keys, Escape in the dialog, mobile widths, and reduced motion. Math must show a square root, fraction, and summation without red error text. Check the console and failed network requests.

The site has its own lockfile and `.npmrc`; install it separately to preserve the plugin dependency graph. Vite builds the page and Motion interactions. A Vite plugin bundles the actual annotation renderer with the same esbuild target used by the add-on, emits a separate hashed JS asset, and includes upstream notices. This avoids a Rolldown optimization that corrupts the surrogate ranges in KaTeX's lexer. Restart the dev server after changing the shared renderer. SVG and Mermaid source examples are imported from `docs/examples/`. The SVG illustration remains an isolated image, as in Zotero. The website's dialog is a simple enlarged preview; the plugin provides its own zoom/pan viewer.

The language defaults to English and can be switched with the header button. `?lang=zh-CN` opens Chinese directly; the choice is stored locally. Animations are brief, user-triggered after the initial reveal, and respect `prefers-reduced-motion`.

## Deployment and rollback

`.github/workflows/pages.yml` validates pull requests and publishes `site/dist/` on relevant pushes to `main`. The repository's Pages source must be **GitHub Actions** (`build_type: workflow`). Only the deploy job has Pages write and OIDC permissions. No API keys or third-party hosting account are needed.

To roll back a website change, revert its commit on `main` and push the revert; the same workflow republishes the restored site. For a transient deployment failure, rerun the failed Website workflow. Deploying the website does not create a plugin tag or Release.
