import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { expect, it } from "vitest";
import { buildNodeUrlSearchParams } from "../shared/nodeRegistry";

it("carries frozen spelling identities through the real native game bridge without inventing responses", () => {
  const params = buildNodeUrlSearchParams({ id: "wheel", words: ["night"], spellingItemBindings: [{ itemId: "frozen-night", word: "night" }] } as never, { childId: "lab", companion: "elli", previewParam: "go-live" } as never);
  const messages: any[] = [];
  const sandbox: any = { location: { search: `?${params}` }, URLSearchParams, console, Date, Math, document: { title: "Wheel", addEventListener() {}, body: { appendChild() {} }, createElement: () => ({ style: {} }) }, window: { parent: { postMessage: (message: unknown) => messages.push(message) } } };
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), "web/public/games/_contract.js"), "utf8"), sandbox);
  sandbox.window.sendNodeComplete({ completed: true, accuracy: 1, targetResults: [{ target: "night", correct: true }] });
  const result = messages.find(row => row.type === "node_complete");
  expect(result.targetResults).toEqual([{ target: "frozen-night", correct: true }]);
  expect(result.targetResults[0].attemptedValue).toBeUndefined();
  sandbox.window.fireAttemptEvent({ target: "night", attemptedValue: "nite", correct: false });
  expect(messages.at(-1).payload).toMatchObject({ target: "frozen-night", attemptedValue: "nite" });
  sandbox.window.sendNodeComplete({ completed: true, targetResults: [{ target: "invented", attemptedValue: "night" }] });
  expect(messages.at(-1).targetResults[0].target).toBe("invented"); // Server must reject, never guess.
});

it("announces a native spelling item before its answer with frozen identity and launch correlation", () => {
  const messages: any[] = [];
  const sandbox: any = { location: { search: '?nodeId=native&launchToken=launch-one&spellingItemBindings='+encodeURIComponent(JSON.stringify([{itemId:'frozen-night',word:'night'}])) }, URLSearchParams, console, Date, Math, document: { title:'Letter Rush',addEventListener(){} }, window: { parent:{postMessage:(m:unknown)=>messages.push(m)} } };
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(),'web/public/games/_contract.js'),'utf8'),sandbox);
  sandbox.window.GameBridge.reportState('word opened',{spellingItemOpened:true,currentWord:'night',phase:'flash',answerVisibility:'visible'});
  expect(messages.at(-1).payload).toMatchObject({itemId:'frozen-night',nodeId:'native',launchToken:'launch-one',practiceCapture:true,phase:'flash'});
  expect(messages).toHaveLength(1);
  sandbox.window.fireAttemptEvent({target:'night',attemptedValue:'nite'});
  expect(messages.at(-1).payload).toMatchObject({target:'frozen-night',launchToken:'launch-one',attemptedValue:'nite'});
  sandbox.window.GameBridge.reportState('unknown word',{spellingItemOpened:true,currentWord:'other',phase:'flash'});
  expect(messages.at(-1).payload.practiceCapture).not.toBe(true);
});
