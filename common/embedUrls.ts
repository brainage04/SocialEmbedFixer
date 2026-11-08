/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type Platform = "x" | "instagram";

export interface EmbedService {
    label: string;
    value: string;
}

interface PlatformDefinition {
    label: string;
    /** Services offered in settings; the first one is the default. */
    services: readonly EmbedService[];
    /** The platform's own hosts, whose links are always converted. */
    sourceHosts: readonly string[];
    /** Other embed-fixing services, converted only when that setting is on. */
    serviceHosts: readonly string[];
    /** Only links to these paths are converted; profile and other pages are left alone. */
    convertiblePath: RegExp;
    /** Rewrites a convertible path to the form every offered service accepts. */
    canonicalPath?(pathname: string): string;
}

export const PLATFORMS: Record<Platform, PlatformDefinition> = {
    x: {
        label: "X/Twitter",
        services: [
            { label: "FixupX (FxEmbed)", value: "fixupx.com" },
            { label: "FxTwitter (FxEmbed)", value: "fxtwitter.com" },
            { label: "FixVX (BetterTwitFix)", value: "fixvx.com" },
            { label: "VXTwitter (BetterTwitFix)", value: "vxtwitter.com" }
        ],
        sourceHosts: ["x.com", "twitter.com", "mobile.x.com", "mobile.twitter.com"],
        serviceHosts: [
            "fixupx.com", "fxtwitter.com", "fixvx.com", "vxtwitter.com", "twittpr.com", "xfixup.com"
        ],
        convertiblePath: /^\//
    },
    instagram: {
        label: "Instagram",
        services: [
            { label: "VXInstagram", value: "vxinstagram.com" },
            { label: "OGInstagram", value: "oginstagram.com" },
            { label: "Instagramfix", value: "instagramfix.com" }
        ],
        sourceHosts: ["instagram.com", "m.instagram.com"],
        serviceHosts: [
            "vxinstagram.com", "oginstagram.com", "instagramfix.com", "zzinstagram.com", "kkinstagram.com",
            "hhinstagram.com", "eeinstagram.com", "uuinstagram.com", "toinstagram.com", "ddinstagram.com",
            "fxstagram.com", "instagramez.com"
        ],
        // VXInstagram 404s on profile pages, and VXInstagram and OGInstagram 404 on /share/ links,
        // which carry a redirect token instead of a post ID, so both stay on instagram.com.
        convertiblePath: /^\/(?!share\/)(?:[\w.]+\/)?(?:p|reels?|tv)\/[\w-]+/,
        // OGInstagram 404s on /tv/; the same ID works as /p/ on every offered service.
        canonicalPath: pathname => pathname.replace(/^(\/(?:[\w.]+\/)?)tv\//, "$1p/")
    }
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as Platform[];
export const CUSTOM_DOMAIN_VALUE = "custom";

export type EmbedDomains = Record<Platform, string>;

export function defaultEmbedDomain(platform: Platform): string {
    return PLATFORMS[platform].services[0].value;
}

interface HostMatch {
    platform: Platform;
    isSource: boolean;
}

function withWww(hosts: readonly string[]) {
    return hosts.flatMap(host => host.startsWith("www.") ? [host] : [host, `www.${host}`]);
}

const HOSTS = new Map<string, HostMatch>();
for (const platform of PLATFORM_IDS) {
    for (const host of withWww(PLATFORMS[platform].serviceHosts)) HOSTS.set(host, { platform, isSource: false });
    for (const host of withWww(PLATFORMS[platform].sourceHosts)) HOSTS.set(host, { platform, isSource: true });
}

const URL_PATTERN = /https?:\/\/[^\s<>{}]+/gi;
const TRAILING_PUNCTUATION = /[),.!?;:'"\]}]+$/;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export interface LinkConversion {
    from: string;
    to: string;
}

export interface ConvertedText {
    content: string;
    conversions: LinkConversion[];
}

/** A bare hostname for a custom service, or null when it is invalid or is the platform's own site. */
export function normalizeEmbedDomain(platform: Platform, value: string | undefined): string | null {
    if (!value) return null;

    const candidate = value.trim().toLowerCase();
    if (!candidate) return null;

    try {
        const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.port) return null;
        if (!DOMAIN_PATTERN.test(parsed.hostname)) return null;
        const match = HOSTS.get(parsed.hostname);
        if (match?.isSource && match.platform === platform) return null;
        return parsed.hostname;
    } catch {
        return null;
    }
}

export function resolveEmbedDomain(platform: Platform, selected: string | undefined, custom: string | undefined): string {
    const domain = selected === CUSTOM_DOMAIN_VALUE ? custom : selected;
    return normalizeEmbedDomain(platform, domain) ?? defaultEmbedDomain(platform);
}

export function convertUrls(
    content: string,
    domains: EmbedDomains,
    convertOtherServiceDomains = false
): ConvertedText {
    const conversions: LinkConversion[] = [];

    const converted = content.replace(URL_PATTERN, rawMatch => {
        const trailing = rawMatch.match(TRAILING_PUNCTUATION)?.[0] ?? "";
        const source = trailing ? rawMatch.slice(0, -trailing.length) : rawMatch;

        try {
            const url = new URL(source);
            const match = HOSTS.get(url.hostname.toLowerCase());
            if (!match || (!match.isSource && !convertOtherServiceDomains)) return rawMatch;
            const platform = PLATFORMS[match.platform];
            if (!platform.convertiblePath.test(url.pathname)) return rawMatch;

            const domain = normalizeEmbedDomain(match.platform, domains[match.platform])
                ?? defaultEmbedDomain(match.platform);
            if (url.hostname.toLowerCase() === domain) return rawMatch;

            url.hostname = domain;
            if (platform.canonicalPath) url.pathname = platform.canonicalPath(url.pathname);
            const replacement = url.toString();
            conversions.push({ from: source, to: replacement });
            return replacement + trailing;
        } catch {
            return rawMatch;
        }
    });

    return { content: converted, conversions };
}

function linkIdentity(value: string) {
    try {
        const url = new URL(value);
        const match = HOSTS.get(url.hostname.toLowerCase());
        if (!match) return null;
        const { canonicalPath } = PLATFORMS[match.platform];
        const path = (canonicalPath ? canonicalPath(url.pathname) : url.pathname).replace(/\/+$/, "").toLowerCase();
        return `${match.platform}:${path}`;
    } catch {
        return null;
    }
}

/**
 * Whether two links point at the same post on hosts of the same platform, such as an embed
 * made for https://fixvx.com/a/status/1 (whose URL is https://vxtwitter.com/a/status/1) and that link.
 */
export function isSameLink(a: string, b: string): boolean {
    const identity = linkIdentity(a);
    return identity !== null && identity === linkIdentity(b);
}
