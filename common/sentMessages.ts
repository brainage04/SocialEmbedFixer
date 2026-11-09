/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type ConvertedText, isSameLink } from "./embedUrls";

/** An embed as Discord's API or its message store holds it; only `url` is read here. */
export type Embed = { url?: string; } & Record<string, unknown>;

export interface UnfurlRestClient {
    post(request: { url: string; body: { urls: string[]; }; }): Promise<{ body?: { embeds?: Embed[]; }; }>;
}

/**
 * Discord answers more than a handful of quick unfurl requests with 429 and the seconds to wait. Every
 * request waits that long and asks again, so a busy channel converts at Discord's pace instead of
 * leaving the links it was refused unconverted.
 */
function rateLimitWait(error: unknown) {
    const response = error as { status?: number; body?: { retry_after?: number; }; } | undefined;
    if (response?.status !== 429) return null;
    return (response.body?.retry_after ?? 5) * 1000;
}

/** Fetches the embeds Discord makes for a link, once per link and a few links at a time. */
export function createEmbedLoader(client: UnfurlRestClient, maxConcurrent = 2) {
    const cache = new Map<string, Promise<Embed[] | null>>();
    const waiting: (() => void)[] = [];
    let running = 0;
    let pausedUntil = 0;

    async function acquire() {
        if (running < maxConcurrent) running++;
        else await new Promise<void>(resolve => waiting.push(resolve));
    }

    function release() {
        // Hand the slot straight to the next request so a new caller cannot overtake it.
        const next = waiting.shift();
        if (next) next();
        else running--;
    }

    async function request(url: string) {
        await acquire();
        try {
            for (;;) {
                const pause = pausedUntil - Date.now();
                if (pause > 0) await new Promise(resolve => setTimeout(resolve, pause));
                try {
                    const { body } = await client.post({ url: "/unfurler/embed-urls", body: { urls: [url] } });
                    return body?.embeds?.length ? body.embeds : null;
                } catch (error) {
                    const wait = rateLimitWait(error);
                    if (wait === null) return null;
                    pausedUntil = Math.max(pausedUntil, Date.now() + wait);
                }
            }
        } finally {
            release();
        }
    }

    /** Resolves to null when Discord makes no embed for the link or the request fails other than by rate limiting. */
    return function loadEmbeds(url: string) {
        let embeds = cache.get(url);
        if (!embeds) {
            embeds = request(url);
            cache.set(url, embeds);
        }
        return embeds;
    };
}

export interface ChatMessage {
    id: string;
    content: string;
    embeds: Embed[];
    flags?: number;
}

export interface ChatAccess {
    selectedChannelId(): string | null | undefined;
    channelMessages(channelId: string): readonly ChatMessage[];
    message(channelId: string, messageId: string): ChatMessage | undefined;
    /** Updates a message like a gateway MESSAGE_UPDATE, so Discord stores API embeds in its own format. */
    dispatchUpdate(channelId: string, messageId: string, content: string, embeds: Embed[]): void;
    /** Sets fields that are already in the message store's format. */
    setFields(channelId: string, messageId: string, fields: { content?: string; embeds?: Embed[]; }): void;
}

export interface SentMessageConverterOptions {
    chat: ChatAccess;
    loadEmbeds(url: string): Promise<Embed[] | null>;
    convert(content: string): ConvertedText;
    enabled(): boolean;
}

interface ConvertedMessage {
    channelId: string;
    originalContent: string;
    originalEmbeds: Embed[];
    content: string;
    embeds: Embed[];
}

const SUPPRESS_EMBEDS = 1 << 2;

/**
 * Shows links in messages already in the selected channel with the selected services, together with
 * the embeds Discord makes for the converted links. Only the local copy changes; nothing is sent.
 */
export function createSentMessageConverter({ chat, loadEmbeds, convert, enabled }: SentMessageConverterOptions) {
    const converted = new Map<string, ConvertedMessage>();
    const loading = new Set<string>();
    let active = false;

    function convertMessage(channelId: string, message: ChatMessage, originalContent: string) {
        if ((message.flags ?? 0) & SUPPRESS_EMBEDS) return;
        const result = convert(originalContent);
        if (!result.conversions.length || result.content === originalContent) return;

        loading.add(message.id);
        void Promise.all(result.conversions.map(({ to }) => loadEmbeds(to))).then(loaded => {
            loading.delete(message.id);
            if (!active || !enabled()) return;
            // Keep the original link whenever one of the converted links gets no embed.
            if (loaded.some(embeds => !embeds)) return;
            // The message or the settings changed while loading; the next refresh handles it.
            const current = chat.message(channelId, message.id);
            if (current?.content !== message.content || current.embeds !== message.embeds) return;
            if (convert(originalContent).content !== result.content) return;

            const keptEmbeds = message.embeds.filter(embed =>
                !embed.url || !result.conversions.some(({ from }) => isSameLink(embed.url!, from))
            );
            chat.dispatchUpdate(channelId, message.id, result.content, loaded.flatMap(embeds => embeds!));
            if (keptEmbeds.length) {
                const updated = chat.message(channelId, message.id);
                if (updated) chat.setFields(channelId, message.id, { embeds: [...updated.embeds, ...keptEmbeds] });
            }

            const applied = chat.message(channelId, message.id);
            if (applied?.content === result.content) {
                converted.set(message.id, {
                    channelId,
                    originalContent,
                    originalEmbeds: message.embeds,
                    content: applied.content,
                    embeds: applied.embeds
                });
            }
        });
    }

    function restore() {
        const entries = [...converted];
        converted.clear();
        for (const [messageId, entry] of entries) {
            const current = chat.message(entry.channelId, messageId);
            // Leave messages alone that were edited since, so an edit is never undone.
            if (current?.content !== entry.content) continue;
            chat.setFields(entry.channelId, messageId, current.embeds === entry.embeds
                ? { content: entry.originalContent, embeds: entry.originalEmbeds }
                : { content: entry.originalContent });
        }
    }

    function refresh() {
        if (!active) return;
        if (!enabled()) {
            restore();
            return;
        }

        const channelId = chat.selectedChannelId();
        if (!channelId) return;

        for (const message of chat.channelMessages(channelId)) {
            if (!message.content || loading.has(message.id)) continue;

            const entry = converted.get(message.id);
            if (!entry) {
                convertMessage(channelId, message, message.content);
                continue;
            }
            if (message.content === entry.content && message.embeds === entry.embeds) continue;

            converted.delete(message.id);
            // Discord replaced only the embeds, e.g. when it finished unfurling the original link.
            if (message.content === entry.content) convertMessage(channelId, message, entry.originalContent);
            else convertMessage(channelId, message, message.content);
        }
    }

    return {
        start() {
            active = true;
            refresh();
        },
        stop() {
            active = false;
            loading.clear();
            restore();
        },
        refresh,
        /** Puts back every original message, then converts again with the current settings. */
        reapply() {
            restore();
            refresh();
        }
    };
}
