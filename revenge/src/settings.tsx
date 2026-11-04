import { ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";

import { CUSTOM_DOMAIN_VALUE, type Platform, PLATFORM_IDS, PLATFORMS } from "../../common/embedUrls";
import { pluginStorage, type SocialEmbedFixerStorage } from "./state";

const { FormInput, FormRadioRow, FormSection, FormSwitchRow } = Forms;

const STORAGE_KEYS: Record<Platform, { domain: keyof SocialEmbedFixerStorage; custom: keyof SocialEmbedFixerStorage; }> = {
    x: { domain: "xDomain", custom: "xCustomDomain" },
    instagram: { domain: "instagramDomain", custom: "instagramCustomDomain" }
};

function ServiceSection({ platform }: { platform: Platform; }) {
    const { label, services } = PLATFORMS[platform];
    const keys = STORAGE_KEYS[platform];
    const storage = pluginStorage as unknown as Record<string, string>;

    return (
        <FormSection title={`${label} embed service`}>
            {services.map(service => (
                <FormRadioRow
                    key={service.value}
                    label={service.label}
                    selected={storage[keys.domain] === service.value}
                    onPress={() => { storage[keys.domain] = service.value; }}
                />
            ))}
            <FormRadioRow
                label="Custom domain"
                selected={storage[keys.domain] === CUSTOM_DOMAIN_VALUE}
                onPress={() => { storage[keys.domain] = CUSTOM_DOMAIN_VALUE; }}
            />
            <Forms.FormRow label="Custom hostname" />
            <FormInput
                title=""
                placeholder="example.com"
                value={storage[keys.custom]}
                onChange={(value: string) => { storage[keys.custom] = value; }}
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
                    onValueChange={(value: boolean) => { pluginStorage.convertMessagesISend = value; }}
                />
                <FormSwitchRow
                    label="Convert Already Sent Messages"
                    subLabel="Locally converts links only; existing embeds stay unchanged and no message is sent"
                    value={pluginStorage.convertAlreadySentMessages}
                    onValueChange={(value: boolean) => { pluginStorage.convertAlreadySentMessages = value; }}
                />
                <FormSwitchRow
                    label="Convert Other Service Domains"
                    subLabel="Convert links using another known embed service to the service selected for that platform"
                    value={pluginStorage.convertOtherServiceDomains}
                    onValueChange={(value: boolean) => { pluginStorage.convertOtherServiceDomains = value; }}
                />
            </FormSection>
            {PLATFORM_IDS.map(platform => <ServiceSection key={platform} platform={platform} />)}
        </RN.ScrollView>
    );
}

export default function Settings() {
    return <SettingsContent />;
}
