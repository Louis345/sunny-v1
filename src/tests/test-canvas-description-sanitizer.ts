/**
 * Contract: canvas_display text is sanitized before reaching SVG generation.
 * Question/instruction framing is stripped so Haiku gets a pure scene description.
 */
import { sanitizeCanvasDescription } from "../server/session-manager";

let failures = 0;

function assert(cond: boolean, name: string): void {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    console.log(`  ❌ ${name}`);
    failures++;
  }
}

console.log("\ncanvas description sanitizer\n");

// strips "Circle how much..." framing
{
  const result = sanitizeCanvasDescription(
    "Circle how much money I need to buy these cookies."
  );
  assert(!result.toLowerCase().startsWith("circle"), "strips Circle prefix");
  assert(!result.toLowerCase().startsWith("how"), "strips how much after circle");
  assert(result.toLowerCase().includes("cookies"), "preserves the subject (cookies)");
}

// strips "How many coins..." framing
{
  const result = sanitizeCanvasDescription(
    "How many coins do I need to buy a peanut?"
  );
  assert(!result.toLowerCase().startsWith("how"), "strips How many prefix");
  assert(result.toLowerCase().includes("peanut"), "preserves the subject (peanut)");
}

// strips "What coins do I need" framing
{
  const result = sanitizeCanvasDescription(
    "What coins do I need to pay for the snacks?"
  );
  assert(!result.toLowerCase().startsWith("what"), "strips What prefix");
  assert(result.toLowerCase().includes("snacks"), "preserves the subject (snacks)");
}

// strips "Count the coins" framing
{
  const result = sanitizeCanvasDescription("Count the coins in the piggy bank.");
  assert(!result.toLowerCase().startsWith("count"), "strips Count prefix");
  assert(result.toLowerCase().includes("coins"), "preserves coins");
}

// leaves scene descriptions untouched
{
  const scene = "A cookie shop. Cookie 10¢, Peanut 5¢.";
  const result = sanitizeCanvasDescription(scene);
  assert(result === scene, "scene description unchanged");
}

// leaves another scene untouched
{
  const scene = "Piggy bank with quarters and dimes. Total: 47¢.";
  const result = sanitizeCanvasDescription(scene);
  assert(result === scene, "piggy bank scene unchanged");
}

// handles empty string
{
  const result = sanitizeCanvasDescription("");
  assert(result === "", "empty string returns empty");
}

// capitalizes first letter after stripping
{
  const result = sanitizeCanvasDescription("Show the coins on the table.");
  assert(
    result.charAt(0) === result.charAt(0).toUpperCase(),
    "result starts with uppercase"
  );
}

// doesn't strip valid scene that happens to start with a matched word followed by non-instruction
{
  const scene = "Cookie stand with three items for sale.";
  const result = sanitizeCanvasDescription(scene);
  assert(result === scene, "cookie stand scene unchanged");
}

if (failures > 0) {
  console.log(`\n  ${failures} failed\n`);
  process.exit(1);
}
console.log("\n  all passed ✅\n");
