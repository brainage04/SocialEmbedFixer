# SocialEmbedFixer website

The GitHub Pages site for SocialEmbedFixer: a page about the plugin, and the Revenge plugin itself. The site root serves the Revenge build (`manifest.json` and `index.js`) next to the page, so `https://brainage04.github.io/SocialEmbedFixer/` is both the page and the URL to install in Revenge. Revenge fetches `manifest.json` from that URL each time Discord starts and downloads the new `index.js` when the manifest's `hash` changes, so every deploy reaches installed copies on the next start.

The repository root is the plugin; this folder is a separate Astro project built with [AstroShell](https://github.com/brainage04/AstroShell).

## Requirements

- Node.js 24
- npm

## Development

```bash
cd site
npm ci
npm run dev
```

`npm run dev` and `npm run build` first build the plugin in the repository root (`npm run build` there, which runs `npm ci` there first when the root has no `node_modules`). The dev server serves the page at `/` and the current build at `/manifest.json` and `/index.js`, and rebuilds the plugin when files in `revenge/`, `common/` or `scripts/` change.

Locally the install URL on the page is the local server's address. The deployed page shows the GitHub Pages address, because the deploy workflow sets `PUBLIC_SITE_URL` and `PUBLIC_BASE_PATH`. To see the deployed version locally:

```bash
PUBLIC_SITE_URL=https://brainage04.github.io PUBLIC_BASE_PATH=/SocialEmbedFixer npm run build
PUBLIC_BASE_PATH=/SocialEmbedFixer npm run preview
```

and open `http://localhost:4321/SocialEmbedFixer/`.

## Page content

The page text (summary, features, settings, extra sections) is in `src/data/plugin.ts`; the plugin name and description come from `revenge/manifest.json`. Update `src/data/plugin.ts` when the plugin's features or settings change.

## Validation

```bash
npm run check
npm run lint
npm run format:check
npm run build
```

## Deployment

`.github/workflows/deploy.yml` builds this folder and deploys it to GitHub Pages on every push to `main`; `.github/workflows/validate.yml` checks it on pushes and pull requests. Both use AstroShell's reusable workflows with `path: site`. GitHub Pages must be set to deploy from GitHub Actions (repository Settings, Pages, Source).
