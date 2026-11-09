/*
 * SocialEmbedFixer
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";

import { convertLinks, createDisplayedSettings, linkSettings } from "../../common/linkSettings";
import { type MessageRestClient, patchMessageRequests } from "../../common/messageRequests";
import { type ChatMessage, createEmbedLoader, createSentMessageConverter, type UnfurlRestClient } from "../../common/sentMessages";
import Settings from "./settings";
import { initializeStorage, onSettingsChanged, pluginStorage } from "./state";

interface ChangeEmitter {
    addChangeListener(listener: () => void): void;
    removeChangeListener(listener: () => void): void;
}

interface MessageStore extends ChangeEmitter {
    getMessages(channelId: string): { _array: ChatMessage[]; };
    getMessage(channelId: string, messageId: string): ChatMessage | undefined;
    emitChange(): void;
}

interface SelectedChannelStore extends ChangeEmitter {
    getChannelId(): string | null | undefined;
}

interface ChannelMessages {
    has(messageId: string): boolean;
    update(messageId: string, change: (message: { merge(fields: object): unknown; }) => unknown): ChannelMessages;
}

interface MessageCache {
    getOrCreate(channelId: string): ChannelMessages;
    commit(messages: ChannelMessages): void;
}

let cleanup: (() => void) | undefined;

function find<T>(value: unknown, name: string) {
    if (!value) throw new Error(`SocialEmbedFixer could not locate Discord's ${name}`);
    return value as T;
}


function onLoad() {
    initializeStorage();

    const rest = find<MessageRestClient & UnfurlRestClient>(findByProps("get", "post", "put", "patch", "del"), "REST client");
    const messageStore = find<MessageStore>(findByStoreName("MessageStore"), "MessageStore");
    const selectedChannelStore = find<SelectedChannelStore>(findByStoreName("SelectedChannelStore"), "SelectedChannelStore");
    const messageCache = find<MessageCache>(findByProps("clearCache", "_channelMessages"), "message cache");

    // Applied settings only change after a pause in editing, so the converter exists by then.
    const displayedSettings = createDisplayedSettings(() => pluginStorage, () => sentMessages.reapply());
    const sentMessages = createSentMessageConverter({
        chat: {
            selectedChannelId: () => selectedChannelStore.getChannelId(),
            channelMessages: channelId => messageStore.getMessages(channelId)._array,
            message: (channelId, messageId) => messageStore.getMessage(channelId, messageId),
            dispatchUpdate(channelId, messageId, content, embeds) {
                FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: messageId, channel_id: channelId, content, embeds } });
            },
            setFields(channelId, messageId, fields) {
                const messages = messageCache.getOrCreate(channelId);
                if (!messages.has(messageId)) return;
                messageCache.commit(messages.update(messageId, message => message.merge(fields)));
                messageStore.emitChange();
            }
        },
        loader: createEmbedLoader(rest),
        convert: content => convertLinks(content, displayedSettings.current()),
        enabled: () => displayedSettings.current().enabled
    });

    let refreshScheduled = false;
    const scheduleRefresh = () => {
        if (refreshScheduled) return;
        refreshScheduled = true;
        Promise.resolve().then(() => {
            refreshScheduled = false;
            sentMessages.refresh();
        });
    };

    const unpatchRequests = patchMessageRequests(rest, content =>
        pluginStorage.convertMessagesISend ? convertLinks(content, linkSettings(pluginStorage)).content : content
    );
    messageStore.addChangeListener(scheduleRefresh);
    selectedChannelStore.addChangeListener(scheduleRefresh);
    onSettingsChanged(displayedSettings.changed);
    sentMessages.start();

    cleanup = () => {
        unpatchRequests();
        onSettingsChanged(undefined);
        messageStore.removeChangeListener(scheduleRefresh);
        selectedChannelStore.removeChangeListener(scheduleRefresh);
        sentMessages.stop();
        displayedSettings.stop();
    };
}

function onUnload() {
    cleanup?.();
    cleanup = undefined;
}

export default { onLoad, onUnload, settings: Settings };
