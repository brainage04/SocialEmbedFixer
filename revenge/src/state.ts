import { storage } from "@vendetta/plugin";

import { defaultEmbedDomain } from "../../common/embedUrls";

export interface SocialEmbedFixerStorage {
    convertAlreadySentMessages: boolean;
    convertMessagesISend: boolean;
    convertOtherServiceDomains: boolean;
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
