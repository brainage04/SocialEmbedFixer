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

/** What a lookup gives: Discord's embeds for the link, null when there is none (or Discord kept refusing), or cancelled. */
export type EmbedLookup = Embed[] | null | typeof CANCELLED;
export const CANCELLED = "cancelled";

export interface EmbedLoader {
    load(url: string): Promise<EmbedLookup>;
    /** Drops every lookup that has not started; they resolve to `CANCELLED`. The one running finishes. */
    cancelPending(): void;
}

export interface EmbedLoaderOptions {
    /** Links whose result is kept; the least recently used one is dropped first. */
    cacheSize?: number;
    /** How long a link with no embed (or that kept failing) is remembered before it may be asked for again. */
    noEmbedMs?: number;
    /** Retries after Discord answers 429, each waiting at least as long as Discord asks. */
    maxRetries?: number;
    /** Pause between one request ending and the next starting, picked at random in this range. */
    pauseMs?: readonly [min: number, max: number];
    /** Wait before the first retry when Discord gives no `retry_after`; doubles for each further retry. */
    retryBaseMs?: number;
    random?(): number;
}

export const EMBED_LOOKUP_LIMITS = {
    cacheSize: 200,
    noEmbedMs: 30 * 60_000,
    maxRetries: 3,
    pauseMs: [1000, 2000] as const,
    retryBaseMs: 2000
};

/** The milliseconds Discord asks to wait after a 429, or null for any other failure. */
function rateLimitWait(error: unknown) {
    const response = error as { status?: number; body?: { retry_after?: number; }; } | undefined;
    if (response?.status !== 429) return null;
    const seconds = response.body?.retry_after;
    return typeof seconds === "number" && seconds > 0 ? seconds * 1000 : 0;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Asks Discord for the embeds of links, one request at a time with a pause of a second or two between
 * them, like a person opening links one after another. Results are cached (including "no embed"), and a
 * link Discord keeps rate limiting is given up after a few retries instead of being asked for forever.
 */
export function createEmbedLoader(client: UnfurlRestClient, options: EmbedLoaderOptions = {}): EmbedLoader {
    const {
        cacheSize = EMBED_LOOKUP_LIMITS.cacheSize,
        noEmbedMs = EMBED_LOOKUP_LIMITS.noEmbedMs,
        maxRetries = EMBED_LOOKUP_LIMITS.maxRetries,
        pauseMs: [minPause, maxPause] = EMBED_LOOKUP_LIMITS.pauseMs,
        retryBaseMs = EMBED_LOOKUP_LIMITS.retryBaseMs,
        random = Math.random
    } = options;
    // A Map keeps insertion order, so re-inserting on every use makes the first key the least recently used.
    const cache = new Map<string, { embeds: Embed[] | null; expiresAt: number; }>();
    const inFlight = new Map<string, Promise<EmbedLookup>>();
    const queue: { url: string; resolve(result: EmbedLookup): void; }[] = [];
    let draining = false;
    let nextRequestAt = 0;

    function cached(url: string) {
        const entry = cache.get(url);
        if (!entry) return undefined;
        cache.delete(url);
        if (entry.expiresAt <= Date.now()) return undefined;
        cache.set(url, entry);
        return entry.embeds;
    }

    function remember(url: string, embeds: Embed[] | null) {
        cache.delete(url);
        cache.set(url, { embeds, expiresAt: embeds ? Infinity : Date.now() + noEmbedMs });
        while (cache.size > cacheSize) cache.delete(cache.keys().next().value!);
    }

    async function request(url: string) {
        for (let retry = 0; ; retry++) {
            try {
                const { body } = await client.post({ url: "/unfurler/embed-urls", body: { urls: [url] } });
                return body?.embeds?.length ? body.embeds : null;
            } catch (error) {
                const asked = rateLimitWait(error);
                if (asked === null || retry >= maxRetries) return null;
                await sleep(Math.max(asked, retryBaseMs * 2 ** retry));
            }
        }
    }

    async function drain() {
        if (draining) return;
        draining = true;
        try {
            while (queue.length) {
                const wait = nextRequestAt - Date.now();
                if (wait > 0) await sleep(wait);
                const next = queue.shift();
                if (!next) break;
                const embeds = await request(next.url);
                nextRequestAt = Date.now() + minPause + random() * (maxPause - minPause);
                remember(next.url, embeds);
                inFlight.delete(next.url);
                next.resolve(embeds);
            }
        } finally {
            draining = false;
        }
    }

    return {
        load(url) {
            const hit = cached(url);
            if (hit !== undefined) return Promise.resolve(hit);
            let lookup = inFlight.get(url);
            if (!lookup) {
                lookup = new Promise(resolve => queue.push({ url, resolve }));
                inFlight.set(url, lookup);
                void drain();
            }
            return lookup;
        },
        cancelPending() {
            for (const { url, resolve } of queue.splice(0)) {
                inFlight.delete(url);
                resolve(CANCELLED);
            }
        }
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
    loader: EmbedLoader;
    convert(content: string): ConvertedText;
    enabled(): boolean;
    /** Only the most recent links that would be converted in the open channel are looked up and converted. */
    maxLinks?: number;
}

export const MAX_LINKS_PER_CHANNEL = 10;

interface ConvertedMessage {
    channelId: string;
    originalContent: string;
    originalEmbeds: Embed[];
    content: string;
    embeds: Embed[];
    links: number;
}

const SUPPRESS_EMBEDS = 1 << 2;

/**
 * Shows links in messages already in the selected channel with the selected services, together with
 * the embeds Discord makes for the converted links. Only the local copy changes; nothing is sent.
 * Only the most recent `maxLinks` links in the open channel are converted, and switching channel drops
 * the lookups the old channel was still waiting for.
 */
export function createSentMessageConverter({ chat, loader, convert, enabled, maxLinks = MAX_LINKS_PER_CHANNEL }: SentMessageConverterOptions) {
    const converted = new Map<string, ConvertedMessage>();
    /** Messages waiting for embeds, with the number of links each one converts. */
    const loading = new Map<string, number>();
    let active = false;
    let viewedChannelId: string | undefined;

    function conversionOf(message: ChatMessage, originalContent: string) {
        if ((message.flags ?? 0) & SUPPRESS_EMBEDS) return null;
        const result = convert(originalContent);
        if (!result.conversions.length || result.content === originalContent) return null;
        return result;
    }

    function convertMessage(channelId: string, message: ChatMessage, originalContent: string, result: ConvertedText) {
        loading.set(message.id, result.conversions.length);
        void Promise.all(result.conversions.map(({ to }) => loader.load(to))).then(loaded => {
            loading.delete(message.id);
            if (!active || !enabled()) return;
            // Keep the original link and embeds whenever a converted link gets no embed, its lookup
            // failed or it was cancelled; a cancelled one is looked up again when its channel is opened.
            if (loaded.some(embeds => !Array.isArray(embeds))) return;
            // The message or the settings changed while loading; the next refresh handles it.
            const current = chat.message(channelId, message.id);
            if (current?.content !== message.content || current.embeds !== message.embeds) return;
            if (convert(originalContent).content !== result.content) return;

            const keptEmbeds = message.embeds.filter(embed =>
                !embed.url || !result.conversions.some(({ from }) => isSameLink(embed.url!, from))
            );
            chat.dispatchUpdate(channelId, message.id, result.content, loaded.flatMap(embeds => embeds as Embed[]));
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
                    embeds: applied.embeds,
                    links: result.conversions.length
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
            loader.cancelPending();
            restore();
            return;
        }

        const channelId = chat.selectedChannelId() ?? undefined;
        if (channelId !== viewedChannelId) {
            loader.cancelPending();
            viewedChannelId = channelId;
        }
        if (!channelId) return;

        // Newest first, so the budget goes to the links the user is looking at.
        const messages = chat.channelMessages(channelId);
        let links = 0;
        for (let index = messages.length - 1; index >= 0 && links < maxLinks; index--) {
            const message = messages[index];
            if (!message.content) continue;

            const waiting = loading.get(message.id);
            if (waiting !== undefined) {
                links += waiting;
                continue;
            }

            const entry = converted.get(message.id);
            if (entry) {
                if (message.content === entry.content && message.embeds === entry.embeds) {
                    links += entry.links;
                    continue;
                }
                converted.delete(message.id);
            }

            // Discord replaced only the embeds, e.g. when it finished unfurling the original link.
            const originalContent = entry && message.content === entry.content ? entry.originalContent : message.content;
            const result = conversionOf(message, originalContent);
            if (!result) continue;
            links += result.conversions.length;
            if (links > maxLinks) break;
            convertMessage(channelId, message, originalContent, result);
        }
    }

    return {
        start() {
            active = true;
            refresh();
        },
        stop() {
            active = false;
            viewedChannelId = undefined;
            loader.cancelPending();
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
