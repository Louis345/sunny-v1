import type { EngagementDimension } from "../context/schemas/learningProfile";

export function engagementDimensionsForCanonicalNode(input: {
  mechanic: string;
  theme: string;
}): EngagementDimension[] {
  const contract = `${input.mechanic} ${input.theme}`.toLowerCase();
  const dimensions: EngagementDimension[] = [];
  if (/story|narrative|equal-groups/.test(contract)) dimensions.push("story");
  if (/puzzle|vault|mystery/.test(contract)) dimensions.push("puzzle");
  if (/speed|sprint|timed|blaster/.test(contract)) dimensions.push("speed");
  if (/arcade|race|score|battle/.test(contract)) dimensions.push("competition");
  if (/visual|array|skip-count|picture/.test(contract)) dimensions.push("visual");
  return dimensions.length > 0 ? [...new Set(dimensions)] : ["novelty"];
}
