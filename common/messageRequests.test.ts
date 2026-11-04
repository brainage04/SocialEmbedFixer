/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test from "node:test";

import { convertUrls } from "./embedUrls";
import { type MessageRestClient, patchMessageRequests } from "./messageRequests";

const source = "https://x.com/example/status/123";
const fixed = "https://fixupx.com/example/status/123";
const convert = (content: string) => convertUrls(content, { x: "fixupx.com", instagram: "vxinstagram.com" }).content;

function transport() {
    const requests: unknown[] = [];
    const result = Promise.resolve({ status: 200 });
    const client: MessageRestClient = {
        post(request) { requests.push(request); return result; },
        patch(request) { requests.push(request); return result; }
    };
    return { client, requests, result };
}

test("sends and edits the fixed URL in the wire body without mutating cached message content", () => {
    const { client, requests, result } = transport();
    const unpatch = patchMessageRequests(client, convert);
    const body = Object.freeze({ content: source, flags: 0, attachments: [{ id: "0" }] });
    const send = Object.freeze({ url: "/channels/123/messages", body, nonce: "456" });
    assert.equal(client.post(send), result);
    assert.equal(client.patch({ url: "/channels/123/messages/456", body }), result);
    assert.deepEqual(requests, [
        { ...send, body: { ...body, content: fixed } },
        { url: "/channels/123/messages/456", body: { ...body, content: fixed } }
    ]);
    assert.equal(body.content, source);
    unpatch();
});

test("leaves unrelated endpoints, attachment-only messages and disabled conversion alone", () => {
    const { client, requests } = transport();
    let enabled = true;
    const unpatch = patchMessageRequests(client, content => enabled ? convert(content) : content);
    const unrelated = { url: "/channels/123", body: { content: source } };
    const attachments = { url: "/channels/123/messages", body: { attachments: [{ id: "0" }] } };
    client.patch(unrelated);
    client.post(attachments);
    enabled = false;
    const disabled = { url: "/channels/123/messages", body: { content: source } };
    client.post(disabled);
    assert.equal(requests[0], unrelated);
    assert.equal(requests[1], attachments);
    assert.equal(requests[2], disabled);
    unpatch();
});

test("unloading stops rewriting without removing later request interceptors", () => {
    const { client, requests } = transport();
    const originalPatch = client.patch;
    const unpatch = patchMessageRequests(client, convert);
    const patchedPost = client.post;
    let otherCalls = 0;
    client.post = function (request, ...args) {
        otherCalls++;
        return patchedPost.call(this, request, ...args);
    };
    const otherPost = client.post;
    unpatch();
    const request = { url: "/channels/123/messages", body: { content: source } };
    client.post(request);
    assert.equal(requests[0], request);
    assert.equal(otherCalls, 1);
    assert.equal(client.post, otherPost);
    assert.equal(client.patch, originalPatch);
});
