import type {Intention} from './Intention.ts'
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {TextContent} from "@mariozechner/pi-ai/dist/types";
import {InternalLogger} from "../LogConfig.ts";
import {fileURLToPath} from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IntentionContext {
    speakIntention: Intention,
    contentIntention: Intention,
    waitIntention: Intention,
    goIntention: Intention,
    text: string
}

export class IntentionContextService {
    private logger = new InternalLogger(__filename);

    public getIntentionContext(messages: AgentMessage[]): IntentionContext {
        let overallResponseContent = this.extractTextFromResponse(messages);
        let intentions = this.getIntentions(overallResponseContent);
        let speakIntention = this.getIntentionContent(intentions, "SPEAK")
        let contentIntention = this.getIntentionContent(intentions, "CONTENT")
        let waitIntention = this.getIntentionContent(intentions, "WAIT")
        let goIntention = this.getIntentionContent(intentions, "GO")
        overallResponseContent = this.removeIntentionContents(overallResponseContent);
        return {
            speakIntention: speakIntention,
            contentIntention: contentIntention,
            waitIntention: waitIntention,
            goIntention: goIntention,
            text: overallResponseContent
        }
    }

    private extractTextFromResponse(messages: AgentMessage[]) {
        var textToSay: string = "";
        for (let message of messages) {
            this.logger.info("Message: " + JSON.stringify(message))
            if ("content" in message && Array.isArray(message.content)) {
                let contents = message.content.filter((content: { type: string; }) => content.type == "text");
                for (let content of contents) {
                    textToSay += (content as TextContent).text + " ";
                }
            }
        }
        return textToSay;
    }
    
    private getIntentions(content: string): Intention[] {
        const regex = /\[([a-zA-Z0-9_-]+)]([\s\S]*?)\[\/\1]/g;

        return Array.from(content.matchAll(regex), match => ({
            tagName: match[1],
            text: match[2]
        } as Intention));
    }


    private getIntentionContent(intentions: Intention[], intentionName: string): Intention {
        let intention = intentions.filter((anIntention) => anIntention.tagName == intentionName)[0];
        if (intention == undefined) {
            return {
                tagName: intentionName,
                text: ""
            }
        }
        return intention
    }

    private removeIntentionContents(textToSay: string) {
        return textToSay.replace(/\[([a-zA-Z0-9_-]+)]([\s\S]*?)\[\/\1]/g, "");
    }
}
