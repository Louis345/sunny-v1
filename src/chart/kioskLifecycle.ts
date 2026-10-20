import { shouldPersistSessionData } from '../utils/runtimeMode';
import { resolveSunnyRuntimeConfig } from '../shared/runtimeConfig';
import { openChart, type ChartDatabase } from './db';
import type { ChartOptions } from './guard';

type Open = (child: string, options: ChartOptions) => Pick<ChartDatabase, 'close'>;

/** Connection ownership only. Learning event routing is a separate milestone. */
export function openKioskCharts(env: NodeJS.ProcessEnv = process.env, open: Open = openChart, kiosk = false) {
  const config = resolveSunnyRuntimeConfig(env);
  const disabled = !shouldPersistSessionData(env) || Boolean(env.SUNNY_CERTIFICATION_RUN_ID)
    || (!kiosk && !env.SUNNY_KIOSK_TOKEN && !env.SUNNY_CHART_DIR?.trim());
  const children = disabled ? [] : config.childId ? [config.childId] : ['ila', 'reina'];
  let connection: 'disabled' | 'open' | 'closed' | 'failed' = disabled ? 'disabled' : 'open';
  const handles: Array<Pick<ChartDatabase, 'close'>> = [];
  const close = () => {
    if (connection !== 'open') return;
    connection = 'closed';
    const failures: unknown[] = [];
    for (const handle of handles) {
      try { handle.close(); }
      catch (error) { failures.push(error); console.error(' 🎮 [chart] [close] [failed]', error); }
    }
    if (failures.length) { connection = 'failed'; throw new AggregateError(failures, 'chart_close_failed'); }
    console.log(` 🎮 [chart] [close] [ok] children=${children.join(',')}`);
  };
  if (disabled) {
    console.log(' 🎮 [chart] [startup] [disabled] preview_simulation_or_unconfigured_non_kiosk');
  } else {
    try {
      if (!env.SUNNY_CHART_DIR?.trim()) throw new Error('chart_dir_required: set SUNNY_CHART_DIR to the declared chart directory outside any checkout');
      for (const child of children) handles.push(open(child, { env }));
      console.log(` 🎮 [chart] [startup] [connected] children=${children.join(',')} learning_events=not_connected`);
    } catch (error) {
      console.error(' 🎮 [chart] [startup] [refused]', error);
      try { close(); } catch (cleanupError) { console.error(' 🎮 [chart] [startup-cleanup] [failed]', cleanupError); }
      throw error;
    }
  }
  const get = (child: string): ChartDatabase => {
    const handle = handles[children.indexOf(child)] as ChartDatabase | undefined;
    if (connection !== 'open' || !handle?.sql) throw new Error('chart_not_open');
    return handle;
  };
  return { close, get, status: () => ({ connection, children: [...children], learningEventsConnected: false as const }) };
}
