/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { updateMessage } from "@api/MessageUpdater";
import { definePluginSettings } from "@api/Settings";
import { OptionType, type PluginDef } from "@utils/types";
import { FluxDispatcher, MessageStore, RestAPI, SelectedChannelStore } from "@webpack/common";

import {
    convertUrls,
    CUSTOM_DOMAIN_VALUE,
    type Platform,
    PLATFORMS,
    resolveEmbedDomain
} from "../common/embedUrls";
import { patchMessageRequests } from "../common/messageRequests";
import { type ChatMessage, createEmbedLoader, createSentMessageConverter, type UnfurlRestClient } from "../common/sentMessages";

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
        description: "Show supported links in messages already in the chat with the selected services, with the embeds Discord makes for them; only changes what you see and sends nothing",
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

const sentMessages = createSentMessageConverter({
    chat: {
        selectedChannelId: () => SelectedChannelStore.getChannelId(),
        channelMessages: channelId => MessageStore.getMessages(channelId)._array as unknown as ChatMessage[],
        message: (channelId, messageId) => MessageStore.getMessage(channelId, messageId) as unknown as ChatMessage | undefined,
        dispatchUpdate(channelId, messageId, content, embeds) {
            FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: messageId, channel_id: channelId, content, embeds } });
        },
        setFields: (channelId, messageId, fields) => updateMessage(channelId, messageId, fields as Record<string, unknown>)
    },
    loadEmbeds: createEmbedLoader(RestAPI as UnfurlRestClient),
    convert: convertContent,
    enabled: () => settings.store.convertAlreadySentMessages
});

let refreshScheduled = false;
let unpatchRequests: (() => void) | undefined;

function refreshDisplayedLinks() {
    refreshScheduled = false;
    sentMessages.refresh();
}

function scheduleDisplayedLinkRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    queueMicrotask(refreshDisplayedLinks);
}

function reapplyDisplayedLinks() {
    sentMessages.reapply();
}

export const vencordPlugin = {
    description: "Rewrites X/Twitter and Instagram links you send to embed-friendly services, and shows links in messages already in the chat with those services and their embeds.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "brainage04", id: 0n }],
    settings,

    start() {
        unpatchRequests = patchMessageRequests(RestAPI, content =>
            settings.store.convertMessagesISend ? convertContent(content).content : content
        );
        MessageStore.addChangeListener(scheduleDisplayedLinkRefresh);
        SelectedChannelStore.addChangeListener(scheduleDisplayedLinkRefresh);
        sentMessages.start();
    },

    stop() {
        unpatchRequests?.();
        unpatchRequests = undefined;
        MessageStore.removeChangeListener(scheduleDisplayedLinkRefresh);
        SelectedChannelStore.removeChangeListener(scheduleDisplayedLinkRefresh);
        refreshScheduled = false;
        sentMessages.stop();
    }
} satisfies Omit<PluginDef, "name">;
