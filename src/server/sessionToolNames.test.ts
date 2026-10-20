import { expect, it } from "vitest";
import { normalizeToolName } from "./sessionTextHelpers";

it("preserves every legacy tool alias and leaves other names unchanged", () => {
  const aliases = [
    ["start_spell_check", "startSpellCheck"], ["launch_game", "launchGame"],
    ["get_session_status", "getSessionStatus"], ["get_next_problem", "getNextProblem"],
    ["submit_answer", "submitAnswer"], ["clear_canvas", "clearCanvas"],
    ["canvas_show", "canvasShow"], ["canvas_clear", "canvasClear"],
    ["canvas_status", "canvasStatus"], ["session_log", "sessionLog"],
    ["session_status", "sessionStatus"], ["session_end", "sessionEnd"],
    ["record_child_signal", "recordChildSignal"], ["record_product_issue", "recordProductIssue"],
    ["express_companion", "expressCompanion"], ["companion_act", "companionAct"],
    ["request_pause_for_check_in", "requestPauseForCheckIn"], ["request_resume_activity", "requestResumeActivity"],
  ];
  for (const [alias, canonical] of aliases) {
    expect(normalizeToolName(alias)).toBe(canonical);
    expect(normalizeToolName(canonical)).toBe(canonical);
  }
  for (const other of ["", "unknown_tool", "toString", "__proto__", "Canvas_Show"]) {
    expect(normalizeToolName(other)).toBe(other);
  }
});
