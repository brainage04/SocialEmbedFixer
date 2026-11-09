/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 brainage04
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

import { vencordPlugin } from "./vencord";

export default definePlugin({
    name: "SocialEmbedFixer",
    ...vencordPlugin
});
