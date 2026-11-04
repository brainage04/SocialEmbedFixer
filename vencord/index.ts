/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { updateMessage } from "@api/MessageUpdater";
import { definePluginSettings, migratePluginSetting, migratePluginSettings } from "@api/Settings";
import { OptionType, type PluginDef } from "@utils/types";
import { MessageStore, RestAPI, SelectedChannelStore } from "@webpack/common";

import {
    convertUrls,
    CUSTOM_DOMAIN_VALUE,
    type Platform,
    PLATFORMS,
    resolveEmbedDomain
} from "../common/embedUrls";
import { patchMessageRequests } from "../common/messageRequests";

// Must match the literal name in ../index.ts, which Vencord's build requires to be a string literal.
const PLUGIN_NAME = "SocialEmbedFixer";

// Keep the settings of the plugin's earlier, X-only name.
migratePluginSettings(PLUGIN_NAME, "XEmbedFixer");
migratePluginSetting(PLUGIN_NAME, "domain", "xDomain");
migratePluginSetting(PLUGIN_NAME, "customDomain", "xCustomDomain");

function serviceSetting(platform: Platform) {
    const { label, services } = PLATFORMS[platform];
    return {
        type: OptionType.SELECT as const,
        description: `${label} embed service`,
        options: [
            ...services.map((service, index) => ({
                label: service.label,
                value: service.value,
                default: index === 0
            })),
            { label: "Custom domain", value: CUSTOM_DOMAIN_VALUE }
        ],
        onChange: reapplyDisplayedLinks
    };
}

function customDomainSetting(platform: Platform) {
    const { label, services } = PLATFORMS[platform];
    return {
        type: OptionType.STRING as const,
        description: `Custom hostname used when the ${label} embed service is Custom (invalid values fall back to ${services[0].label})`,
        default: "",
        onChange: reapplyDisplayedLinks
    };
}

const settings = definePluginSettings({
    convertMessagesISend: {
        displayName: "Convert Messages I Send",
        type: OptionType.BOOLEAN,
        description: "Rewrite supported X/Twitter and Instagram links before your messages and edits are sent",
        default: true
    },
    convertAlreadySentMessages: {
        displayName: "Convert Already Sent Messages",
        type: OptionType.BOOLEAN,
        description: "Locally convert links in already-sent messages; existing embeds stay unchanged and no message is sent",
        default: true,
        onChange: reapplyDisplayedLinks
    },
    convertOtherServiceDomains: {
        displayName: "Convert Other Service Domains",
        type: OptionType.BOOLEAN,
        description: "Convert links using another known embed service to the service selected for that platform",
        default: true,
        onChange: reapplyDisplayedLinks
    },
    xDomain: serviceSetting("x"),
    xCustomDomain: customDomainSetting("x"),
    instagramDomain: serviceSetting("instagram"),
    instagramCustomDomain: customDomainSetting("instagram")
});


function convertContent(content: string) {
    const { store } = settings;
    return convertUrls(
        content,
        {
            x: resolveEmbedDomain("x", store.xDomain, store.xCustomDomain),
            instagram: resolveEmbedDomain("instagram", store.instagramDomain, store.instagramCustomDomain)
        },
        store.convertOtherServiceDomains
    );
}


const originalMessageContent = new Map<string, { channelId: string; content: string }>();
let refreshScheduled = false;
let running = false;
let unpatchRequests: (() => void) | undefined;

function restoreDisplayedLinks() {
    const originals = [...originalMessageContent.entries()];
    originalMessageContent.clear();
    for (const [messageId, original] of originals)
        updateMessage(original.channelId, messageId, { content: original.content });
}

function refreshDisplayedLinks() {
    refreshScheduled = false;
    if (!running) return;
    if (!settings.store.convertAlreadySentMessages) {
        restoreDisplayedLinks();
        return;
    }

    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const messages = MessageStore.getMessages(channelId)._array;
    messages.forEach(message => {
        if (!message.content) return;

        const original = originalMessageContent.get(message.id);
        if (original) {
            const expectedContent = convertContent(original.content).content;
            if (message.content === expectedContent) return;
            originalMessageContent.delete(message.id);
        }

        const converted = convertContent(message.content);
        if (!converted.convertedUrls.length || converted.content === message.content) return;

        originalMessageContent.set(message.id, { channelId, content: message.content });
        updateMessage(channelId, message.id, { content: converted.content });
    });
}

function scheduleDisplayedLinkRefresh() {
    if (!running || refreshScheduled) return;
    refreshScheduled = true;
    queueMicrotask(refreshDisplayedLinks);
}

function reapplyDisplayedLinks() {
    restoreDisplayedLinks();
    scheduleDisplayedLinkRefresh();
}

export const vencordPlugin = {
    description: "Rewrites X/Twitter and Instagram links you send to embed-friendly services and locally converts links in already-sent messages.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "brainage04", id: 0n }],
    settings,


    start() {
        unpatchRequests = patchMessageRequests(RestAPI, content =>
            settings.store.convertMessagesISend ? convertContent(content).content : content
        );
        running = true;
        MessageStore.addChangeListener(scheduleDisplayedLinkRefresh);
        SelectedChannelStore.addChangeListener(scheduleDisplayedLinkRefresh);
        scheduleDisplayedLinkRefresh();
    },

    stop() {
        unpatchRequests?.();
        unpatchRequests = undefined;
        running = false;
        MessageStore.removeChangeListener(scheduleDisplayedLinkRefresh);
        SelectedChannelStore.removeChangeListener(scheduleDisplayedLinkRefresh);
        refreshScheduled = false;
        restoreDisplayedLinks();
    }
} satisfies Omit<PluginDef, "name">;
