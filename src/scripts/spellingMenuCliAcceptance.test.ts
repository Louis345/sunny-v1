import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import { seedSpellingLab, recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";

it("runs the real menu and ingestion subprocess twice with one local recorded provider response", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-cli-"));
  let requests = 0;
  const capturedRequests: Array<{ url: string; input: any }> = [];
  const provider = http.createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      requests++;
      const input = JSON.parse(body);
      capturedRequests.push({ url: request.url!, input });
      const fileHash = JSON.stringify(input.messages).match(/\\"fileHash\\":\\"([a-f0-9]+)\\"/)?.[1];
      if (!fileHash) { response.writeHead(400); response.end("recorded_source_hash_missing"); return; }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "recorded-capture", type: "message", role: "assistant", model: input.model, stop_reason: "tool_use", usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: "tool_use", id: "recorded-tool", name: input.tools[0].name, input: { diagnostic: recordedSpellingDiagnostic({ sourceDocument: { fileHash } }), title: "School spelling", words: ["night", "light"].map(word => ({ word, pageNumber: 1 })), uncertainty: [], sourceNotes: ["All assigned words are legible. Practice instructions add no new words."] } }] }));
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
    const source = seedSpellingLab(root);
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
    expect(requests).toBe(1);
    expect(capturedRequests[0].url).toBe("/v1/messages");
    expect(JSON.stringify(capturedRequests[0].input.messages)).toContain("night");
    const cyclesDir = path.join(root, "src/context/lab-child/homework/cycles");
    const files = fs.readdirSync(cyclesDir).filter(file => file.endsWith(".json"));
    expect(files).toHaveLength(1);
    const cycle = JSON.parse(fs.readFileSync(path.join(cyclesDir, files[0]), "utf8"));
    expect(cycle.lifecycle).toBe("evaluation_ready");
    expect(cycle.nodes.map((node: any) => node.role)).toEqual(["evaluation"]);
    expect(cycle.observations).toEqual([]);
    expect(capturedRequests[0].input.tools[0].input_schema.required).toContain("diagnostic");
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
