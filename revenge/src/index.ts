import { findByProps } from "@vendetta/metro";
import { ReactNative as RN } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

import { convertUrls, resolveEmbedDomain } from "../../common/embedUrls";
import { type MessageRestClient, patchMessageRequests } from "../../common/messageRequests";
import Settings from "./settings";
import { initializeStorage, pluginStorage } from "./state";

interface ContentNode {
    content?: string | ContentNode[];
    items?: ContentNode[];
    target?: string;
    type?: string;
}

interface ChatRow {
    message?: {
        content?: string | ContentNode[];
    };
    type?: number;
}

interface NativeChatManager {
    updateRows(channelId: string, rowsJson: string): void;
}

const NativeChatModule = (
    RN.NativeModules.RTNChatManager
    ?? RN.NativeModules.DCDChatManager
    ?? RN.NativeModules.NativeChatModule
) as NativeChatManager | undefined;

let cleanup: (() => void) | undefined;


function convertContent(content: string) {
    return convertUrls(
        content,
        {
            x: resolveEmbedDomain("x", pluginStorage.xDomain, pluginStorage.xCustomDomain),
            instagram: resolveEmbedDomain("instagram", pluginStorage.instagramDomain, pluginStorage.instagramCustomDomain)
        },
        pluginStorage.convertOtherServiceDomains
    );
}


function rewriteContentNodes(nodes: ContentNode[]) {
    for (const node of nodes) {
        if (node.type === "link" && typeof node.target === "string")
            node.target = convertContent(node.target).content;

        if (typeof node.content === "string")
            node.content = convertContent(node.content).content;
        else if (Array.isArray(node.content))
            rewriteContentNodes(node.content);

        if (Array.isArray(node.items))
            rewriteContentNodes(node.items);
    }
}

function patchDisplayedMessageRows() {
    if (!NativeChatModule?.updateRows)
        throw new Error("SocialEmbedFixer could not locate Revenge's native chat row manager");

    return before("updateRows", NativeChatModule, args => {
        if (!pluginStorage.convertAlreadySentMessages || typeof args[1] !== "string") return;

        const rows = JSON.parse(args[1]) as unknown;
        if (!Array.isArray(rows)) return;

        for (const candidate of rows) {
            if (!candidate || typeof candidate !== "object") continue;
            const row = candidate as ChatRow;
            if (row.type !== 1) continue;

            if (typeof row.message?.content === "string")
                row.message.content = convertContent(row.message.content).content;
            else if (Array.isArray(row.message?.content))
                rewriteContentNodes(row.message.content);
        }

        args[1] = JSON.stringify(rows);
    });
}


function onLoad() {
    initializeStorage();

    const rest = findByProps("get", "post", "put", "patch", "del") as MessageRestClient | undefined;
    if (!rest) throw new Error("SocialEmbedFixer could not locate Discord's REST client");
    const unpatchRows = patchDisplayedMessageRows();
    const unpatchRequests = patchMessageRequests(rest, content =>
        pluginStorage.convertMessagesISend ? convertContent(content).content : content
    );

    cleanup = () => {
        unpatchRequests();
        unpatchRows();
    };
}

function onUnload() {
    cleanup?.();
    cleanup = undefined;
}

export default { onLoad, onUnload, settings: Settings };
