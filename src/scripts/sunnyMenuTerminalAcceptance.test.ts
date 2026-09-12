import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import { seedSpellingLab } from "./fixtures/spellingEvidenceFirst";

it("hands the terminal to an ingestion child, then accepts menu input after it exits", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-menu-terminal-"));
  const sourceRoot = process.cwd();
  let child: ReturnType<typeof spawn> | undefined;
  let transcript = "";
  try {
    fs.cpSync(path.join(sourceRoot, "src"), path.join(root, "src"), { recursive: true, filter: from => !from.startsWith(path.join(sourceRoot, "src/context") + path.sep) || from.startsWith(path.join(sourceRoot, "src/context/schemas")) });
    fs.copyFileSync(path.join(sourceRoot, "tsconfig.json"), path.join(root, "tsconfig.json"));
    fs.symlinkSync(path.join(sourceRoot, "node_modules"), path.join(root, "node_modules"));
    const source = seedSpellingLab(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { "sunny:ingest:spelling": "node confirm.cjs" } }));
    fs.writeFileSync(path.join(root, "confirm.cjs"), `
      const readline=require('node:readline/promises');
      const rl=readline.createInterface({input:process.stdin,output:process.stdout});
      const timeout=setTimeout(()=>{console.error('CHILD_INPUT_LOST');process.exit(2)},3000);
      rl.question('Confirm saved capture [y/N]: ').then(answer=>{
        clearTimeout(timeout);rl.close();console.log('CHILD_RECEIVED:'+answer);
        process.exitCode=answer==='yes'?0:3;
      }).catch(error=>{console.error(error);process.exitCode=1});
    `);
    const command = [process.execPath, path.join(sourceRoot, "node_modules/tsx/dist/cli.mjs"), "src/scripts/sunnyMenu.ts"];
    const args = ["-c", "import os, pty, sys; sys.exit(os.waitstatus_to_exitcode(pty.spawn(sys.argv[1:])))", ...command];
    const answers = ["1", "1", "2", source, "yes", "5"];
    let pending = "";
    child = spawn("python3", args, { cwd: root, detached: true, env: { ...process.env, SUNNY_CONTEXT_ROOT: path.join(root, "src/context"), DOTENV_CONFIG_PATH: "/dev/null", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", ELEVENLABS_API_KEY: "" }, stdio: "pipe" });
    child.stdout!.on("data", chunk => {
      transcript += String(chunk); pending += String(chunk);
      if (/(?:> |cancel: |\[y\/N\]: )$/.test(pending) && answers.length) { child!.stdin!.write(answers.shift() + "\n"); pending = ""; }
    });
    child.stderr!.on("data", chunk => { transcript += String(chunk); });
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`menu_terminal_timeout:${transcript}`)), 15000);
      child!.once("error", error => { clearTimeout(timer); reject(error); });
      child!.once("exit", code => { clearTimeout(timer); resolve(code); });
    });
    expect(transcript).toContain("CHILD_RECEIVED:yes");
    expect(transcript).not.toContain("CHILD_INPUT_LOST");
    expect(transcript).toContain("Homework ingestion finished.");
    expect(answers).toHaveLength(0);
    expect(code).toBe(0);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) process.kill(-child.pid!, "SIGTERM");
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 20000);
