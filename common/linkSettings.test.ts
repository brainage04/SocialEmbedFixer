/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createDisplayedSettings, type LinkSettingValues } from "./linkSettings";

function setup(t: TestContext) {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const values: LinkSettingValues = {
        convertAlreadySentMessages: true,
        convertOtherServiceDomains: true,
        xDomain: "fixupx.com",
        xCustomDomain: "",
        instagramDomain: "vxinstagram.com",
        instagramCustomDomain: ""
    };
    let applied = 0;
    const settings = createDisplayedSettings(() => values, () => applied++);
    /** Changes one setting the way a settings screen does, telling the debouncer each time. */
    function set<K extends keyof LinkSettingValues>(key: K, value: LinkSettingValues[K]) {
        values[key] = value;
        settings.changed();
    }
    return { settings, set, applied: () => applied, tick: (ms: number) => t.mock.timers.tick(ms) };
}

test("applies settings changes once, 1 s after the last change", t => {
    const { settings, set, applied, tick } = setup(t);

    set("xDomain", "fxtwitter.com");
    tick(900);
    set("convertOtherServiceDomains", false);
    tick(999);
    assert.equal(applied(), 0);
    assert.equal(settings.current().domains.x, "fixupx.com");

    tick(1);
    assert.equal(applied(), 1);
    assert.equal(settings.current().domains.x, "fxtwitter.com");
    assert.equal(settings.current().convertOtherServiceDomains, false);
});

test("takes over a custom domain only once it is a valid hostname", t => {
    const { settings, set, applied, tick } = setup(t);

    set("xDomain", "custom");
    for (const typed of ["e", "em", "embeds", "embeds."]) {
        set("xCustomDomain", typed);
        tick(1000);
    }
    assert.equal(applied(), 0);
    assert.equal(settings.current().domains.x, "fixupx.com");

    set("xCustomDomain", "embeds.example.com");
    tick(1000);
    assert.equal(applied(), 1);
    assert.equal(settings.current().domains.x, "embeds.example.com");
});

test("does nothing when a change leaves the converted links the same", t => {
    const { set, applied, tick } = setup(t);

    // The custom hostname is not used while a listed service is selected.
    set("xCustomDomain", "embeds.example.com");
    tick(1000);
    set("xDomain", "fxtwitter.com");
    set("xDomain", "fixupx.com");
    tick(1000);
    assert.equal(applied(), 0);
});

test("stop drops a pending change", t => {
    const { settings, set, applied, tick } = setup(t);
    set("convertAlreadySentMessages", false);
    settings.stop();
    tick(5000);
    assert.equal(applied(), 0);
});
