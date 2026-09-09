import { ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";

import { CUSTOM_DOMAIN_VALUE, EMBED_DOMAINS } from "../../common/xUrls";
import { pluginStorage } from "./state";

const { FormInput, FormRadioRow, FormSection, FormSwitchRow } = Forms;

function SettingsContent() {
    useProxy(pluginStorage);

    return (
        <RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }}>
            <FormSection title="Link conversion" titleStyleType="no_border">
                <FormSwitchRow
                    label="Convert Messages I Send"
                    subLabel="Rewrite X/Twitter and supported embed-service links before your messages and edits are sent"
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
                    subLabel="Convert links using another supported embed-service domain to the selected domain"
                    value={pluginStorage.convertOtherServiceDomains}
                    onValueChange={(value: boolean) => { pluginStorage.convertOtherServiceDomains = value; }}
                />
            </FormSection>
            <FormSection title="Embed service">
                {EMBED_DOMAINS.map(domain => (
                    <FormRadioRow
                        key={domain.value}
                        label={domain.label}
                        selected={pluginStorage.domain === domain.value}
                        onPress={() => { pluginStorage.domain = domain.value; }}
                    />
                ))}
                <FormRadioRow
                    label="Custom domain"
                    selected={pluginStorage.domain === CUSTOM_DOMAIN_VALUE}
                    onPress={() => { pluginStorage.domain = CUSTOM_DOMAIN_VALUE; }}
                />
                <Forms.FormRow label="Custom hostname" />
                <FormInput
                    title=""
                    placeholder="example.com"
                    value={pluginStorage.customDomain}
                    onChange={(value: string) => { pluginStorage.customDomain = value; }}
                    style={{ marginTop: -25, marginHorizontal: 12 }}
                />
            </FormSection>
        </RN.ScrollView>
    );
}

export default function Settings() {
    return <SettingsContent />;
}
