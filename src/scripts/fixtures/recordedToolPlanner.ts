import { getLearningCycle } from "../../engine/learningCycleRepository";

/** What the robot knows about its run, and what it saw at the provider boundary. */
export type RecordedToolLab = {
  root: string; childId: string; homeworkId: string; words: string[]; missedWords: string[];
  requests: any[]; teachingBoards: number; decisions: number;
  /** Order one next-board step for every built-in the menu offers, instead of the robot's three. */
  everyBuiltIn?: boolean;
};

/** One recorded Planner, artist and next-board Planner at the Anthropic client boundary. It answers
 * each real tool conversation the way the model would, using only what the request offers (its tool
 * names, enums and Sunny's own tool results), so the real handlers, checks and receipts all run at $0.
 * A request it does not recognise fails the run: no paid call can hide behind the robot. */
export function recordedToolReply(lab: RecordedToolLab, request: any): any {
  lab.requests.push(structuredClone(request));
  const names: string[] = (request.tools ?? []).map((tool: any) => tool.name);
  const turn = (request.messages ?? []).filter((row: any) => row.role === "assistant").length;
  const properties = (name: string) => request.tools.find((tool: any) => tool.name === name).input_schema.properties;
  const offered = (name: string, field: string): string[] => { const schema = properties(name)[field]; return schema.enum ?? schema.items?.enum ?? []; };
  const results: any[] = turn === 0 ? [] : (request.messages.at(-1).content as any[])
    .filter(block => block.type === "tool_result" && !block.is_error).map(block => JSON.parse(typeof block.content === "string" ? block.content : block.content[0].text));
  const message = (calls: Array<{ name: string; input: unknown }>) => ({ id: `recorded-${lab.requests.length}`, type: "message", role: "assistant", model: request.model,
    stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    content: calls.map((call, index) => ({ type: "tool_use", id: `tool-${lab.requests.length}-${index}`, name: call.name, input: call.input })) });
  const pick = (values: string[], wanted: string) => { const value = values.find(row => row === wanted || row.endsWith(wanted)); if (!value) throw new Error(`recorded_planner_offer_missing:${wanted} offered=${values.join(",")}`); return value; };

  // Discovery intake: the assigned words, then the hidden-word radar that finds her starting point.
  if (names.includes("record_words")) return message([
    { name: "record_words", input: { words: lab.words.map(word => ({ word, page_number: 1 })), uncertainty: [], source_notes: [] } },
    { name: "choose_discovery", input: { action: "select", instrument: pick(offered("choose_discovery", "instrument"), "independent_spelling_discovery"), reason: "Independent recall shows where she starts.",
      evidence_ids: offered("choose_discovery", "evidence_ids").slice(0, 1), uncertainty: ["One occasion."], next_evidence_needed: ["Independent recall of each word."] } },
    { name: "finish_intake", input: { title: "School spelling", portal_label: "Word Check", endpoint_label: "Finish" } },
  ]);

  // The map artist submits without placing stops, so each board is drawn on the plain layout.
  if (names.includes("submit_board")) return message([{ name: "submit_board", input: { whatISee: "A simple trail.", pattern: "plain trail", rationale: "Recorded artist." } }]);

  // Teaching board: two practice routes for the missed words, then a fresh check of every word.
  if (names.includes("add_activity")) {
    const activities = offered("add_activity", "activity");
    const rows = [
      { activity: pick(activities, "word-radar:visible_read"), role: "practice", words: lab.missedWords, title: "Recall Practice" },
      { activity: pick(activities, "letter-rush:read-and-race"), role: "practice", words: lab.missedWords, title: "Letter Rush" },
      { activity: pick(activities, "word-radar:partial_visual_recall"), role: "practice", words: lab.missedWords, title: "Sound Steps" },
      { activity: pick(activities, "word-radar:hidden_word_recall"), role: "fresh_checkpoint", words: lab.words, title: "Recall Checkpoint" },
    ];
    if (turn === 0) { lab.teachingBoards += 1; return message(rows.map(input => ({ name: "add_activity", input: { ...input, story: `Story: ${input.title}`, picture: `Picture: ${input.title}` } }))); }
    const ids: string[] = results.map(row => row.activity_id).filter(Boolean);
    if (ids.length !== rows.length) throw new Error(`recorded_planner_expected_activity_ids:${JSON.stringify(results)}`);
    const evidence = offered("predict", "evidence_ids").slice(0, 1);
    const predict = (activity_id: string, checkpoint: boolean) => ({ name: "predict", input: { activity_id, expected_accuracy_min: checkpoint ? 0.5 : 0.6, expected_accuracy_max: 1, confidence: 0.5,
      reason: "Focused practice on the clean misses.", uncertainty: "One immediate occasion.", support_criteria: "Most missed words recalled.", revise_criteria: "Mixed recall.", falsify_criteria: "No improvement.",
      evidence_ids: evidence, max_delay_days: 7 } });
    return message([
      ...ids.map((id, index) => predict(id, index === 3)),
      { name: "set_order", input: { opening: [], closing: [ids[3]] } },
      { name: "add_choice", input: { purpose: "How do you want to practice?", label: "Choose your path", options: [
        { label: "Speed It", hypothesis: "Fast practice keeps her engaged.", ids: [ids[0], ids[1]] },
        { label: "Slow Steps", hypothesis: "Partial cues build recall.", ids: [ids[2]] },
      ] } },
      { name: "finish_board", input: { title: "Spelling Practice", endpoint_label: "Finish", single_path_reason: "",
        plan_theory: { hypothesis: "Practice on the clean misses may improve immediate independent recall.", evidence_summary: evidence, intervention: "Two practice routes, then a fresh check.",
          support_criteria: ["Missed words recalled."], revise_criteria: ["Mixed recall."], falsify_criteria: ["No improvement."] }, review_questions: [] } },
    ]);
  }

  // Next board: re-run the Speed route and the final check; after that board, wait for graded work.
  if (names.includes("decide")) {
    if (turn === 0) lab.decisions += 1;
    const decide = (status: string, action: string) => ({ name: "decide", input: { status, reason: "From her recorded answers.", progression_action: pick(offered("decide", "progression_action"), action),
      preserve: [], change: [], test_next: [], next_evidence_required: ["Independent recall."], prediction_evaluation_ids: offered("decide", "prediction_evaluation_ids"), revised_hypothesis: "" } });
    if (lab.decisions > 1) return message([decide("inconclusive", "await_calibration"), { name: "finish_board", input: { title: "Waiting", endpoint_label: "Finish", single_path_reason: "Awaiting graded work." } }]);
    if (turn === 0) {
      const cycle = getLearningCycle(lab.childId, lab.homeworkId, { rootDir: lab.root })!;
      const builtIns = offered("add_step", "built_in");
      const step = (title: string) => {
        const node = cycle.nodes.find(row => row.title === title && builtIns.includes(row.nodeId));
        if (!node) throw new Error(`recorded_planner_built_in_missing:${title} offered=${builtIns.join(",")}`);
        return { name: "add_step", input: { built_in: node.nodeId, words: [], title: `${title} Again`, purpose: "Practice again.", story: `Story: ${title} Again`, picture: `Picture: ${title} Again` } };
      };
      if (lab.everyBuiltIn) return message([decide("revised", "generate_support"), ...builtIns.map((built_in, index) => ({ name: "add_step", input: { built_in,
        // A re-run takes all of its own words; a fresh game from the menu practices her missed words.
        words: cycle.nodes.some(node => node.nodeId === built_in) ? [] : [...new Set(cycle.nodes.flatMap(node => Object.values(node.evidenceContract.spellingItems ?? {})).filter(item => lab.missedWords.includes(item.word)).map(item => item.wordId))],
        title: `Again ${index + 1}`, purpose: "Practice again.", story: `Story: Again ${index + 1}`, picture: `Picture: Again ${index + 1}` } }))]);
      // The first step is a fresh game from the menu, so the robot plays one the board set up new.
      const missed = [...new Set(cycle.nodes.flatMap(node => Object.values(node.evidenceContract.spellingItems ?? {})).filter(item => lab.missedWords.includes(item.word)).map(item => item.wordId))];
      const fresh = { name: "add_step", input: { built_in: pick(builtIns, "word-radar:visible_read"), words: missed, title: "Fresh Radar", purpose: "Practice the missed words.", story: "Story: Fresh Radar", picture: "Picture: Fresh Radar" } };
      return message([decide("revised", "generate_support"), fresh, step("Letter Rush"), step("Recall Checkpoint")]);
    }
    const steps: string[] = results.map(row => row.step_id).filter(Boolean);
    return message([{ name: "set_order", input: { opening: steps, closing: [] } },
      { name: "finish_board", input: { title: "Next Practice", endpoint_label: "Finish", single_path_reason: "One path re-runs what she practiced." } }]);
  }
  throw new Error(`recorded_planner_unscripted_request:${names.join(",") || "no_tools"}`);
}
