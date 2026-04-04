import type { BondPatterns } from "../context/schemas/learningProfile";

export interface BondState {
  met: boolean;
  quality: "strong" | "moderate" | "weak";
  topics: string[];
  exchangeCount: number;
}

export interface BondExchange {
  childText: string;
  isPersonalTopic: boolean;
  isEmotionalDisclosure: boolean;
  wordCount: number;
}

export function evaluateBondState(exchanges: BondExchange[]): BondState {
  const exchangeCount = exchanges.length;
  const personalTopics = exchanges.filter((e) => e.isPersonalTopic);
  const emotionalDisclosures = exchanges.filter((e) => e.isEmotionalDisclosure);
  const topics = personalTopics.map((e) => e.childText.slice(0, 50));

  const met =
    (exchangeCount >= 2 && personalTopics.length > 0) ||
    emotionalDisclosures.length > 0 ||
    exchangeCount >= 4;

  let quality: BondState["quality"] = "weak";
  if (personalTopics.length >= 2 || emotionalDisclosures.length > 0) {
    quality = "strong";
  } else if (personalTopics.length >= 1 || exchangeCount >= 3) {
    quality = "moderate";
  }

  return { met, quality, topics, exchangeCount };
}

export function getBondContextInjection(bondPatterns: BondPatterns): string {
  const lines: string[] = ["[Bond Context]"];

  if (bondPatterns.topics.length > 0) {
    lines.push(`Bond topics this child responds to: ${bondPatterns.topics.join(", ")}`);
  }
  lines.push(`Bond style: ${bondPatterns.bondStyle}`);
  lines.push(`Average bond turns before ready: ${bondPatterns.averageBondTurns}`);
  lines.push(`Last session bond quality: ${bondPatterns.lastBondQuality}`);
  lines.push("");
  lines.push("BOND LAW: Before any academic content, connect as a person first.");
  lines.push("Two real exchanges minimum. A real exchange means:");
  lines.push("the child shares something personal or meaningful,");
  lines.push("and you respond with genuine interest — not a redirect.");
  lines.push("When the bond feels real, bridge naturally to work.");

  return lines.join("\n");
}
