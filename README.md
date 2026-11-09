# SocialEmbedFixer

A Discord plugin for Revenge (Android) and Vencord (Vesktop) that rewrites X/Twitter and Instagram post links to embed-friendly services such as FixupX and VXInstagram, so Discord shows a proper preview.

- Links you send are converted just before your message or edit is sent. Only the host changes; the rest of the link stays as you typed it.
- Links in messages already in the chat are shown converted, with the embed Discord makes for the converted link. This changes only what you see and posts nothing to the chat, but your client asks Discord for each converted link's embed.
- X profile, home and search links and Instagram profile and `/share/` links are left alone, because the services make no embed for them.

Page with the full description, settings and install steps: <https://brainage04.github.io/SocialEmbedFixer/>

## Install

- **Revenge:** in Discord, open Settings, go to Revenge's **Plugins** page, tap **+** and paste `https://brainage04.github.io/SocialEmbedFixer/`. Revenge checks that URL for a new version every time Discord starts.
- **Vesktop (Vencord):** use [DiscordPluginInstaller](https://github.com/brainage04/DiscordPluginInstaller):

  ```bash
  git clone https://github.com/brainage04/DiscordPluginInstaller.git
  cd DiscordPluginInstaller
  node src/cli.mjs vencord install --plugins SocialEmbedFixer --enable --restart
  ```

  Or copy `index.ts`, `common/` and `vencord/` into Vencord's `src/userplugins/socialEmbedFixer.vesktop/` and build Vencord yourself; the page has the steps.

## Build and test

```bash
npm ci
npm test        # tests for the shared code in common/
npm run build   # Revenge build: dist/manifest.json and dist/index.js
```

`common/` holds the code both clients share, `revenge/` the Revenge plugin and its manifest, and `index.ts` with `vencord/` the Vencord userplugin. `site/` is the GitHub Pages site, which also serves the Revenge build; see [site/README.md](site/README.md).

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
