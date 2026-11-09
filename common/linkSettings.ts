/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    convertUrls,
    CUSTOM_DOMAIN_VALUE,
    type EmbedDomains,
    normalizeEmbedDomain,
    type Platform,
    PLATFORM_IDS,
    resolveEmbedDomain
} from "./embedUrls";

/** The settings both clients store under the same names. */
export interface LinkSettingValues {
    convertAlreadySentMessages: boolean;
    convertOtherServiceDomains: boolean;
    xDomain: string | undefined;
    xCustomDomain: string | undefined;
    instagramDomain: string | undefined;
    instagramCustomDomain: string | undefined;
}

export interface LinkSettings {
    domains: EmbedDomains;
    convertOtherServiceDomains: boolean;
}

export interface DisplayedLinkSettings extends LinkSettings {
    enabled: boolean;
}

const KEYS: Record<Platform, { domain: "xDomain" | "instagramDomain"; custom: "xCustomDomain" | "instagramCustomDomain"; }> = {
    x: { domain: "xDomain", custom: "xCustomDomain" },
    instagram: { domain: "instagramDomain", custom: "instagramCustomDomain" }
};

/** The services links are converted to; a custom domain that does not validate falls back to the default service. */
export function linkSettings(values: LinkSettingValues): LinkSettings {
    const domains = {} as EmbedDomains;
    for (const platform of PLATFORM_IDS) {
        const keys = KEYS[platform];
        domains[platform] = resolveEmbedDomain(platform, values[keys.domain], values[keys.custom]);
    }
    return { domains, convertOtherServiceDomains: values.convertOtherServiceDomains };
}

export function convertLinks(content: string, settings: LinkSettings) {
    return convertUrls(content, settings.domains, settings.convertOtherServiceDomains);
}

/** False while a platform is set to Custom domain and the hostname typed so far is not a valid one. */
function customDomainsValid(values: LinkSettingValues) {
    return PLATFORM_IDS.every(platform => {
        const keys = KEYS[platform];
        return values[keys.domain] !== CUSTOM_DOMAIN_VALUE || normalizeEmbedDomain(platform, values[keys.custom]) !== null;
    });
}

function displayedLinkSettings(values: LinkSettingValues): DisplayedLinkSettings {
    return { ...linkSettings(values), enabled: values.convertAlreadySentMessages };
}

export interface DisplayedSettings {
    current(): DisplayedLinkSettings;
    /** Call on every settings change. */
    changed(): void;
    stop(): void;
}

/**
 * The settings used for links in messages already in the chat. Every change asks Discord for new embeds,
 * so a change is only taken over once the settings have stayed the same for `delayMs`, only when every
 * custom domain is a valid hostname (never while one is half typed), and only when it changes the result.
 */
export function createDisplayedSettings(read: () => LinkSettingValues, apply: () => void, delayMs = 1000): DisplayedSettings {
    let current = displayedLinkSettings(read());
    let currentKey = JSON.stringify(current);
    let timer: ReturnType<typeof setTimeout> | undefined;

    function settle() {
        timer = undefined;
        const values = read();
        if (!customDomainsValid(values)) return;
        const next = displayedLinkSettings(values);
        const key = JSON.stringify(next);
        if (key === currentKey) return;
        current = next;
        currentKey = key;
        apply();
    }

    return {
        current: () => current,
        changed() {
            clearTimeout(timer);
            timer = setTimeout(settle, delayMs);
        },
        stop() {
            clearTimeout(timer);
            timer = undefined;
        }
    };
}
