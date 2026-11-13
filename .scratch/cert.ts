import { certifySpellingAdaptation } from "../src/engine/spellingCertification";
for (const childId of ["ila", "demo-pashley"]) {
  try { const r = certifySpellingAdaptation({ rootDir: process.cwd(), childId }); console.log(childId, JSON.stringify(r.games.map(g => [g.gameId, g.status, g.allowedInRealChildSession]))); }
  catch (e) { console.log(childId, "THROWS", (e as Error).message); }
}
