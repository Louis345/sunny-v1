import { config } from "dotenv";
config({ path: "/Users/jamaltaylor/Development/sunny/.env" });
import { SessionManager } from "../src/server/session-manager";
const sent: string[] = [];
const ws: any = { readyState: 1, send: (m: string) => sent.push(m), on() {}, close() {} };
(async () => {
  const s = new SessionManager(ws, "Demo-pashley" as any, false, { homeworkId: "hw-spelling-110db7b7", silentTts: true } as any);
  try { await (s as any).start(); console.log("STARTED"); } catch (e) { console.log("STACK", (e as Error).stack?.split("\n").slice(0, 12).join("\n")); }
  process.exit(0);
})();
