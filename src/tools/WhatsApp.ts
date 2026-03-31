import fs from "fs-extra";
import path from "node:path";
import {InternalLogger} from "../LogConfig.ts";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const logger = new InternalLogger(__filename);

const args = process.argv.slice(2);

if (args.length < 2) {
    logger.info("Usage: npx tsx src/tools/WhatsApp.ts <retrieve|write> <contact> [message]");
    process.exit(1);
}

const action = args[0];
const contact = args[1];

async function run() {
    if (action === 'retrieve') {
        logger.info(`Retrieving messages for ${contact}...`);
        // Mock retrieving messages
        const messages = [
            { from: contact, text: "Hey, are we still meeting today?", timestamp: Date.now() - 3600000 },
            { from: "me", text: "Yes, at 5 PM!", timestamp: Date.now() - 3500000 },
            { from: contact, text: "Great, see you then!", timestamp: Date.now() - 3400000 }
        ];
        console.log(JSON.stringify(messages, null, 2));
    } else if (action === 'write') {
        const message = args.slice(2).join(' ');
        if (!message) {
            logger.error("Message content is required for 'write' action.");
            process.exit(1);
        }
        logger.info(`Sending message to ${contact}: ${message}`);
        // Mock writing message
        console.log(`Successfully sent message to ${contact}`);
    } else {
        logger.error(`Unknown action: ${action}`);
        process.exit(1);
    }
}

run().catch(err => {
    logger.error(err);
    process.exit(1);
});
