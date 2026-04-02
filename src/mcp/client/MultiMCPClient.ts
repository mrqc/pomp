import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "fs";
import * as path from "path";
import { InternalLogger } from "../../LogConfig.ts";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

interface ServerConfig {
    name: string;
    command: string;
    args: string[];
    description: string;
}

export class MultiMCPClient {
    private readonly sessions: Map<string, Client> = new Map();
    private readonly configs: ServerConfig[] = [];
    private readonly logger = new InternalLogger(__filename);
    private static instance: MultiMCPClient;

    constructor() {
        const configPath = path.resolve(process.cwd(), "conf", "mcp-server.json");
        if (fs.existsSync(configPath)) {
            const fileContent = fs.readFileSync(configPath, "utf8");
            const data = JSON.parse(fileContent);
            if (data.mcpServers) {
                for (const [name, config] of Object.entries(data.mcpServers)) {
                    const serverConfig = config as any;
                    this.configs.push({
                        name: name,
                        command: serverConfig.command,
                        args: serverConfig.args,
                        description: serverConfig.description,
                    });
                }
            }
        }
    }

    async connectAll() {
        for (const config of this.configs) {
            try {
                const transport = new StdioClientTransport({
                    command: config.command,
                    args: config.args,
                });

                const client = new Client(
                    { name: `client-for-${config.name}`, version: "1.0.0" },
                    { capabilities: {} }
                );

                await client.connect(transport);
                this.sessions.set(config.name, client);
                this.logger.info(`Connected to ${config.name}`);
            } catch (error) {
                this.logger.error(`Failed to connect to ${config.name}: ${error}`);
            }
        }
    }

    async getAllTools() {
        const allTools = [];
        for (const [name, session] of this.sessions) {
            const response = await session.listTools();
            // Prefix tool names to prevent collisions between servers
            const tools = response.tools.map(tool => ({
                ...tool,
                name: `${name}_${tool.name}`
            }));
            allTools.push(...tools);
        }
        return allTools;
    }

    async callTool(prefixedName: string, args: any) {
        const [serverName, ...toolNameParts] = prefixedName.split("_");
        const toolName = toolNameParts.join("_");
        if (serverName == undefined) {
            throw new Error(`Server ${serverName} not found`);
        }
        const session = this.sessions.get(serverName);
        if (!session) {
            throw new Error(`Session for ${serverName} not created`);
        }
        return await session.callTool({ name: toolName, arguments: args });
    }

    async shutdown() {
        for (const [name, session] of this.sessions) {
            await session.close();
            console.log(`Closed connection to ${name}`);
        }
    }

    static getInstance() {
        if (!MultiMCPClient.instance) {
            MultiMCPClient.instance = new MultiMCPClient();
        }
        return MultiMCPClient.instance;
    }
}
