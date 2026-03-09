import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import {InternalLogger} from "../../src/LogConfig.ts";
import { readFile } from "node:fs/promises";
import {join} from "node:path";


export default function (pi: ExtensionAPI) {
    let logger = new InternalLogger(__filename)
    pi.on("before_agent_start", async (event, ctx) => {
        logger.info("Injecting into context");
        const contextPath = join(ctx.cwd, "OWNER.md");
        const contextContent = await readFile(contextPath, "utf-8");
        return {
            message: {
                customType: "OwnerContextInformation",
                content: contextContent,
                display: true
            },
        };
    });
}
