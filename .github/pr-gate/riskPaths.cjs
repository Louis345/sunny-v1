"use strict";

/**
 * Paths that mark a PR as risky in the human-gate status, so the owner
 * knows where to look before /ship (every PR needs /ship). One rule list,
 * one matcher: the human-gate workflow and its tests both read from here.
 * Matching is case-insensitive so a casing change cannot dodge the gate.
 */
const RISK_RULES = [
  { rule: "souls", patterns: ["src/souls/**"] },
  { rule: "companions", patterns: ["src/companions/**"] },
  {
    rule: "profiles",
    patterns: [
      "src/profiles.ts",
      "src/profiles/**",
      "src/profile/**",
      "src/shared/childProfile.ts",
      "children.config.json",
      "src/context/*/child_profile.json",
      "src/context/*/learning_profile.json",
    ],
  },
  { rule: "session-state-machine", patterns: ["src/server/session-manager.ts"] },
  {
    rule: "learning-loop",
    patterns: [
      "src/**/*evidence*",
      "src/**/*learningcycle*",
      "src/**/*learningtheory*",
      "src/**/*learningdecision*",
      "src/**/*learningengine*",
      "src/**/*learningexperiment*",
      "src/**/*learningfeedback*",
      "src/**/*learningprofile*",
      "src/**/*longitudinal*",
      "src/**/*calibration*",
      "src/**/*prediction*",
      "src/**/*theory*",
      "src/utils/attempts.ts",
      "src/engine/attentionVitals.ts",
      "src/context/schemas/**",
    ],
  },
  { rule: "governance", patterns: ["LEARNING_FEEDBACK_LOOP.md", "AGENTS.md", "AI_DESIGN_PRINCIPLES.md", "docs/PRODUCT_RULES.md", ".github/**"] },
];

/** Supports `**` (any depth), `*` and `?` (within one segment). */
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, "i");
}

const COMPILED = RISK_RULES.map(({ rule, patterns }) => ({
  rule,
  regexps: patterns.map((p) => ({ pattern: p, re: globToRegExp(p) })),
}));

/** @param {string[]} files repo-relative paths (include rename sources). */
function classifyPaths(files) {
  const matches = [];
  for (const file of files) {
    for (const { rule, regexps } of COMPILED) {
      const hit = regexps.find(({ re }) => re.test(file));
      if (hit) matches.push({ file, rule, pattern: hit.pattern });
    }
  }
  return { risky: matches.length > 0, matches };
}

module.exports = { RISK_RULES, globToRegExp, classifyPaths };
