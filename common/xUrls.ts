/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const EMBED_DOMAINS = [
    { label: "FixupX (FxEmbed)", value: "fixupx.com" },
    { label: "FxTwitter (FxEmbed)", value: "fxtwitter.com" },
    { label: "FixVX (BetterTwitFix)", value: "fixvx.com" },
    { label: "VXTwitter (BetterTwitFix)", value: "vxtwitter.com" }
] as const;

export const DEFAULT_EMBED_DOMAIN = EMBED_DOMAINS[0].value;
export const CUSTOM_DOMAIN_VALUE = "custom";

const X_HOSTS: Record<string, true> = {
    "x.com": true,
    "www.x.com": true,
    "mobile.x.com": true,
    "twitter.com": true,
    "www.twitter.com": true,
    "mobile.twitter.com": true
};
const EMBED_SERVICE_HOSTS: Record<string, true> = {
    "fixupx.com": true,
    "www.fixupx.com": true,
    "fxtwitter.com": true,
    "www.fxtwitter.com": true,
    "fixvx.com": true,
    "www.fixvx.com": true,
    "vxtwitter.com": true,
    "www.vxtwitter.com": true
};

const SOURCE_URL = /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fixupx\.com|fxtwitter\.com|fixvx\.com|vxtwitter\.com)\/[^\s<>{}]*/gi;
const TRAILING_PUNCTUATION = /[),.!?;:'"\]}]+$/;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export interface ConvertedText {
    content: string;
    convertedUrls: string[];
}

export function normalizeEmbedDomain(value: string | undefined): string | null {
    if (!value) return null;

    const candidate = value.trim().toLowerCase();
    if (!candidate) return null;

    try {
        const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.port) return null;
        if (!DOMAIN_PATTERN.test(parsed.hostname)) return null;
        if (X_HOSTS[parsed.hostname]) return null;
        return parsed.hostname;
    } catch {
        return null;
    }
}

export function resolveEmbedDomain(selected: string | undefined, custom: string | undefined): string {
    if (selected === CUSTOM_DOMAIN_VALUE)
        return normalizeEmbedDomain(custom) ?? DEFAULT_EMBED_DOMAIN;

    return normalizeEmbedDomain(selected) ?? DEFAULT_EMBED_DOMAIN;
}

export function convertXUrls(
    content: string,
    domain: string,
    convertOtherServiceDomains = false
): ConvertedText {
    const normalizedDomain = normalizeEmbedDomain(domain) ?? DEFAULT_EMBED_DOMAIN;
    const convertedUrls: string[] = [];

    const converted = content.replace(SOURCE_URL, rawMatch => {
        const trailing = rawMatch.match(TRAILING_PUNCTUATION)?.[0] ?? "";
        const source = trailing ? rawMatch.slice(0, -trailing.length) : rawMatch;

        try {
            const url = new URL(source);
            const sourceHostname = url.hostname.toLowerCase();
            const isXUrl = Boolean(X_HOSTS[sourceHostname]);
            const isOtherServiceUrl = Boolean(EMBED_SERVICE_HOSTS[sourceHostname]);
            if (!isXUrl && (!convertOtherServiceDomains || !isOtherServiceUrl))
                return rawMatch;
            if (sourceHostname === normalizedDomain) return rawMatch;

            url.hostname = normalizedDomain;
            const replacement = url.toString();
            convertedUrls.push(replacement);
            return replacement + trailing;
        } catch {
            return rawMatch;
        }
    });

    return { content: converted, convertedUrls };
}

export function uniqueConvertedUrls(
    content: string,
    domain: string,
    convertOtherServiceDomains = false
): string[] {
    return [...new Set(convertXUrls(content, domain, convertOtherServiceDomains).convertedUrls)];
}
