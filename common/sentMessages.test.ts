/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { convertUrls } from "./embedUrls";
import {
    CANCELLED,
    type ChatAccess,
    type ChatMessage,
    createEmbedLoader,
    createSentMessageConverter,
    type Embed,
    type EmbedLoaderOptions,
    type UnfurlRestClient
} from "./sentMessages";

const convert = (content: string) => convertUrls(content, { x: "fixupx.com", instagram: "vxinstagram.com" }, true);

/** Runs microtasks and pending I/O callbacks without moving the fake clock. */
const flush = () => new Promise(resolve => setImmediate(resolve));

function useFakeTimers(t: TestContext) {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
    /** Moves the fake clock forward in small steps, letting promise chains schedule their next timer. */
    return async function advance(ms: number, step = 50) {
        await flush();
        for (let passed = 0; passed < ms; passed += step) {
            t.mock.timers.tick(Math.min(step, ms - passed));
            await flush();
        }
    };
}

type Reply = { body: { embeds: Embed[]; }; };

/** A fake unfurler; `answer` decides each reply (a value, a rejection, or a promise that settles later). */
function unfurler(answer: (url: string, call: number) => Reply | Promise<Reply> = url => ({ body: { embeds: [{ url, title: "fixed" }] } })) {
    const requests: { url: string; at: number; }[] = [];
    let running = 0;
    let mostAtOnce = 0;
    const client: UnfurlRestClient = {
        async post(request) {
            assert.equal(request.url, "/unfurler/embed-urls");
            const [url] = request.body.urls;
            requests.push({ url, at: Date.now() });
            mostAtOnce = Math.max(mostAtOnce, ++running);
            try {
                return await answer(url, requests.length);
            } finally {
                running--;
            }
        }
    };
    return {
        client,
        urls: () => requests.map(request => request.url),
        times: () => requests.map(request => request.at),
        mostAtOnce: () => mostAtOnce
    };
}

const loaderOptions: EmbedLoaderOptions = { random: () => 0.5 };

/** Message stores per channel that, like Discord's, replace a message object on every change. */
function chatStore(channels: Record<string, ChatMessage[]>) {
    const stores = new Map(Object.entries(channels).map(([id, messages]) =>
        [id, new Map(messages.map(message => [message.id, message]))]
    ));
    let selected = Object.keys(channels)[0];
    const chat: ChatAccess = {
        selectedChannelId: () => selected,
        channelMessages: channelId => [...stores.get(channelId)!.values()],
        message: (channelId, id) => stores.get(channelId)!.get(id),
        dispatchUpdate(channelId, id, content, embeds) {
            const store = stores.get(channelId)!;
            const current = store.get(id);
            if (current) store.set(id, { ...current, content, embeds: embeds.map(embed => ({ ...embed, stored: true })) });
        },
        setFields(channelId, id, fields) {
            const store = stores.get(channelId)!;
            const current = store.get(id);
            if (current) store.set(id, { ...current, ...fields });
        }
    };
    return {
        chat,
        store: (channelId = "1") => stores.get(channelId)!,
        select(channelId: string) { selected = channelId; }
    };
}

const xMessage = (id: string, post = id): ChatMessage => ({ id, content: `https://x.com/a/status/${post}`, embeds: [] });

test("shows a converted link with Discord's embed for it and keeps unrelated embeds", async t => {
    const advance = useFakeTimers(t);
    const youtube = { url: "https://youtube.com/watch?v=1", title: "video" };
    const original: ChatMessage = {
        id: "10",
        content: "https://x.com/a/status/1 https://youtube.com/watch?v=1",
        embeds: [{ url: "https://x.com/a/status/1", title: "plain" }, youtube]
    };
    const { chat, store } = chatStore({ 1: [original] });
    const converter = createSentMessageConverter({
        chat, loader: createEmbedLoader(unfurler().client, loaderOptions), convert, enabled: () => true
    });

    converter.start();
    await advance(0);

    assert.deepEqual(store().get("10"), {
        id: "10",
        content: "https://fixupx.com/a/status/1 https://youtube.com/watch?v=1",
        embeds: [{ url: "https://fixupx.com/a/status/1", title: "fixed", stored: true }, youtube]
    });

    converter.stop();
    assert.deepEqual(store().get("10"), original);
});

test("leaves a message unchanged when Discord makes no embed for a converted link", async t => {
    const advance = useFakeTimers(t);
    const original: ChatMessage = { id: "10", content: "https://instagram.com/p/A1/", embeds: [] };
    const { chat, store } = chatStore({ 1: [original] });
    const converter = createSentMessageConverter({
        chat,
        loader: createEmbedLoader(unfurler(() => ({ body: { embeds: [] } })).client, loaderOptions),
        convert,
        enabled: () => true
    });

    converter.start();
    await advance(0);
    assert.equal(store().get("10"), original);
});

test("skips messages whose embeds are suppressed", async t => {
    const advance = useFakeTimers(t);
    const original: ChatMessage = { ...xMessage("10"), flags: 1 << 2 };
    const { chat, store } = chatStore({ 1: [original] });
    const fake = unfurler();
    const converter = createSentMessageConverter({
        chat, loader: createEmbedLoader(fake.client, loaderOptions), convert, enabled: () => true
    });

    converter.start();
    await advance(0);
    assert.equal(store().get("10"), original);
    assert.deepEqual(fake.urls(), []);
});

test("disabling restores originals but never undoes a later edit", async t => {
    const advance = useFakeTimers(t);
    let enabled = true;
    const { chat, store } = chatStore({ 1: [xMessage("10", "1"), xMessage("11", "2")] });
    const converter = createSentMessageConverter({
        chat, loader: createEmbedLoader(unfurler().client, loaderOptions), convert, enabled: () => enabled
    });

    converter.start();
    await advance(5000);
    store().set("11", { id: "11", content: "edited", embeds: [] });
    enabled = false;
    converter.refresh();

    assert.deepEqual(store().get("10"), xMessage("10", "1"));
    assert.deepEqual(store().get("11"), { id: "11", content: "edited", embeds: [] });
});

test("converts again from the cache when Discord replaces the embeds of a converted message", async t => {
    const advance = useFakeTimers(t);
    const { chat, store } = chatStore({ 1: [xMessage("10", "1")] });
    const fake = unfurler();
    const converter = createSentMessageConverter({
        chat, loader: createEmbedLoader(fake.client, loaderOptions), convert, enabled: () => true
    });

    converter.start();
    await advance(0);
    // A late gateway update with the embed for the original link.
    store().set("10", { ...store().get("10")!, embeds: [{ url: "https://x.com/a/status/1", title: "plain" }] });
    converter.refresh();
    await advance(0);

    assert.deepEqual(store().get("10")!.embeds, [{ url: "https://fixupx.com/a/status/1", title: "fixed", stored: true }]);
    assert.deepEqual(fake.urls(), ["https://fixupx.com/a/status/1"]);
});

test("a reapply does not ask again for links already looked up", async t => {
    const advance = useFakeTimers(t);
    const { chat, store } = chatStore({ 1: [xMessage("10", "1"), xMessage("11", "2")] });
    const fake = unfurler();
    const converter = createSentMessageConverter({
        chat, loader: createEmbedLoader(fake.client, loaderOptions), convert, enabled: () => true
    });

    converter.start();
    await advance(5000);
    assert.equal(fake.urls().length, 2);

    converter.reapply();
    await advance(5000);
    assert.equal(fake.urls().length, 2);
    assert.equal(store().get("10")!.content, "https://fixupx.com/a/status/1");
    assert.equal(store().get("11")!.content, "https://fixupx.com/a/status/2");
});

test("looks up one link at a time with a jittered pause of 1-2 s between requests", async t => {
    const advance = useFakeTimers(t);
    const fake = unfurler(url => new Promise(resolve => setTimeout(() => resolve({ body: { embeds: [{ url }] } }), 300)));
    const { load } = createEmbedLoader(fake.client, { random: () => 0.5 });

    const results = Promise.all(["https://a.example/1", "https://a.example/2", "https://a.example/3"].map(load));
    await advance(10_000);

    assert.equal(fake.mostAtOnce(), 1);
    // Each request takes 300 ms, then the next waits 1000 + 0.5 * 1000 ms.
    assert.deepEqual(fake.times(), [0, 1800, 3600]);
    assert.deepEqual((await results).map(embeds => (embeds as Embed[])[0].url), fake.urls());

    const shortest = unfurler();
    const { load: loadQuickly } = createEmbedLoader(shortest.client, { random: () => 0 });
    void loadQuickly("https://b.example/1");
    void loadQuickly("https://b.example/2");
    await advance(5000);
    assert.equal(shortest.times()[1] - shortest.times()[0], 1000);
});

test("gives up on a rate-limited link after 3 retries, never waiting less than Discord asks", async t => {
    const advance = useFakeTimers(t);
    const fake = unfurler(() => Promise.reject({ status: 429, body: { retry_after: 5 } }));
    const result = createEmbedLoader(fake.client, loaderOptions).load("https://a.example/1");

    await advance(60_000);
    assert.equal(await result, null);
    // Waits max(retry_after, 2 s doubling): 5 s, 5 s, 8 s.
    assert.deepEqual(fake.times(), [0, 5000, 10_000, 18_000]);
});

test("a longer retry_after than the backoff is honoured in full", async t => {
    const advance = useFakeTimers(t);
    const fake = unfurler(() => Promise.reject({ status: 429, body: { retry_after: 30 } }));
    void createEmbedLoader(fake.client, { ...loaderOptions, maxRetries: 1 }).load("https://a.example/1");

    await advance(29_950);
    assert.equal(fake.times().length, 1);
    await advance(100);
    assert.deepEqual(fake.times(), [0, 30_000]);
});

test("a failed request resolves to no embed without retrying", async t => {
    const advance = useFakeTimers(t);
    const fake = unfurler(() => Promise.reject(new Error("offline")));
    const result = createEmbedLoader(fake.client, loaderOptions).load("https://a.example/1");
    await advance(10_000);
    assert.equal(await result, null);
    assert.equal(fake.urls().length, 1);
});

test("a link that keeps failing leaves its message as it was and is not asked for again for a while", async t => {
    const advance = useFakeTimers(t);
    const original = xMessage("10", "1");
    const { chat, store } = chatStore({ 1: [original] });
    const fake = unfurler(() => Promise.reject({ status: 429, body: { retry_after: 1 } }));
    const converter = createSentMessageConverter({
        chat, loader: createEmbedLoader(fake.client, { ...loaderOptions, noEmbedMs: 60_000 }), convert, enabled: () => true
    });

    converter.start();
    await advance(30_000);
    assert.equal(fake.urls().length, 4);
    assert.equal(store().get("10"), original);

    converter.refresh();
    await advance(1000);
    assert.equal(fake.urls().length, 4);

    await advance(60_000);
    converter.refresh();
    await advance(1000);
    assert.equal(fake.urls().length, 5);
});

test("keeps a bounded cache and drops the least recently used link first", async t => {
    const advance = useFakeTimers(t);
    const fake = unfurler();
    const { load } = createEmbedLoader(fake.client, { ...loaderOptions, cacheSize: 2 });

    for (const url of ["https://a.example/1", "https://a.example/2"]) {
        void load(url);
        await advance(2000);
    }
    // Using link 1 again makes link 2 the least recently used one.
    void load("https://a.example/1");
    void load("https://a.example/3");
    await advance(2000);
    assert.deepEqual(fake.urls(), ["https://a.example/1", "https://a.example/2", "https://a.example/3"]);

    void load("https://a.example/1");
    void load("https://a.example/2");
    await advance(2000);
    assert.deepEqual(fake.urls().slice(3), ["https://a.example/2"]);
});

test("caches 'no embed' answers only for a while", async t => {
    const advance = useFakeTimers(t);
    const fake = unfurler(() => ({ body: { embeds: [] } }));
    const { load } = createEmbedLoader(fake.client, { ...loaderOptions, noEmbedMs: 10_000 });

    assert.equal(await load("https://a.example/1"), null);
    assert.equal(await load("https://a.example/1"), null);
    assert.equal(fake.urls().length, 1);

    await advance(10_000);
    void load("https://a.example/1");
    await advance(0);
    assert.equal(fake.urls().length, 2);
});

test("converts only the most recent links in the open channel", async t => {
    const advance = useFakeTimers(t);
    const messages = Array.from({ length: 12 }, (_, index) => xMessage(String(10 + index)));
    const { chat, store } = chatStore({ 1: messages });
    const fake = unfurler();
    const converter = createSentMessageConverter({
        chat, loader: createEmbedLoader(fake.client, loaderOptions), convert, enabled: () => true, maxLinks: 10
    });

    converter.start();
    await advance(30_000);

    assert.deepEqual(fake.urls(), messages.slice(2).reverse().map(message => `https://fixupx.com/a/status/${message.id}`));
    assert.equal(store().get("10"), messages[0]);
    assert.equal(store().get("11"), messages[1]);
    assert.equal(store().get("12")!.content, "https://fixupx.com/a/status/12");

    // Converted messages still count, so a refresh does not reach further back.
    converter.refresh();
    await advance(5000);
    assert.equal(fake.urls().length, 10);
});

test("switching channel cancels the lookups the old channel was still waiting for", async t => {
    const advance = useFakeTimers(t);
    const { chat, store, select } = chatStore({
        1: [xMessage("10"), xMessage("11"), xMessage("12")],
        2: [xMessage("20")]
    });
    const fake = unfurler();
    const loader = createEmbedLoader(fake.client, loaderOptions);
    const converter = createSentMessageConverter({ chat, loader, convert, enabled: () => true });

    converter.start();
    await advance(0);
    assert.deepEqual(fake.urls(), ["https://fixupx.com/a/status/12"]);

    select("2");
    converter.refresh();
    await advance(10_000);

    assert.deepEqual(fake.urls(), ["https://fixupx.com/a/status/12", "https://fixupx.com/a/status/20"]);
    assert.equal(store("1").get("11")!.content, "https://x.com/a/status/11");
    assert.equal(store("2").get("20")!.content, "https://fixupx.com/a/status/20");

    // Back in channel 1 the cancelled links are looked up again.
    select("1");
    converter.refresh();
    await advance(10_000);
    assert.equal(store("1").get("10")!.content, "https://fixupx.com/a/status/10");
    assert.equal(fake.urls().length, 4);
});

test("a cancelled lookup resolves as cancelled and is not cached", async t => {
    const advance = useFakeTimers(t);
    const fake = unfurler();
    const loader = createEmbedLoader(fake.client, loaderOptions);
    void loader.load("https://a.example/1");
    const second = loader.load("https://a.example/2");
    loader.cancelPending();
    assert.equal(await second, CANCELLED);

    await advance(5000);
    void loader.load("https://a.example/2");
    await advance(5000);
    assert.deepEqual(fake.urls(), ["https://a.example/1", "https://a.example/2"]);
});
