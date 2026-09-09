/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface MessageRequest {
    url: string;
    body?: Record<string, unknown>;
}

export interface MessageRestClient {
    post(request: MessageRequest, ...args: unknown[]): unknown;
    patch(request: MessageRequest, ...args: unknown[]): unknown;
}

/** Convert the actual wire payload, not a composer object or locally displayed message. */
export function patchMessageRequests(client: MessageRestClient, convert: (content: string) => string): () => void {
    let active = true;
    const unpatches = (["post", "patch"] as const).map(method => {
        const original = client[method];
        const endpoint = method === "post"
            ? /^\/channels\/\d+\/messages$/
            : /^\/channels\/\d+\/messages\/\d+$/;
        const wrapped: typeof original = function (this: unknown, request, ...args) {
            if (active && endpoint.test(request.url) && typeof request.body?.content === "string") {
                const content = convert(request.body.content);
                if (content !== request.body.content)
                    request = { ...request, body: { ...request.body, content } };
            }
            return original.call(this, request, ...args);
        };
        client[method] = wrapped;
        return () => {
            // Do not remove another plugin's wrapper if it was installed after ours.
            if (client[method] === wrapped) client[method] = original;
        };
    });
    return () => {
        active = false;
        for (const unpatch of unpatches) unpatch();
    };
}
