"use strict";

const { classifyPaths } = require("./riskPaths.cjs");

const STATUS_CONTEXT = "human-gate";
const HOLD_LABEL = "hold";
const MAX_DESCRIPTION = 140;

function truncate(text, max = MAX_DESCRIPTION) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * `/ship` or `/ship <sha>` as the first line of a comment. Anything else,
 * including "/ship" mid-sentence, is not a command.
 * @returns {{ sha: string | null } | null}
 */
function parseShipCommand(body) {
  const firstLine = String(body ?? "").trim().split(/\r?\n/, 1)[0].trim();
  const m = /^\/ship(?:\s+([0-9a-f]{7,40}))?$/i.exec(firstLine);
  return m ? { sha: m[1] ? m[1].toLowerCase() : null } : null;
}

/**
 * Pure decision for the `human-gate` status. Holds (draft, hold label,
 * incomplete file list) win over everything, including a prior /ship.
 * `ship` is only ever supplied by the issue_comment handler for the comment
 * that triggered it, so a push after /ship re-evaluates with ship = null.
 */
function decideHumanGate({ files, filesComplete = true, labels = [], draft = false, ownerLogin, headSha, ship = null }) {
  const result = (state, description, matches = []) => ({
    state,
    description: truncate(description),
    matches,
  });

  if (draft) return result("pending", "Draft PR: human gate held until ready for review");
  if (labels.some((l) => String(l).toLowerCase() === HOLD_LABEL)) {
    return result("pending", `'${HOLD_LABEL}' label present: remove it to release the gate`);
  }

  const { risky, matches } = classifyPaths(files);
  if (!filesComplete) {
    return result("pending", `Changed-file list incomplete: needs /ship from @${ownerLogin}`, matches);
  }
  if (!risky) return result("success", "No risky paths touched", matches);

  const rules = [...new Set(matches.map((m) => m.rule))].join(", ");
  const owner = String(ownerLogin).toLowerCase();
  if (ship && String(ship.login).toLowerCase() === owner) {
    if (ship.sha && !String(headSha).toLowerCase().startsWith(ship.sha)) {
      return result("pending", `/ship sha ${ship.sha} does not match head ${String(headSha).slice(0, 7)}`, matches);
    }
    return result("success", `Shipped by @${ownerLogin} at ${String(headSha).slice(0, 7)} (${rules})`, matches);
  }
  return result("pending", `Risky paths (${rules}): needs /ship from @${ownerLogin}`, matches);
}

/**
 * Statuses are per commit, so a /ship recorded on the current head sha is
 * still valid after a label or draft toggle; a new push gets a new sha and
 * starts clean.
 * @param {{ context: string, state: string, description?: string, creator?: { login?: string } }[]} statuses
 * @returns {{ login: string, sha: null } | null}
 */
function shipFromStatuses(statuses, botLogin = "github-actions[bot]") {
  for (const s of statuses) {
    if (s.context !== STATUS_CONTEXT || s.state !== "success" || s.creator?.login !== botLogin) continue;
    const m = /^Shipped by @(\S+) at /.exec(s.description || "");
    if (m) return { login: m[1], sha: null };
  }
  return null;
}

module.exports = { STATUS_CONTEXT, HOLD_LABEL, parseShipCommand, decideHumanGate, shipFromStatuses, truncate };
