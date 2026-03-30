# Gemini CLI Project Instructions

This project, **pomp**, is a voice-controlled agent system that handles audio recording, speech-to-text (STT), text-to-speech (TTS), and LLM-based agents.

## Architectural Overview

- **Frontend:** Located in the `frontend/` directory. Uses React-like patterns with custom components for UI and audio streaming.
- **Backend:** Located in `src/`. Uses Express for API and various controllers for managing audio and agents.
- **Controllers:** Handle specific domains like `AudioRecordingController`, `SpeechToTextController`, etc.
- **Services:** Singleton services for database access (`DatabaseConnectorService`) and synchronization.

## Coding Standards

- **TypeScript:** Use TypeScript for all new backend code.
- **Logging:** Use `InternalLogger` for all logging.
- **Singletons:** Use the `getInstance()` pattern for services.
- **Async/Await:** Prefer async/await over raw promises.

## Sample Code: Adding a new Tool

To add a new tool that an agent can use, follow this pattern:

```typescript
import {Tool} from "./Tool.ts";

export class MyNewTool extends Tool {
    constructor() {
        super("my_new_tool", "Description of what this tool does.");
    }

    async execute(args: any): Promise<string> {
        // Implementation logic here
        return "Result of tool execution";
    }
}
```

## Maintenance Tasks

- Always check `src/LogConfig.ts` if you need to adjust logging behavior.
- Database migrations are handled in `DatabaseConnectorService`.
- Configuration is loaded from `conf/pomp.yml` via the `Configuration` class.

## Useful Commands

- `npm run dev`: Starts the backend with nodemon.
- `npm run build`: Compiles TypeScript to JavaScript.
