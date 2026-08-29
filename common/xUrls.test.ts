/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test from "node:test";

import { convertXUrls, normalizeEmbedDomain, resolveEmbedDomain, uniqueConvertedUrls } from "./xUrls";

test("rewrites X and Twitter links while preserving path, query, and punctuation", () => {
    const result = convertXUrls(
        "See https://x.com/example/status/123?s=20, then https://twitter.com/example/status/456.",
        "fixvx.com"
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

test("leaves non-source and already-fixed links unchanged", () => {
    const input = "https://example.com/status/1 https://fixupx.com/example/status/2";
    assert.deepEqual(convertXUrls(input, "vxtwitter.com"), { content: input, convertedUrls: [] });
});

test("rewrites other embed-service domains only when enabled", () => {
    const input = [
        "https://fxtwitter.com/example/status/1",
        "https://fixvx.com/example/status/2",
        "https://vxtwitter.com/example/status/3",
        "https://fixupx.com/example/status/4"
    ].join(" ");
    const expected = [
        "https://fixupx.com/example/status/1",
        "https://fixupx.com/example/status/2",
        "https://fixupx.com/example/status/3",
        "https://fixupx.com/example/status/4"
    ].join(" ");

    assert.equal(convertXUrls(input, "fixupx.com", true).content, expected);
    assert.equal(convertXUrls(input, "fixupx.com", false).content, input);
});

test("normalizes safe custom domains and falls back for invalid values", () => {
    assert.equal(normalizeEmbedDomain("https://Embeds.Example.com/"), "embeds.example.com");
    assert.equal(normalizeEmbedDomain("x.com"), null);
    assert.equal(normalizeEmbedDomain("example.com/path"), null);
    assert.equal(resolveEmbedDomain("custom", "not a domain"), "fixupx.com");
});

test("deduplicates links used by automatic replies", () => {
    const content = "https://x.com/a/status/1 and https://x.com/a/status/1";
    assert.deepEqual(uniqueConvertedUrls(content, "fxtwitter.com"), ["https://fxtwitter.com/a/status/1"]);
});
