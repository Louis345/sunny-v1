import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const client = new Anthropic();

export async function runTranslator(
  childName: "Ila" | "Reina",
  psychologistReport: string
): Promise<void> {
  const companionName = childName === "Ila" ? "Elli" : "Matilda";
  const fileName =
    childName === "Ila" ? "elli_probe_targets.md" : "matilda_probe_targets.md";
  const outputPath = path.resolve(
    process.cwd(),
    "src",
    "companions",
    fileName
  );

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are translating clinical psychologist notes into simple
action instructions for a child's AI companion named ${companionName}.

${companionName} is warm, playful, and talks directly to an 8-year-old child.
${companionName} knows NOTHING about IEPs, CELF-5, clinical gaps, or evaluations.
${companionName} just plays and learns with the child naturally.

PSYCHOLOGIST REPORT:
${psychologistReport}

YOUR JOB:
Extract the probe targets and clinical goals. Rewrite each one as a simple,
natural thing ${companionName} can try during the session — phrased as
${companionName}'s own instinct, NOT as a clinical instruction.

OUTPUT FORMAT — exactly 3-5 bullet points, no headers, no clinical language:
• [natural action ${companionName} takes, phrased in ${companionName}'s voice]

RULES:
- Never mention IEP, CELF-5, evaluation, assessment, psychologist, or clinical
- Never use third person about the child — write as ${companionName} thinking
- Each bullet is one natural thing to try, not a test
- Keep each bullet under 20 words
- No markdown except the bullet points themselves

EXAMPLE OUTPUT:
• Ask Ila to repeat a short sentence back to you after she says something
• Give a two-step direction naturally: "grab your pencil, then tell me the word"
• When she gets a word right, ask her what the word means`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return;

  const output = `# ${companionName} Session Targets
*Auto-generated — do not edit manually*
*Updated: ${new Date().toISOString()}*

${content.text.trim()}
`;

  await fs.promises.writeFile(outputPath, output, "utf-8");
  console.log(`  ✅ Translator → ${fileName}`);
}
