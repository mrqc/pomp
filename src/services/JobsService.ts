import {Deepstream} from '@deepstream/server';
import {fileURLToPath} from "node:url";
import path from "node:path";
import {InternalLogger} from "../LogConfig.ts";
import cron, {type ScheduledTask} from 'node-cron';
import {type AgentsController, AgentSessionMessageType} from "../controller/AgentsController.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

enum JobType {
    PROMPT
}

interface JobDefinition {
    name: string;
    schedule: string;
    command: string;
    type: JobType;
}

export class JobsService {
    
    private jobs: ScheduledTask[] = [];
    private agentsController: AgentsController | undefined;

    private readonly logger = new InternalLogger(__filename);
    
    public init(agentsController: AgentsController) {
        this.agentsController = agentsController;
    }
    
    private promptJob(jobDefinition: JobDefinition) {
        this.agentsController?.prompt(jobDefinition.command, AgentSessionMessageType.EVENT, null);
    }

    public addAll(jobDefinitions: JobDefinition[]) {
        for (let jobDefinition of jobDefinitions) {
            this.jobs.push(cron.schedule(jobDefinition.schedule, () => {
                if (jobDefinition.type == JobType.PROMPT) {
                    this.promptJob(jobDefinition);
                }
            }));
        }
    }
    
    public static getInstance(): JobsService {
        if (!(globalThis as any).jobsService) {
            (globalThis as any).jobsService = new JobsService();
        }
        return (globalThis as any).jobsService;
    }
}
