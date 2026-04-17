import type {Intention} from './Intention.ts'
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {InternalLogger} from "../LogConfig.ts";
import {fileURLToPath} from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IntentionContext {
    speakIntention: Intention | undefined,
    contentIntention: Intention | undefined,
    waitIntention: Intention | undefined,
    conversationIntention: Intention | undefined,
    longTermMemoryIntention: Intention | undefined,
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
        let intentions = this.getIntentions(resolvedTextContent);
        let speakIntention = this.getIntentionContent(intentions, "SPEAK");
        let contentIntention = this.getIntentionContent(intentions, "CONTENT");
        let waitIntention = this.getIntentionContent(intentions, "WAIT");
        let conversationIntention = this.getIntentionContent(intentions, "CONVERSATION");
        let longTermMemoryIntention = this.getIntentionContent(intentions, "ENDURINGINFORMATION");
        
        let overallTextResponseContent = this.removeIntentionContents(resolvedTextContent);
        return {
            speakIntention: speakIntention,
            contentIntention: contentIntention,
            waitIntention: waitIntention,
            conversationIntention: conversationIntention,
            longTermMemoryIntention: longTermMemoryIntention,
            text: overallTextResponseContent
        }
    }
    
    private resolveImagesToIntentionTags(overallResponseContent: ExtractedData): string {
        const elements = overallResponseContent.elements;
        let imagesToConsolidate = "";

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            if (element == undefined) {
                continue;
            }
            if (element.type === "text") {
                if (element.text.includes("</CONTENT>")) {
                    element.text = element.text.replace("</CONTENT>", imagesToConsolidate + "</CONTENT>");
                    imagesToConsolidate = "";
                } else {
                    element.text += imagesToConsolidate;
                }
            } else if (element.type === "image") {
                imagesToConsolidate += `<img alt="Image Result" src="data:${element.mimeType};base64,${element.data}" />`;
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
        return contentToReturn;
    }
    
    private getIntentions(content: string): Intention[] {
        const regex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g;

        return Array.from(content.matchAll(regex), match => ({
            tagName: match[1],
            text: match[2]
        } as Intention));
    }


    private getIntentionContent(intentions: Intention[], intentionName: string): Intention | undefined {
        let intention = intentions.find((anIntention) => anIntention.tagName == intentionName);
        if (intention == undefined) {
            return undefined;
        }
        return intention
    }

    private removeIntentionContents(text: string) {
        return text.replaceAll(/\[([a-zA-Z0-9_-]+)]([\s\S]*?)\[\/\1]/g, "");
    }
}
