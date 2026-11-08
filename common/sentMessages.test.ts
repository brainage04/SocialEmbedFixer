/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test from "node:test";

import { convertUrls } from "./embedUrls";
import { type ChatAccess, type ChatMessage, createEmbedLoader, createSentMessageConverter, type Embed, type UnfurlRestClient } from "./sentMessages";

const convert = (content: string) => convertUrls(content, { x: "fixupx.com", instagram: "vxinstagram.com" }, true);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function unfurler(embedsFor: (url: string) => Embed[] = url => [{ url, title: "fixed" }]) {
    const requests: string[] = [];
    const pending: (() => void)[] = [];
    let holding = false;
    const client: UnfurlRestClient = {
        post(request) {
            assert.equal(request.url, "/unfurler/embed-urls");
            const [url] = request.body.urls;
            requests.push(url);
            const reply = () => ({ body: { embeds: embedsFor(url) } });
            if (!holding) return Promise.resolve(reply());
            return new Promise(resolve => pending.push(() => resolve(reply())));
        }
    };
    return {
        client,
        requests,
        hold() { holding = true; },
        releaseOne() { pending.shift()?.(); },
        get waiting() { return pending.length; }
    };
}

/** A message store that, like Discord's, replaces a message object on every change. */
function chatStore(messages: ChatMessage[]) {
    const store = new Map(messages.map(message => [message.id, message]));
    const chat: ChatAccess = {
        selectedChannelId: () => "1",
        channelMessages: () => [...store.values()],
        message: (_, id) => store.get(id),
        dispatchUpdate(_, id, content, embeds) {
            const current = store.get(id);
            if (current) store.set(id, { ...current, content, embeds: embeds.map(embed => ({ ...embed, stored: true })) });
        },
        setFields(_, id, fields) {
            const current = store.get(id);
            if (current) store.set(id, { ...current, ...fields });
        }
    };
    return { chat, store };
}

test("shows a converted link with Discord's embed for it and keeps unrelated embeds", async () => {
    const youtube = { url: "https://youtube.com/watch?v=1", title: "video" };
    const original: ChatMessage = {
        id: "10",
        content: "https://x.com/a/status/1 https://youtube.com/watch?v=1",
        embeds: [{ url: "https://x.com/a/status/1", title: "plain" }, youtube]
    };
    const { chat, store } = chatStore([original]);
    const { client } = unfurler();
    const converter = createSentMessageConverter({ chat, loadEmbeds: createEmbedLoader(client), convert, enabled: () => true });

    converter.start();
    await settle();

    assert.deepEqual(store.get("10"), {
        id: "10",
        content: "https://fixupx.com/a/status/1 https://youtube.com/watch?v=1",
        embeds: [{ url: "https://fixupx.com/a/status/1", title: "fixed", stored: true }, youtube]
    });

    converter.stop();
    assert.deepEqual(store.get("10"), original);
});

test("leaves a message unchanged when Discord makes no embed for a converted link", async () => {
    const original: ChatMessage = { id: "10", content: "https://instagram.com/p/A1/", embeds: [] };
    const { chat, store } = chatStore([original]);
    const converter = createSentMessageConverter({
        chat,
        loadEmbeds: createEmbedLoader(unfurler(() => []).client),
        convert,
        enabled: () => true
    });

    converter.start();
    await settle();
    assert.equal(store.get("10"), original);
});

test("skips messages whose embeds are suppressed", async () => {
    const original: ChatMessage = { id: "10", content: "https://x.com/a/status/1", embeds: [], flags: 1 << 2 };
    const { chat, store } = chatStore([original]);
    const { client, requests } = unfurler();
    const converter = createSentMessageConverter({ chat, loadEmbeds: createEmbedLoader(client), convert, enabled: () => true });

    converter.start();
    await settle();
    assert.equal(store.get("10"), original);
    assert.deepEqual(requests, []);
});

test("disabling restores originals but never undoes a later edit", async () => {
    let enabled = true;
    const { chat, store } = chatStore([
        { id: "10", content: "https://x.com/a/status/1", embeds: [] },
        { id: "11", content: "https://x.com/b/status/2", embeds: [] }
    ]);
    const converter = createSentMessageConverter({
        chat, loadEmbeds: createEmbedLoader(unfurler().client), convert, enabled: () => enabled
    });

    converter.start();
    await settle();
    store.set("11", { id: "11", content: "edited", embeds: [] });
    enabled = false;
    converter.refresh();

    assert.deepEqual(store.get("10"), { id: "10", content: "https://x.com/a/status/1", embeds: [] });
    assert.deepEqual(store.get("11"), { id: "11", content: "edited", embeds: [] });
});

test("converts again when Discord replaces the embeds of a converted message", async () => {
    const { chat, store } = chatStore([{ id: "10", content: "https://x.com/a/status/1", embeds: [] }]);
    const { client, requests } = unfurler();
    const converter = createSentMessageConverter({ chat, loadEmbeds: createEmbedLoader(client), convert, enabled: () => true });

    converter.start();
    await settle();
    // A late gateway update with the embed for the original link.
    store.set("10", { ...store.get("10")!, embeds: [{ url: "https://x.com/a/status/1", title: "plain" }] });
    converter.refresh();
    await settle();

    assert.deepEqual(store.get("10")!.embeds, [{ url: "https://fixupx.com/a/status/1", title: "fixed", stored: true }]);
    assert.deepEqual(requests, ["https://fixupx.com/a/status/1"]);
});

test("the embed loader caches each link, shares requests in flight and limits concurrency", async () => {
    const fake = unfurler();
    fake.hold();
    const load = createEmbedLoader(fake.client, 2);

    const first = load("https://a.example/1");
    assert.equal(load("https://a.example/1"), first);
    const others = [load("https://a.example/2"), load("https://a.example/3")];
    await settle();
    assert.deepEqual(fake.requests, ["https://a.example/1", "https://a.example/2"]);

    fake.releaseOne();
    await settle();
    assert.deepEqual(fake.requests, ["https://a.example/1", "https://a.example/2", "https://a.example/3"]);
    fake.releaseOne();
    fake.releaseOne();
    await Promise.all([first, ...others]);

    assert.deepEqual(await load("https://a.example/1"), [{ url: "https://a.example/1", title: "fixed" }]);
    assert.equal(fake.requests.length, 3);
});

test("a failed request resolves to no embed", async () => {
    const load = createEmbedLoader({ post: () => Promise.reject(new Error("429")) });
    assert.equal(await load("https://a.example/1"), null);
});

test("a rate-limited request waits as Discord asks and tries again", async () => {
    let calls = 0;
    const load = createEmbedLoader({
        post() {
            calls++;
            return calls === 1
                ? Promise.reject({ status: 429, body: { retry_after: 0 } })
                : Promise.resolve({ body: { embeds: [{ url: "https://a.example/1" }] } });
        }
    });
    assert.deepEqual(await load("https://a.example/1"), [{ url: "https://a.example/1" }]);
    assert.equal(calls, 2);
});
