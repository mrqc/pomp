import type {Intention} from './Intention.ts'
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {TextContent} from "@mariozechner/pi-ai/dist/types";
import {InternalLogger} from "../LogConfig.ts";
import {fileURLToPath} from "url";
import path from "path";
import {AgentSessionMessageType} from "../controller/AgentsController.ts";
import type {ImageContent} from "@mariozechner/pi-ai";
import type {Image} from "./Image.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IntentionContext {
    speakIntention: Intention,
    contentIntention: Intention,
    waitIntention: Intention,
    goIntention: Intention,
    longTermMemoryIntention: Intention,
    text: string
}

interface ExtractedTextElement {
    type: "text",
    text: string
}

interface ExtractedImageElement {
    type: "image",
    data: string,
    mimeType: string
}

interface ExtractedData {
    elements: (ExtractedTextElement | ExtractedImageElement)[]
}
export class IntentionContextService {
    private readonly logger = new InternalLogger(__filename);

    public getIntentionContext(messages: AgentMessage[]): IntentionContext {
        let overallResponseContent = this.extractTextAndImagesFromResponse(messages);
        let resolvedTextContent = this.resolveImagesToIntentionTags(overallResponseContent);
        this.logger.info("Resolved content: " + resolvedTextContent);
        let intentions = this.getIntentions(resolvedTextContent);
        let speakIntention = this.getIntentionContent(intentions, "SPEAK");
        let contentIntention = this.getIntentionContent(intentions, "CONTENT");
        let waitIntention = this.getIntentionContent(intentions, "WAIT");
        let goIntention = this.getIntentionContent(intentions, "GO");
        let longTermMemoryIntention = this.getIntentionContent(intentions, "LONGTERMMEMORY");
        
        let overallTextResponseContent = this.removeIntentionContents(resolvedTextContent);
        return {
            speakIntention: speakIntention,
            contentIntention: contentIntention,
            waitIntention: waitIntention,
            goIntention: goIntention,
            longTermMemoryIntention: longTermMemoryIntention,
            text: overallTextResponseContent
        }
    }
    
    private resolveImagesToIntentionTags(overallResponseContent: ExtractedData): string {
        const elements = overallResponseContent.elements;
        let imagesToConsolidate = "";

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            this.logger.info("Processing element: " + JSON.stringify(element));
            if (element == undefined) {
                continue;
            }
            if (element.type === "text") {
                if (element.text.includes("[/CONTENT]")) {
                    element.text = element.text.replace("[/CONTENT]", imagesToConsolidate + "[/CONTENT]");
                    imagesToConsolidate = "";
                } else {
                    element.text += imagesToConsolidate;
                }
            } else if (element.type === "image") {
                imagesToConsolidate += `<img src="data:${element.mimeType};base64,${element.data}" />`;
            }
        }

        return elements
            .filter((element) => element.type === "text")
            .map((element) => element.text)
            .join(" ");
    }

    private extractTextAndImagesFromResponse(messages: AgentMessage[]) {
        let contentToReturn: ExtractedData = {
            elements: []
        }
        for (let message of messages) {
            this.logger.info("Message: " + JSON.stringify(message))
            if ("content" in message && Array.isArray(message.content)) {
                let contents = message.content.filter((content: { type: string; }) => 
                    ["text", "image"].includes(content.type)
                );
                for (let aContent of contents) {
                    if (aContent.type == "text") {
                        contentToReturn.elements.push({
                            type: "text",
                            text: aContent.text
                        });
                    } else if (aContent.type == "image") {
                        contentToReturn.elements.push({
                            type: "image",
                            data: aContent.data,
                            mimeType: aContent.mimeType
                        });
                    }
                }
            }
        }
        this.logger.info("Content to return: " + JSON.stringify(contentToReturn));
        return contentToReturn;
    }
    
    private getIntentions(content: string): Intention[] {
        const regex = /\[([a-zA-Z0-9_-]+)]([\s\S]*?)\[\/\1]/g;

        return Array.from(content.matchAll(regex), match => ({
            tagName: match[1],
            text: match[2]
        } as Intention));
    }


    private getIntentionContent(intentions: Intention[], intentionName: string): Intention {
        let intention = intentions.find((anIntention) => anIntention.tagName == intentionName);
        if (intention == undefined) {
            return {
                tagName: intentionName,
                text: ""
            }
        }
        return intention
    }

    private removeIntentionContents(text: string) {
        return text.replaceAll(/\[([a-zA-Z0-9_-]+)]([\s\S]*?)\[\/\1]/g, "");
    }
}
