/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { updateMessage } from "@api/MessageUpdater";
import { definePluginSettings } from "@api/Settings";
import { OptionType, type PluginDef } from "@utils/types";
import { FluxDispatcher, MessageStore, RestAPI, SelectedChannelStore } from "@webpack/common";

import { CUSTOM_DOMAIN_VALUE, type Platform, PLATFORMS } from "../common/embedUrls";
import { convertLinks, createDisplayedSettings, type DisplayedSettings, linkSettings } from "../common/linkSettings";
import { patchMessageRequests } from "../common/messageRequests";
import {
    type ChatMessage,
    createEmbedLoader,
    createSentMessageConverter,
    MAX_LINKS_PER_CHANNEL,
    type UnfurlRestClient
} from "../common/sentMessages";

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
        onChange: displayedSettingsChanged
    };
}

function customDomainSetting(platform: Platform) {
    const { label, services } = PLATFORMS[platform];
    return {
        type: OptionType.STRING as const,
        description: `Custom hostname used when the ${label} embed service is Custom (invalid values fall back to ${services[0].label} for links you send; messages already in the chat keep their current service until the value is valid)`,
        default: "",
        onChange: displayedSettingsChanged
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
        description: `Show the most recent ${MAX_LINKS_PER_CHANNEL} supported links in the open channel with the selected services, with the embeds Discord makes for them; only changes what you see and posts nothing to the chat, but asks Discord for the embed of each of those links, one at a time`,
        default: true,
        onChange: displayedSettingsChanged
    },
    convertOtherServiceDomains: {
        displayName: "Convert Other Service Domains",
        type: OptionType.BOOLEAN,
        description: "Convert links using another known embed service to the service selected for that platform",
        default: true,
        onChange: displayedSettingsChanged
    },
    xDomain: serviceSetting("x"),
    xCustomDomain: customDomainSetting("x"),
    instagramDomain: serviceSetting("instagram"),
    instagramCustomDomain: customDomainSetting("instagram")
});

let displayedSettings: DisplayedSettings | undefined;

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
    loader: createEmbedLoader(RestAPI as UnfurlRestClient),
    convert: content => convertLinks(content, displayedSettings!.current()),
    enabled: () => displayedSettings?.current().enabled ?? false
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

function displayedSettingsChanged() {
    displayedSettings?.changed();
}

export const vencordPlugin = {
    description: "Rewrites X/Twitter and Instagram links you send to embed-friendly services, and shows links in messages already in the chat with those services and their embeds.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "brainage04", id: 0n }],
    settings,

    start() {
        unpatchRequests = patchMessageRequests(RestAPI, content =>
            settings.store.convertMessagesISend ? convertLinks(content, linkSettings(settings.store)).content : content
        );
        displayedSettings = createDisplayedSettings(() => settings.store, sentMessages.reapply);
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
        displayedSettings?.stop();
        displayedSettings = undefined;
    }
} satisfies Omit<PluginDef, "name">;
