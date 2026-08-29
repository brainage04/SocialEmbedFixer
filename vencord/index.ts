/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { updateMessage } from "@api/MessageUpdater";
import { definePluginSettings } from "@api/Settings";
import { OptionType, type PluginDef } from "@utils/types";
import { MessageStore, SelectedChannelStore } from "@webpack/common";

import {
    convertXUrls,
    CUSTOM_DOMAIN_VALUE,
    EMBED_DOMAINS,
    resolveEmbedDomain
} from "../common/xUrls";

const settings = definePluginSettings({
    convertMessagesISend: {
        displayName: "Convert Messages I Send",
        type: OptionType.BOOLEAN,
        description: "Rewrite X/Twitter and supported embed-service links before your messages and edits are sent",
        default: true
    },
    convertAlreadySentMessages: {
        displayName: "Convert Already Sent Messages",
        type: OptionType.BOOLEAN,
        description: "Locally convert supported links in already-sent messages from all users; never sends a message",
        default: true,
        onChange: reapplyDisplayedLinks
    },
    convertOtherServiceDomains: {
        displayName: "Convert Other Service Domains",
        type: OptionType.BOOLEAN,
        description: "Convert links using another supported embed-service domain to the selected domain",
        default: true,
        onChange: reapplyDisplayedLinks
    },
    domain: {
        type: OptionType.SELECT,
        description: "Embed service domain",
        options: [
            ...EMBED_DOMAINS.map((domain, index) => ({
                label: domain.label,
                value: domain.value,
                default: index === 0
            })),
            { label: "Custom domain", value: CUSTOM_DOMAIN_VALUE }
        ],
        onChange: reapplyDisplayedLinks
    },
    customDomain: {
        type: OptionType.STRING,
        description: "Custom hostname used when Embed service domain is Custom (invalid values fall back to FixupX)",
        default: "",
        onChange: reapplyDisplayedLinks
    }
});


function convertContent(content: string) {
    return convertXUrls(
        content,
        resolveEmbedDomain(settings.store.domain, settings.store.customDomain),
        settings.store.convertOtherServiceDomains
    );
}

function rewriteOwnMessage(message: { content?: string; }) {
    if (!settings.store.convertMessagesISend || !message.content) return;
    message.content = convertContent(message.content).content;
}

const originalMessageContent = new Map<string, { channelId: string; content: string }>();
let refreshScheduled = false;
let running = false;

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
    description: "Rewrites supported X/Twitter links you send and locally converts links in already-sent messages.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "brainage04", id: 0n }],
    settings,

    onBeforeMessageSend(_channelId: string, message: { content?: string; }) {
        rewriteOwnMessage(message);
    },

    onBeforeMessageEdit(_channelId: string, _messageId: string, message: { content?: string; }) {
        rewriteOwnMessage(message);
    },

    start() {
        running = true;
        MessageStore.addChangeListener(scheduleDisplayedLinkRefresh);
        SelectedChannelStore.addChangeListener(scheduleDisplayedLinkRefresh);
        scheduleDisplayedLinkRefresh();
    },

    stop() {
        running = false;
        MessageStore.removeChangeListener(scheduleDisplayedLinkRefresh);
        SelectedChannelStore.removeChangeListener(scheduleDisplayedLinkRefresh);
        refreshScheduled = false;
        restoreDisplayedLinks();
    }
} satisfies Omit<PluginDef, "name">;
