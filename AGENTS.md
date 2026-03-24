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

Give Cursor this to add to AGENTS.md:

## Development Laws

### Law 1: Tests First — No Exceptions

Before writing any implementation:

1. Write the test file
2. Run the tests — they must FAIL (red)
3. Report failing tests to the human
4. Wait for human to say "implement"
5. Then write implementation
6. Tests must pass green before PR

Never skip this. Not for bug fixes.
Not for "small" changes. Not for hotfixes.
A failing test is proof the bug exists.
A passing test is proof the fix works.

### Law 2: No Infinite Loops

Before any recursive call or event listener:

- Prove the exit condition
- Add a counter guard: if (count > 10) throw
- Test must verify call count

### Law 3: One Change At A Time

Never fix multiple bugs in one commit.
One bug → one test → one fix → one commit.
If you find other bugs while fixing —
log them to BUGS.md and stop.

### Law 4: No Silent Failures

Every promise chain must have .catch()
Every void must be intentional and logged
No swallowed errors ever

### Law 5: Prove It In The Log

Every significant state change must log.
If it doesn't appear in the terminal
it didn't happen.
Format: " 🎮 [component] [action] [result]"

### Law 6: Ask Before Architecting

If a fix requires changing more than 2 files
STOP and ask the human first.
Show the plan. Get approval. Then build.

### Law 7: Run The Tests

After every change:
npm run build — must pass
npm run test:[relevant] — must pass
Never submit a failing build.
