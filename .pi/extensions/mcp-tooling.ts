import {type ExtensionAPI, type ExtensionContext} from "@mariozechner/pi-coding-agent";
import {MultiMCPClient, multiMcpClient} from "../../src/mcp/client/MultiMCPClient.ts";
import {type Static, Type} from "@mariozechner/pi-ai";
import {InternalLogger} from "../../src/LogConfig.ts";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);

type MCPToolDetails = { 
    processed: string; 
    timestamp: number 
};
type ContentElement = {
    type: "text";
    text: string;
};

export default async function mcpTooling (pi: ExtensionAPI) {
    let logger = new InternalLogger(__filename)
    await multiMcpClient.connectAll();
    let allTools = await multiMcpClient.getAllTools();
    for (let aTool of allTools) {
        logger.info(`Registering MCP tool: ${aTool.name}`);
        pi.registerTool({
            description: aTool.description ?? "",
            label: aTool.title ?? "",
            name: aTool.name,
            parameters: aTool.inputSchema,
            async execute(
                toolCallId: string,
                params: any,
                signal: AbortSignal | undefined,
                onUpdate: ((partialResult: { content: Array<{ type: "text"; text: string; }>; details: MCPToolDetails; }) => void) | undefined,
                ctx: ExtensionContext
            ): Promise<{ 
                content: ContentElement[]; 
                details: MCPToolDetails;
            }> {
                logger.info(`Calling MCP tool ${aTool.name} (ID: ${toolCallId}) with params: ${JSON.stringify(params)}`);
                if (signal?.aborted) {
                    throw new Error("Operation aborted");
                }
                try {
                    let { content } = await multiMcpClient.callTool(aTool.name, params);
                    let contentToReturn: ContentElement[] = [];
                    for (let aContent of (content as any[])) {
                        contentToReturn.push({
                            text: aContent.text ?? "", 
                            type: "text"
                        })
                    }
                    let details = {
                        processed: toolCallId,
                        timestamp: Date.now()
                    } as MCPToolDetails;
                    logger.info("Content of result: " + JSON.stringify(contentToReturn));
                    logger.info(`MCP tool ${aTool.name} (ID: ${toolCallId}) executed successfully. Returned ${contentToReturn.length} content elements.`);
                    return {
                        content: contentToReturn,
                        details: details
                    };
                } catch (error) {
                    logger.error(`Error executing MCP tool ${aTool.name} (ID: ${toolCallId}): ${error}`);
                    throw error;
                }
            }
        });
    }
}
