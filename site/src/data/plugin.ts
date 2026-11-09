/** Page content for this plugin. Keep it in step with the plugin's code in `revenge/`, `vencord/` and `common/`. */
export interface Card {
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
  /** The card grid: a title naming what the cards describe (what it does, how to use it, how it works). */
  cards: { title: string; items: Card[] };
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
  cards: {
    title: 'What it does',
    items: [
      {
        title: 'Converts links you send',
        text: 'X/Twitter post links on `x.com`, `twitter.com` and their `mobile.`/`www.` variants (`/<user>/status/<id>`, including `/photo/` and `/video/` links, and `/i/web/status/<id>`) are rewritten to your chosen X/Twitter service in new messages and edits, just before they are sent, so everyone sees a proper embed. X profile, home and search links stay as they are, because the services make no embed for them. Instagram post, reel and TV links (`/p/`, `/reel/`, `/reels/`, `/tv/`) are rewritten too; `/tv/` links are sent as `/p/`. Instagram profile and `/share/` links stay as they are, because not every offered Instagram service can show them. Only the host of a link changes; the rest stays exactly as you typed it.',
      },
      {
        title: 'Fixes messages already in the chat',
        text: 'Links in messages already in the chat, including other people’s, are shown with your chosen service and with the embed Discord makes for the converted link. This only changes what you see and posts nothing to the chat, but to get the embed your client asks Discord for it, once per converted link. If Discord makes no embed for a converted link, the message is left as it was, and turning the setting off puts the original links and embeds back.',
      },
      {
        title: 'Your choice of embed service',
        text: 'Pick a service per platform, or your own hostname; a value that is not a valid hostname, or is the platform itself, falls back to the default service. Links that already use another known service (for example `vxtwitter.com` or `ddinstagram.com`) can be moved to the service you picked.',
      },
    ],
  },
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
        'Show supported links in messages already in the chat with the selected services, together with the embeds Discord makes for them. Only changes what you see and posts nothing to the chat, but asks Discord for the embed of each converted link.',
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
      description:
        'Used when the X/Twitter service is Custom domain, for example `example.com`. Invalid values fall back to FixupX.',
    },
    {
      name: 'Instagram embed service',
      defaultValue: 'VXInstagram',
      description: 'VXInstagram, OGInstagram, Instagramfix or Custom domain.',
    },
    {
      name: 'Instagram custom hostname',
      defaultValue: 'Empty',
      description: 'Used when the Instagram service is Custom domain. Invalid values fall back to VXInstagram.',
    },
  ],
  sections: [],
};

export const sourceHref = `https://github.com/brainage04/${plugin.repository}`;
