import "dotenv/config";
import * as readline from "readline";
import { ask } from "./sunny";
import { speak } from "./speak";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(): void {
  rl.question("\nYou: ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.toLowerCase() === "exit") {
      console.log("\nSunny: Bye for now! You did great today. 💛\n");
      rl.close();
      return;
    }

    try {
      console.log("\nSunny is thinking...");
      const response = await ask(trimmed);
      console.log(`\nSunny: ${response}\n`);
      await speak(response);
    } catch (err) {
      console.error("Something went wrong:", err);
    }

    prompt();
  });
}

console.log("──────────────────────────────────────");
console.log("  Project Sunny");
console.log("  Type a message. Type 'exit' to quit.");
console.log("──────────────────────────────────────");

prompt();
