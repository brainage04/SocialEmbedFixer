/** Page content for this plugin. Keep it in step with the plugin's code in `revenge/`, `vencord/` and `common/`. */
export interface Feature {
  title: string;
  /** Plain text; spans in backticks render as code. */
  text: string;
}

export interface Setting {
  name: string;
  defaultValue: string;
  description: string;
}

export interface Section {
  title: string;
  intro?: string;
  items: string[];
}

export interface PluginPage {
  /** GitHub repository name; also the Pages base path (`https://brainage04.github.io/<repository>/`). */
  repository: string;
  summary: string;
  /** The Vencord entry file in the repository root. */
  vencordEntry: 'index.ts' | 'index.tsx';
  /** Folder name under Vencord's `src/userplugins/`, as in DiscordPluginInstaller's catalog. */
  vencordDirectory: string;
  features: Feature[];
  /** The same settings exist on Revenge and Vencord unless `settingsNote` says otherwise. */
  settings: Setting[];
  settingsNote?: string;
  sections: Section[];
}

export const plugin: PluginPage = {
  repository: 'SocialEmbedFixer',
  summary:
    'Rewrites X/Twitter and Instagram links to embed-friendly services such as FixupX and VXInstagram, so Discord shows a proper preview. Links you send are converted before they leave your client, and links in messages already sent are converted on your screen only.',
  vencordEntry: 'index.ts',
  vencordDirectory: 'socialEmbedFixer.vesktop',
  features: [
    {
      title: 'Converts links you send',
      text: 'Links to `x.com`, `twitter.com` and their `mobile.`/`www.` variants are rewritten to your chosen X/Twitter service in new messages and edits, just before they are sent.',
    },
    {
      title: 'Instagram posts and reels',
      text: 'Instagram post, reel and IGTV links (`/p/`, `/reel/`, `/reels/`, `/tv/`) are rewritten; `/tv/` links become `/p/` so every service accepts them. Profiles and `/share/` links are left alone.',
    },
    {
      title: 'Fixes messages already sent',
      text: 'Links in messages already in the chat are converted on your screen only. Nothing is edited or sent, and embeds that are already there stay as they are.',
    },
    {
      title: 'Switches between embed services',
      text: 'Links that already use another known service (for example `vxtwitter.com` or `ddinstagram.com`) can be moved to the service you picked.',
    },
    {
      title: 'Your own service',
      text: 'Pick a custom hostname per platform. A value that is not a valid hostname, or is the platform itself, falls back to the default service.',
    },
    {
      title: 'Keeps old settings',
      text: 'On Vencord, settings saved under the plugin’s earlier name, XEmbedFixer, carry over.',
    },
  ],
  settings: [
    {
      name: 'Convert Messages I Send',
      defaultValue: 'On',
      description: 'Rewrite supported X/Twitter and Instagram links before your messages and edits are sent.',
    },
    {
      name: 'Convert Already Sent Messages',
      defaultValue: 'On',
      description:
        'Convert links in messages already sent, on your screen only. Existing embeds stay unchanged and nothing is sent.',
    },
    {
      name: 'Convert Other Service Domains',
      defaultValue: 'On',
      description: 'Convert links that use another known embed service to the service selected for that platform.',
    },
    {
      name: 'X/Twitter embed service',
      defaultValue: 'FixupX',
      description:
        'FixupX (FxEmbed), FxTwitter (FxEmbed), FixVX (BetterTwitFix), VXTwitter (BetterTwitFix) or Custom domain.',
    },
    {
      name: 'X/Twitter custom hostname',
      defaultValue: 'Empty',
      description: 'Hostname used when the X/Twitter service is Custom domain, for example `example.com`.',
    },
    {
      name: 'Instagram embed service',
      defaultValue: 'VXInstagram',
      description: 'VXInstagram, OGInstagram, Instagramfix or Custom domain.',
    },
    {
      name: 'Instagram custom hostname',
      defaultValue: 'Empty',
      description: 'Hostname used when the Instagram service is Custom domain.',
    },
  ],
  sections: [],
};

export const sourceHref = `https://github.com/brainage04/${plugin.repository}`;
