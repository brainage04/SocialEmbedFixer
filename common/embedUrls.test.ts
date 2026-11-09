/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test from "node:test";

import { convertUrls, type EmbedDomains, isSameLink, normalizeEmbedDomain, resolveEmbedDomain } from "./embedUrls";

const domains: EmbedDomains = { x: "fixvx.com", instagram: "vxinstagram.com" };

test("rewrites X and Twitter links while preserving path, query, and punctuation", () => {
    const result = convertUrls(
        "See https://x.com/example/status/123?s=20, then https://twitter.com/example/status/456.",
        domains
    );

    assert.equal(
        result.content,
        "See https://fixvx.com/example/status/123?s=20, then https://fixvx.com/example/status/456."
    );
    assert.deepEqual(result.conversions, [
        { from: "https://x.com/example/status/123?s=20", to: "https://fixvx.com/example/status/123?s=20" },
        { from: "https://twitter.com/example/status/456", to: "https://fixvx.com/example/status/456" }
    ]);
});

test("rewrites X status links, including their photo, video and web-client forms", () => {
    const input = [
        "https://x.com/example/status/123/photo/1",
        "https://x.com/example/status/123/video/1?s=20",
        "https://x.com/i/web/status/123",
        "https://x.com/i/status/123"
    ].join(" ");

    assert.equal(convertUrls(input, domains).content, [
        "https://fixvx.com/example/status/123/photo/1",
        "https://fixvx.com/example/status/123/video/1?s=20",
        "https://fixvx.com/i/web/status/123",
        "https://fixvx.com/i/status/123"
    ].join(" "));
});

test("leaves X profile, home, search and other non-status pages unchanged", () => {
    const input = [
        "https://x.com/jack",
        "https://x.com/jack/with_replies",
        "https://twitter.com/home",
        "https://x.com/",
        "https://x.com",
        "https://x.com/search?q=discord",
        "https://x.com/i/bookmarks",
        "https://x.com/jack/status/",
        "https://fxtwitter.com/jack"
    ].join(" ");
    assert.deepEqual(convertUrls(input, domains, true), { content: input, conversions: [] });
});

test("keeps a link in inline code and text right after a link exactly as typed", () => {
    const cases: [string, string][] = [
        ["look `https://x.com/a/status/1` here", "look `https://fixvx.com/a/status/1` here"],
        ["`https://instagram.com/p/ABC`", "`https://vxinstagram.com/p/ABC`"],
        ["https://x.com/a/status/1です", "https://fixvx.com/a/status/1です"],
        ["https://x.com/a/status/1😀", "https://fixvx.com/a/status/1😀"],
        ["https://x.com/a/status/1、next", "https://fixvx.com/a/status/1、next"],
        ["https://x.com/a/status/1?text=日本%20語#frag", "https://fixvx.com/a/status/1?text=日本%20語#frag"],
        ["https://www.instagram.com/tv/A1/です", "https://vxinstagram.com/p/A1/です"]
    ];
    for (const [input, expected] of cases) assert.equal(convertUrls(input, domains).content, expected);
});

test("drops a port along with the host", () => {
    const result = convertUrls("https://x.com:8443/a/status/1 http://instagram.com:80/reel/A1/", domains);
    assert.equal(result.content, "https://fixvx.com/a/status/1 http://vxinstagram.com/reel/A1/");
    assert.deepEqual(result.conversions, [
        { from: "https://x.com:8443/a/status/1", to: "https://fixvx.com/a/status/1" },
        { from: "http://instagram.com:80/reel/A1/", to: "http://vxinstagram.com/reel/A1/" }
    ]);
});

test("rewrites Instagram post, reel and TV links on every Instagram host to the Instagram service", () => {
    const input = [
        "https://www.instagram.com/p/DcpM33KtEqZ/",
        "https://instagram.com/reel/Dct2UGbBBTn/?igsh=abc",
        "https://m.instagram.com/reels/Dct2UGbBBTn",
        "https://www.instagram.com/nasa/p/DcpM33KtEqZ/",
        "(https://www.instagram.com/tv/Dct2UGbBBTn/)"
    ].join(" ");

    assert.equal(convertUrls(input, domains).content, [
        "https://vxinstagram.com/p/DcpM33KtEqZ/",
        "https://vxinstagram.com/reel/Dct2UGbBBTn/?igsh=abc",
        "https://vxinstagram.com/reels/Dct2UGbBBTn",
        "https://vxinstagram.com/nasa/p/DcpM33KtEqZ/",
        "(https://vxinstagram.com/p/Dct2UGbBBTn/)"
    ].join(" "));
});

test("leaves Instagram profile, share and other non-post pages unchanged", () => {
    const input = [
        "https://www.instagram.com/nasa/",
        "https://www.instagram.com/explore/tags/space/",
        "https://www.instagram.com/share/reel/BAabc123/",
        "https://www.instagram.com/"
    ].join(" ");
    assert.deepEqual(convertUrls(input, domains), { content: input, conversions: [] });
});

test("converts each platform to its own service in one message", () => {
    const input = "https://x.com/a/status/1 https://www.instagram.com/p/B1/";
    assert.equal(
        convertUrls(input, { x: "fixupx.com", instagram: "oginstagram.com" }).content,
        "https://fixupx.com/a/status/1 https://oginstagram.com/p/B1/"
    );
});

test("leaves unrelated and already-fixed links unchanged", () => {
    const input = "https://example.com/status/1 https://fixvx.com/example/status/2 https://vxinstagram.com/p/B1/";
    assert.deepEqual(convertUrls(input, domains), { content: input, conversions: [] });
});

test("rewrites other embed-service domains of the same platform only when enabled", () => {
    const input = [
        "https://fxtwitter.com/example/status/1",
        "https://vxtwitter.com/example/status/2",
        "https://www.ddinstagram.com/reel/A1/",
        "https://kkinstagram.com/p/B2/"
    ].join(" ");
    const expected = [
        "https://fixvx.com/example/status/1",
        "https://fixvx.com/example/status/2",
        "https://vxinstagram.com/reel/A1/",
        "https://vxinstagram.com/p/B2/"
    ].join(" ");

    assert.equal(convertUrls(input, domains, true).content, expected);
    assert.equal(convertUrls(input, domains, false).content, input);
});

test("normalizes safe custom domains per platform and falls back for invalid values", () => {
    assert.equal(normalizeEmbedDomain("x", "https://Embeds.Example.com/"), "embeds.example.com");
    assert.equal(normalizeEmbedDomain("x", "x.com"), null);
    assert.equal(normalizeEmbedDomain("instagram", "www.instagram.com"), null);
    assert.equal(normalizeEmbedDomain("instagram", "example.com/path"), null);
    assert.equal(resolveEmbedDomain("x", "custom", "not a domain"), "fixupx.com");
    assert.equal(resolveEmbedDomain("instagram", "custom", "instagram.com"), "vxinstagram.com");
    assert.equal(resolveEmbedDomain("instagram", "custom", "my-fixer.example"), "my-fixer.example");
});

test("an invalid configured domain falls back to the platform default instead of breaking links", () => {
    assert.equal(
        convertUrls("https://www.instagram.com/p/B1/", { x: "fixupx.com", instagram: "instagram.com" }).content,
        "https://vxinstagram.com/p/B1/"
    );
});

test("matches links to the same post across hosts of one platform", () => {
    assert.ok(isSameLink("https://vxtwitter.com/Example/status/1", "https://fixvx.com/example/status/1?s=20"));
    assert.ok(isSameLink("https://www.instagram.com/tv/A1/", "https://oginstagram.com/p/A1"));
    assert.ok(!isSameLink("https://x.com/example/status/1", "https://x.com/example/status/2"));
    assert.ok(!isSameLink("https://x.com/p/A1", "https://instagram.com/p/A1"));
    assert.ok(!isSameLink("https://youtube.com/watch", "https://youtube.com/watch"));
});
