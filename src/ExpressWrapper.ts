import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import express, {type Request, type Response} from "express";
import {InternalLogger} from "./LogConfig.ts";
import {fileURLToPath} from "url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ExpressWrapper {
    private port = 4000;
    private app = express();
    private logger = new InternalLogger(__filename);
    
    init() {
        this.app.use(express.static(path.join(process.cwd(), 'frontend/public')));

        this.app.get('/', async (req: Request, res: Response) => {
            res.json({
                status: 'ok',
            });
        });
        
        const server = this.app.listen(this.port, () => {
            console.info(`Server is running at http://localhost:${(this.port)}`);
        });

        server.on('error', (err) => {
            console.error('Server failed to start:', err);
        });
    }
}
