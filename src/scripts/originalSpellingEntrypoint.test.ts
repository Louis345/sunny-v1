import fs from 'node:fs';
import {it,expect} from 'vitest';
it('keeps the original kiosk as the only child spelling entrypoint',()=>{
 const server=fs.readFileSync('src/server.ts','utf8');const main=fs.readFileSync('web/src/main.tsx','utf8');
 expect(server).not.toContain('SUNNY_SPELLING_CHART');expect(server).not.toContain('setupChartSpellingRoutes');
 expect(server).toContain('setupRoutes(app)');expect(server).toContain('handleWsConnection(ws, req)');
 expect(main).not.toContain('SpellingChart');expect(main).not.toContain('=== "/spelling"');expect(main).toContain('SpellingParentPage');
 for(const file of ['src/server/chartSpellingRoutes.ts','src/scripts/chartSpellingLaunch.ts','web/src/components/SpellingChart/SpellingChart.tsx'])expect(fs.existsSync(file)).toBe(false);
 expect(JSON.parse(fs.readFileSync('package.json','utf8')).scripts['sunny:spelling:chart']).toBeUndefined();
});
