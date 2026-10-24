import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import { seedSpellingLab, writeSpellingPdfFixture } from "./fixtures/spellingEvidenceFirst";
import { recordedToolReply, type RecordedToolLab } from "./fixtures/recordedToolPlanner";

it("runs the real menu and ingestion subprocess twice with one local recorded provider response", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-cli-"));
  let requests = 0;
  const lab: RecordedToolLab = { root, childId: "lab-child", homeworkId: "", words: ["night", "light"], missedWords: [], requests: [], teachingBoards: 0, decisions: 0 };
  const capturedRequests: Array<{ url: string; input: any }> = [];
  const provider = http.createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      requests++;
      const input = JSON.parse(body);
      capturedRequests.push({ url: request.url!, input });
      // The real intake talks to the Planner through small locked tools, then the map artist draws.
      const message = recordedToolReply(lab, input);
      if (!input.stream) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(message)); return; }
      response.writeHead(200, { "content-type": "text/event-stream" });
      const send = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send("message_start", { type: "message_start", message: { ...message, content: [], stop_reason: null } });
      message.content.forEach((block: any, index: number) => {
        send("content_block_start", { type: "content_block_start", index, content_block: { ...block, input: {} } });
        send("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
        send("content_block_stop", { type: "content_block_stop", index });
      });
      send("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 0 } });
      send("message_stop", { type: "message_stop" });
      response.end();
    });
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  let child: ReturnType<typeof spawn> | undefined;
  let transcript = "";
  try {
    const sourceRoot = process.cwd();
    fs.cpSync(path.join(sourceRoot, "src"), path.join(root, "src"), { recursive: true, filter: from => !from.startsWith(path.join(sourceRoot, "src/context") + path.sep) || from.startsWith(path.join(sourceRoot, "src/context/schemas")) });
    // Eligibility checks the real instrument source. A source-less fixture is not
    // a launchable app and must not be used to prove diagnostic availability.
    fs.cpSync(path.join(sourceRoot, "web/src"), path.join(root, "web/src"), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, "package.json"), path.join(root, "package.json"));
    fs.copyFileSync(path.join(sourceRoot, "tsconfig.json"), path.join(root, "tsconfig.json"));
    fs.symlinkSync(path.join(sourceRoot, "node_modules"), path.join(root, "node_modules"));
    fs.symlinkSync(path.join(sourceRoot,"web/node_modules"),path.join(root,"web/node_modules"));
    seedSpellingLab(root);
    const source = writeSpellingPdfFixture(root, ["night", "light"]);
    const address = provider.address() as { port: number };
    const answers = ["1", "1", "2", source, "1", "1", "2", source, "5"];
    let pending = "";
    child = spawn(process.execPath, [path.join(sourceRoot, "node_modules/tsx/dist/cli.mjs"), "src/scripts/sunnyMenu.ts"], { cwd: root, detached: true, env: { ...process.env, SUNNY_CONTEXT_ROOT: path.join(root, "src/context"), SUNNY_MODE: "real", ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`, ANTHROPIC_API_KEY: "recorded-local-only", OPENAI_API_KEY: "", ELEVENLABS_API_KEY: "", XAI_API_KEY: "", DOTENV_CONFIG_PATH: "/dev/null" }, stdio: "pipe" });
    child.stdout!.on("data", chunk => {
      transcript += String(chunk); pending += String(chunk);
      if (/(?:> |cancel: )$/.test(pending) && answers.length) { child!.stdin!.write(answers.shift() + "\n"); pending = ""; }
    });
    child.stderr!.on("data", chunk => { transcript += String(chunk); });
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`spelling_menu_timeout:${transcript.slice(-1500)}`)), 45000);
      child!.once("error", error => { clearTimeout(timer); reject(error); });
      child!.once("exit", code => { clearTimeout(timer); resolve(code); });
    });
    expect(code, transcript).toBe(0);
    expect(answers, transcript).toHaveLength(0);
    expect(transcript.match(/Homework ingestion finished\./g), transcript).toHaveLength(2);
    // Live ingestion worked, but the legacy summary claimed BLOCKED/zero activities.
    // Exit-code/cycle-only assertions never exercised the caregiver-facing result.
    expect(transcript.match(/Done — DISCOVERY_READY/g), transcript).toHaveLength(2);
    expect(transcript.match(/Activities: 1 launchable/g), transcript).toHaveLength(2);
    expect(transcript).not.toContain("Done — BLOCKED");
    // Intake and artist each answered once; the second run replays both saved receipts.
    expect(requests).toBe(2);
    expect(capturedRequests[0].url).toBe("/v1/messages");
    // The source is sent as a base64 PDF, not as extracted plaintext.
    // Verify the exact supplied document instead of searching its encoding.
    expect(capturedRequests[0].input.messages[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "document", source: expect.objectContaining({
        type: "base64", media_type: "application/pdf", data: fs.readFileSync(source).toString("base64"),
      }) }),
    ]));
    const cyclesDir = path.join(root, "src/context/lab-child/homework/cycles");
    const files = fs.readdirSync(cyclesDir).filter(file => file.endsWith(".json"));
    expect(files).toHaveLength(1);
    const cycle = JSON.parse(fs.readFileSync(path.join(cyclesDir, files[0]), "utf8"));
    expect(cycle.lifecycle).toBe("evaluation_ready");
    expect(cycle.assignment.targets).toEqual(["night", "light"]);
    expect(cycle.nodes.map((node: any) => node.role)).toEqual(["evaluation"]);
    expect(cycle.observations).toEqual([]);
    // 2026-10-24: the single intake form was retired for small locked tools; every tool is strict.
    expect(capturedRequests.map(row => row.input.tools.map((tool: any) => tool.name))).toEqual([["record_words", "choose_discovery", "finish_intake"], ["preview_board", "adjust_board", "submit_board"]]);
    expect(capturedRequests.flatMap(row => row.input.tools).every((tool: any) => tool.strict === true)).toBe(true);
    expect(cycle.nodes[0].evidenceContract.diagnosticSelection.decision.action).toBe("select");
    const report = fs.readFileSync(path.join(root, "src/context/lab-child/homework/pending", new Date().toISOString().slice(0, 10), "ingest-report.md"), "utf8");
    expect(report).toContain("Status: **DISCOVERY_READY**");
    expect(report).toContain("Lifecycle: evaluation_ready");
    expect(report).toContain("Discovery activities: 1/1 launchable");
    expect(report).toContain("Targeted board: awaiting Discovery evidence");
    expect(report).toContain("Readiness failures: none");
    const output = path.join(sourceRoot, "outputs/evidence-first-proof/menu-cli"); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "transcript.log"), transcript);
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ passed: true, recordedProviderRequests: requests, newPaidCalls: 0, ingestionRuns: 2, homeworkId: cycle.homeworkId, lifecycle: cycle.lifecycle, scope: "Real stdin menu and npm ingestion subprocess; browser/worker/returned work are exercised separately." }, null, 2));
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) process.kill(-child.pid!, "SIGTERM");
    provider.closeAllConnections();
    await new Promise<void>(resolve => provider.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60000);
