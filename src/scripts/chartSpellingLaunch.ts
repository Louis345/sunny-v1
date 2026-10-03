import {configuredSpellingModel} from '../chart/spelling/provider';
import path from 'node:path';
import os from 'node:os';
import { chartPath } from '../chart/guard';
export function spellingKioskEnvironment(env: NodeJS.ProcessEnv, home = os.homedir()): NodeJS.ProcessEnv {
    const chartDir = env.SUNNY_CHART_DIR?.trim() || path.join(home, 'SunnyData');
    const result = { ...env, SUNNY_CHART_DIR: chartDir, SUNNY_SPELLING_CHART: '1', SUNNY_SUBJECT: 'homework', SUNNY_HOMEWORK_DOMAIN: 'spelling' };
    chartPath('reina', { env: result }); // Validate location without opening or inspecting a child's file.
    return result;
}
if (require.main === module) {
    try {
        require('dotenv').config();
        if (!process.env.ANTHROPIC_API_KEY || !process.env.ELEVENLABS_API_KEY)
            throw new Error('spelling_provider_configuration_missing: existing Anthropic and ElevenLabs keys are required');
        const model=configuredSpellingModel();
        console.log(` 🎮 [spelling-kiosk] [planner-model] [configured] model=${model}`);
        const env = spellingKioskEnvironment(process.env);
        console.log(' 🎮 [spelling-kiosk] [startup] [chart_path_declared]');
        Object.assign(process.env, env);
        // Keep terminal signals in the existing launcher's lifecycle owner.
        require('./launch-kiosk');
    }
    catch (error) {
        console.error(' 🎮 [spelling-kiosk] [startup] [failed]', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
