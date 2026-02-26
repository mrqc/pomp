import {InternalLogger} from "./LogConfig.ts";
import fs from "fs-extra";
import path from "node:path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Tools {
    private static readonly PHOTOS_DIR = path.resolve(__dirname, '..', 'assets', 'photos');
    public static cleanup() {
        if ( !InternalLogger.isDebug()) {
            fs.removeSync(Tools.PHOTOS_DIR);
        }
    }
}
