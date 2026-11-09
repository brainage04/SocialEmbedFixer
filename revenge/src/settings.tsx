/*
 * SocialEmbedFixer
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";

import { CUSTOM_DOMAIN_VALUE, type Platform, PLATFORM_IDS, PLATFORMS } from "../../common/embedUrls";
import { MAX_LINKS_PER_CHANNEL } from "../../common/sentMessages";
import { pluginStorage, setSetting, type SocialEmbedFixerStorage } from "./state";

const { FormInput, FormRadioRow, FormSection, FormSwitchRow } = Forms;

type StringSetting = { [K in keyof SocialEmbedFixerStorage]: SocialEmbedFixerStorage[K] extends string ? K : never }[keyof SocialEmbedFixerStorage];

const STORAGE_KEYS: Record<Platform, { domain: StringSetting; custom: StringSetting; }> = {
    x: { domain: "xDomain", custom: "xCustomDomain" },
    instagram: { domain: "instagramDomain", custom: "instagramCustomDomain" }
};

function ServiceSection({ platform }: { platform: Platform; }) {
    const { label, services } = PLATFORMS[platform];
    const keys = STORAGE_KEYS[platform];

    return (
        <FormSection title={`${label} embed service`}>
            {services.map(service => (
                <FormRadioRow
                    key={service.value}
                    label={service.label}
                    selected={pluginStorage[keys.domain] === service.value}
                    onPress={() => setSetting(keys.domain, service.value)}
                />
            ))}
            <FormRadioRow
                label="Custom domain"
                selected={pluginStorage[keys.domain] === CUSTOM_DOMAIN_VALUE}
                onPress={() => setSetting(keys.domain, CUSTOM_DOMAIN_VALUE)}
            />
            <Forms.FormRow label="Custom hostname" />
            <FormInput
                title=""
                placeholder="example.com"
                value={pluginStorage[keys.custom]}
                onChange={(value: string) => setSetting(keys.custom, value)}
                style={{ marginTop: -25, marginHorizontal: 12 }}
            />
        </FormSection>
    );
}

function SettingsContent() {
    useProxy(pluginStorage);

    return (
        <RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }}>
            <FormSection title="Link conversion" titleStyleType="no_border">
                <FormSwitchRow
                    label="Convert Messages I Send"
                    subLabel="Rewrite supported X/Twitter and Instagram links before your messages and edits are sent"
                    value={pluginStorage.convertMessagesISend}
                    onValueChange={(value: boolean) => setSetting("convertMessagesISend", value)}
                />
                <FormSwitchRow
                    label="Convert Already Sent Messages"
                    subLabel={`Show the most recent ${MAX_LINKS_PER_CHANNEL} supported links in the open channel with the selected services, with the embeds Discord makes for them; only changes what you see and posts nothing to the chat, but asks Discord for the embed of each of those links, one at a time`}
                    value={pluginStorage.convertAlreadySentMessages}
                    onValueChange={(value: boolean) => setSetting("convertAlreadySentMessages", value)}
                />
                <FormSwitchRow
                    label="Convert Other Service Domains"
                    subLabel="Convert links using another known embed service to the service selected for that platform"
                    value={pluginStorage.convertOtherServiceDomains}
                    onValueChange={(value: boolean) => setSetting("convertOtherServiceDomains", value)}
                />
            </FormSection>
            {PLATFORM_IDS.map(platform => <ServiceSection key={platform} platform={platform} />)}
        </RN.ScrollView>
    );
}

export default function Settings() {
    return <SettingsContent />;
}
