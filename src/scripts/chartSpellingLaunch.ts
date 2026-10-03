import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chartPath } from '../chart/guard';
import { localTsxCommand } from './localRuntimeCommand';
export function spellingKioskEnvironment(env: NodeJS.ProcessEnv, home = os.homedir()): NodeJS.ProcessEnv {
    const chartDir = env.SUNNY_CHART_DIR?.trim() || path.join(home, 'SunnyData');
    const result = { ...env, SUNNY_CHART_DIR: chartDir, SUNNY_SPELLING_CHART: '1', SUNNY_SUBJECT: 'homework', SUNNY_HOMEWORK_DOMAIN: 'spelling' };
    chartPath('reina', { env: result }); // Validate location without opening or inspecting a child's file.
    fs.mkdirSync(chartDir, { recursive: true, mode: 0o700 });
    const settings = path.join(chartDir, 'kiosk-settings.json');
    if (!fs.existsSync(settings))
        fs.writeFileSync(settings, JSON.stringify({ parentPin: String(randomInt(100000, 1000000)) }) + '\n', { flag: 'wx', mode: 0o600 });
    const saved = JSON.parse(fs.readFileSync(settings, 'utf8')) as {
        parentPin: unknown;
    };
    const pin = env.SUNNY_PARENT_PIN || saved.parentPin;
    if (typeof pin !== 'string' || !/^[0-9]{6,12}$/.test(pin))
        throw new Error('parent_pin_invalid');
    return { ...result, SUNNY_PARENT_PIN: pin };
}
if (require.main === module) {
    try {
        require('dotenv').config();
        if (!process.env.ANTHROPIC_API_KEY || !process.env.ELEVENLABS_API_KEY)
            throw new Error('spelling_provider_configuration_missing: existing Anthropic and ElevenLabs keys are required');
        const env = spellingKioskEnvironment(process.env);
        console.log(`Parent PIN for this kiosk: ${env.SUNNY_PARENT_PIN}`);
        console.log(' 🎮 [spelling-kiosk] [startup] [chart_path_declared]');
        const command = localTsxCommand(process.cwd(), 'src/scripts/launch-kiosk.ts', process.argv.slice(2));
        execFileSync(command.executable, command.args, { cwd: process.cwd(), env, stdio: 'inherit' });
    }
    catch (error) {
        console.error(' 🎮 [spelling-kiosk] [startup] [failed]', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
