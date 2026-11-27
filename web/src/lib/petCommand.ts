/** S: her pet by voice (2026-11-22). The newest `pet` command the kiosk has not acted on yet, if any. */
export function newestPetCommandAt(commands: ReadonlyArray<{ type: string; timestamp: number }>, handledAt: number): number | null {
  const newest = commands.filter((command) => command.type === "pet" && command.timestamp > handledAt).reduce((latest, command) => Math.max(latest, command.timestamp), 0);
  return newest > 0 ? newest : null;
}
