/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test from "node:test";

import { convertUrls, type EmbedDomains, normalizeEmbedDomain, resolveEmbedDomain } from "./embedUrls";

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
    assert.deepEqual(result.convertedUrls, [
        "https://fixvx.com/example/status/123?s=20",
        "https://fixvx.com/example/status/456"
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
        "(https://vxinstagram.com/tv/Dct2UGbBBTn/)"
    ].join(" "));
});

test("leaves Instagram profile and non-post pages unchanged", () => {
    const input = "https://www.instagram.com/nasa/ https://www.instagram.com/explore/tags/space/ https://www.instagram.com/";
    assert.deepEqual(convertUrls(input, domains), { content: input, convertedUrls: [] });
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
    assert.deepEqual(convertUrls(input, domains), { content: input, convertedUrls: [] });
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
