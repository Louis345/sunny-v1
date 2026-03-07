# Project Sunny — AI Agent Context

## Your Project: Sunny

**Sunny** is a voice-based AI study assistant for the developer's daughters. It uses:
- Anthropic Claude for conversation
- ElevenLabs for real-time text-to-speech
- Profile-based sessions (Elli, Matilda, Reina) with custom system prompts

Primary code: `src/index.ts`, `src/sunny.ts`, `src/stream-speak.ts`, `src/profiles.ts`.

---

## Reference Project: agents-v2

A copy of the [Frontend Masters AI Agents v2](https://github.com/Hendrixer/agents-v2) course repo lives at `_reference/agents-v2/`. Use it when the user gets stuck on agent concepts or wants to apply patterns from the course.

### When to use the reference

- **Agent patterns**: tools, tool execution, context management, message filtering
- **Architecture**: `src/agent/run.ts`, `src/agent/executeTool.ts`, `src/agent/tools/`
- **Token/context handling**: `src/agent/context/` (compaction, model limits, token estimation)

### Reference layout

```
_reference/agents-v2/
├── src/
│   ├── agent/
│   │   ├── tools/      # webSearch, shell, file, codeExecution
│   │   ├── context/    # compaction, model limits, token estimator
│   │   ├── system/     # prompt, filterMessages
│   │   ├── run.ts
│   │   └── executeTool.ts
│   ├── cli.ts
│   └── index.ts
└── evals/              # evaluation patterns
```

### How to use it

1. **Primary focus**: Work in the Sunny codebase (`src/`). Do not modify `_reference/agents-v2/`.
2. **When stuck**: If the user asks about agent tools, tool loops, context windows, or course concepts, read from `_reference/agents-v2/src/agent/` for patterns and apply them to Sunny.
3. **Learning by building**: Suggest adapting course patterns into Sunny rather than copying code as-is.
