# OpenAI Visual Learner Probe

This probe tests whether ChatGPT can generate a high-fidelity Sunny visual explainer
from a plain concept. It is a discovery tool, not the production studio.

## Run

Put the API key in the repo-root `.env`:

```env
OPENAI_API_KEY=sk-proj-...
SUNNY_BUDGET_CENTS=1000
```

Then run:

```bash
npm run sunny:visuallearner:openai -- --concept "centimeters vs inches"
```

The script asks before the paid call:

```text
About to call OpenAI gpt-5.5. Estimated cost: $0.45. Budget: $10.00. Continue? [y/N]
```

## What It Produces

Accepted outputs are written under:

```text
web/public/generated/openai-visual-probe/<concept-id>/
├── index.html
└── brief.json
```

The generated page is standalone HTML with inline CSS, SVG, and JavaScript. Vite
serves it from:

```text
http://localhost:5174/generated/openai-visual-probe/<concept-id>/index.html
```

The first golden result is:

```text
web/public/generated/openai-visual-probe/centimeters-vs-inches-1778454253669/index.html
```

## How The Script Works

`scripts/openaiVisualLearnerProbe.ts` has five important pieces:

1. Budget estimate

   The script estimates cost before calling OpenAI and refuses to run if the
   estimate exceeds `SUNNY_BUDGET_CENTS`.

2. Confirmation prompt

   The script asks `[y/N]` before the paid call so a bad command does not spend
   money silently.

3. Visual explainer prompt

   `buildPrompt()` tells the model to create one complete standalone HTML file
   with a Sunny care-plan note, interactive SVG scene, play button, scrubber,
   prediction pause, reveal moment, evidence console, and recall-game JSON data.

4. OpenAI Responses API call

   `callOpenAi()` sends the prompt to the configured model. The default model is
   `gpt-5.5`, but `OPENAI_VISUAL_MODEL` or `--model` can override it.

5. Safety/contract check

   `validateHtmlContract()` rejects outputs that are not complete HTML, do not
   include SVG, do not expose evidence events, load external scripts or URLs, or
   use network/storage/eval APIs.

Rejected outputs are saved locally under `_rejected/` for debugging, but that
folder is ignored by git.

## Prompt Boundary

The JSON/brief side controls what the explainer says and asks. The generated
HTML controls how the visual works. This matters because the prompt can request
camera motion, prediction pauses, or evidence events, but the actual drawing and
animation are model-generated code inside `index.html`.

For production, the next step is not to keep generating one-off files forever.
The next step is to turn accepted results into cataloged learning artifacts with:

- child/homework evidence
- learning target
- misconception target
- narration cache keys
- parent approval status
- recall-game questions
- evidence events to write back to the child chart
