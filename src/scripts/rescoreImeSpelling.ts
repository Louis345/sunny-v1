/**
 * Owner-run only: re-score saved spelling answers a Japanese-input keyboard turned into kana (2026-11-10).
 * Writes through the repository (old answers kept), respects board seals, calls no provider. Try --dry-run first.
 *
 *   npm run sunny:spelling:rescore-ime -- --child ila --homework HOMEWORK --since 2026-11-10T00:00:00Z --source "who/why" [--dry-run]
 */
import "dotenv/config";
import { parseRescoreImeArgs, rescoreImeSpellingObservations } from "../engine/imeSpellingRescore";

const args = parseRescoreImeArgs(process.argv.slice(2));
if (!args) {
  console.error('Usage: npm run sunny:spelling:rescore-ime -- --child CHILD --homework HOMEWORK --since ISO_TIME --source "who/why" [--dry-run]');
  process.exitCode = 1;
} else {
  try {
    rescoreImeSpellingObservations(args);
  } catch (error) {
    console.error(` 🎮 [spelling-rescore] [ime] [refused] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
