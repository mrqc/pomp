import {fileURLToPath} from "url";
import path from "path";
import yaml from "yaml";
import fs from "fs";
import {InternalLogger} from "./LogConfig.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Configuration {
    private static readonly CONFIG_FILE = path.resolve(__dirname, '..', 'conf', 'pomp.yml');
    private logger = new InternalLogger(__filename);
    private config: any;

    constructor() {
        const fileContent = fs.readFileSync(Configuration.CONFIG_FILE, 'utf8');
        this.config = yaml.parse(fileContent);
        this.logger.info(this.config);
    }
    
    getConfig(configName: string): any {
        return this.config[configName];
    }
}
