import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import {InternalLogger} from "../../src/LogConfig.ts";

export default function (pi: ExtensionAPI) {
    let logger = new InternalLogger(__filename)
    pi.on("tool_call", async (event, ctx) => {
        logger.info("Trying to call bash tool")
        /*if (event.type == "tool_execution_start") {
            this.textToSpeech.say("Calling tool " + event.toolName + ".")
        } else if (event.type == "tool_execution_end") {

        }*/
        return { block: false, reason: "Blocked by user" };
        /*
        if (isToolCallEventType("bash", event)) {
            const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
            if (!ok) return { block: true, reason: "Blocked by user" };
            logger.info(`Bash tool executing: ${event.input.command}`);
        }*/
    });
}
