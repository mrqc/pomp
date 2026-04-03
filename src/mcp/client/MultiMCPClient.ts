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
    public rootPath: string = "";

    constructor() {
        const configPath = path.resolve(process.cwd(), "conf", "mcp-server.json");
        if (fs.existsSync(configPath)) {
            this.logger.info(`Loading MCP server configuration from ${configPath}`);
            const fileContent = fs.readFileSync(configPath, "utf8");
            const data = JSON.parse(fileContent);
            if (data.mcpServers) {
                for (const [name, config] of Object.entries(data.mcpServers)) {
                    const serverConfig = config as any;
                    this.configs.push({
                        name,
                        ...serverConfig
                    });
                }
                this.logger.info(`Loaded ${this.configs.length} MCP server configurations`);
            }
        } else {
            this.logger.info(`MCP server configuration not found at ${configPath}`);
        }
    }

    async connectAll() {
        this.logger.info(`Connecting to ${this.configs.length} MCP servers...`);
        for (const config of this.configs) {
            this.logger.info(`Trying MCP server: ${config.name}`);
            try {
                this.logger.info("CWD: " + this.rootPath);
                const transport = new StdioClientTransport({
                    ...config,
                    cwd: this.rootPath,
                });
                transport.onerror = (error) => {
                    this.logger.error(`Transport error for MCP server ${config.name}: ${error}`);
                };

                this.logger.info(`Building client for MCP server: ${config.name}`);

                const client = new Client(
                    { name: `client-for-${config.name}`, version: "1.0.0" }
                );
                this.logger.info(`Connecting client to MCP server: ${config.name}`);

                await client.connect(transport);
                this.logger.info(`Connected to MCP server: ${config.name}`);
                this.sessions.set(config.name, client);
                this.logger.info(`Successfully connected to MCP server: ${config.name}`);
            } catch (error) {
                this.logger.error(`Failed to connect to MCP server ${config.name}: ${error}`);
            }
        }
    }

    async getAllTools() {
        const allTools = [];
        for (const [name, session] of this.sessions) {
            try {
                const response = await session.listTools();
                // Prefix tool names to prevent collisions between servers
                const tools = response.tools.map(tool => ({
                    ...tool,
                    name: `${name}_${tool.name}`
                }));
                this.logger.info(`Retrieved ${tools.length} tools from MCP server: ${name}: ${JSON.stringify(tools)}`);
                allTools.push(...tools);
            } catch (error) {
                this.logger.error(`Failed to list tools for MCP server ${name}: ${error}`);
            }
        }
        this.logger.info(`Total MCP tools available: ${allTools.length}: ${JSON.stringify(allTools)}`);
        return allTools;
    }
 
    async callTool(prefixedName: string, input: any) {
        this.logger.info("prefixedName: " + prefixedName + " " + JSON.stringify(input));
        const [serverName, ...toolNameParts] = prefixedName.split("_");
        const toolName = toolNameParts.join("_");
        if (serverName == undefined) {
            this.logger.error(`Tool call failed: Server name not found in ${prefixedName}`);
            throw new Error(`Server ${serverName} not found`);
        }
        const session = this.sessions.get(serverName);
        if (!session) {
            this.logger.error(`Tool call failed: Session for server ${serverName} not created`);
            throw new Error(`Session for ${serverName} not created`);
        }
        
        this.logger.info(`Calling tool ${toolName} on MCP server ${serverName} with args: ${JSON.stringify(input)}`);
        try {
            const result = await session.callTool(
                { 
                    name: toolName, 
                    arguments: input
                },
                undefined);
            this.logger.info(`Tool ${toolName} on server ${serverName} executed successfully`);
            return result;
        } catch (error) {
            this.logger.error(`Error calling tool ${toolName} on server ${serverName}: ${error}`);
            throw error;
        }
    }

    async shutdown() {
        this.logger.info(`Shutting down MultiMCPClient, closing ${this.sessions.size} sessions...`);
        for (const [name, session] of this.sessions) {
            try {
                await session.close();
                this.logger.info(`Closed connection to MCP server: ${name}`);
            } catch (error) {
                this.logger.error(`Error closing connection to MCP server ${name}: ${error}`);
            }
        }
    }

    static getInstance() {
        if (!(globalThis as any).multiMcpClientInstance) {
            (globalThis as any).multiMcpClientInstance = new MultiMCPClient();
        }
        return (globalThis as any).multiMcpClientInstance;
    }
}

export const multiMcpClient = MultiMCPClient.getInstance();
