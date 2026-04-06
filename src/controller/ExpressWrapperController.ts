import express, {type Request, type Response} from "express";
import {InternalLogger} from "../LogConfig.ts";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {Configuration} from "../Configuration.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ExpressWrapperController {
    private port = 4000;
    private readonly app = express();
    private readonly logger = new InternalLogger(__filename);
    private readonly configuration: Configuration;

    constructor(configuration: Configuration) {
        this.configuration = configuration;
    }

    init() {
        this.port = this.configuration.getConfig("web-port");
        this.app.use(express.static(path.join(process.cwd(), 'frontend/public')));

        this.app.get('/', async (req: Request, res: Response) => {
            res.json({
                status: 'ok',
            });
        });

        const server = this.app.listen(this.port, () => {
            this.logger.info(`Server is running at http://localhost:${(this.port)}`);
        });

        server.on('error', (err) => {
            this.logger.info(`Server failed to start: ${err}`);
        });
    }
}
