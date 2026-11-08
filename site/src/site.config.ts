import type { SiteConfig } from '@brainage04/astro-shell/config';
import manifest from '../../revenge/manifest.json';
import { sourceHref } from './data/plugin';

export const siteConfig = {
  siteName: manifest.name,
  description: manifest.description,
  navItems: [
    { name: manifest.name, href: '/' },
    { name: 'Source', href: sourceHref, external: true },
    { name: 'Main site', href: 'https://brainage04.github.io/', external: true },
  ],
  sourceHref,
  faviconHref: '/pfp.webp',
  faviconType: 'image/webp',
  image: '/pfp.webp',
  themeColor: '#171218',
  ownerHref: 'https://github.com/brainage04',
  ownerName: 'brainage04',
} as const satisfies SiteConfig;
