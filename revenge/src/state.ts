/*
 * SocialEmbedFixer
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { storage } from "@vendetta/plugin";

import { defaultEmbedDomain } from "../../common/embedUrls";
import type { LinkSettingValues } from "../../common/linkSettings";

export interface SocialEmbedFixerStorage extends LinkSettingValues {
    convertMessagesISend: boolean;
    xDomain: string;
    xCustomDomain: string;
    instagramDomain: string;
    instagramCustomDomain: string;
}

export const pluginStorage = storage as SocialEmbedFixerStorage;

export function initializeStorage() {
    pluginStorage.convertMessagesISend ??= true;
    pluginStorage.convertAlreadySentMessages ??= true;
    pluginStorage.convertOtherServiceDomains ??= true;
    pluginStorage.xDomain ??= defaultEmbedDomain("x");
    pluginStorage.xCustomDomain ??= "";
    pluginStorage.instagramDomain ??= defaultEmbedDomain("instagram");
    pluginStorage.instagramCustomDomain ??= "";
}

let settingsChanged: (() => void) | undefined;

export function onSettingsChanged(listener: (() => void) | undefined) {
    settingsChanged = listener;
}

export function setSetting<K extends keyof SocialEmbedFixerStorage>(key: K, value: SocialEmbedFixerStorage[K]) {
    pluginStorage[key] = value;
    settingsChanged?.();
}
