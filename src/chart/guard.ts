import fs from 'node:fs';
import path from 'node:path';

export type ChartOptions = { chartDir?: string; snapshot?: string; readonly?: boolean; env?: NodeJS.ProcessEnv };

function physicalPath(input: string): string {
  let cursor = path.resolve(input);
  const missing: string[] = [];
  while (!fs.existsSync(cursor)) {
    if (missing.length >= 100) throw new Error('chart_path_depth');
    missing.unshift(path.basename(cursor));
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error('chart_path_missing');
    cursor = parent;
  }
  return path.join(fs.realpathSync(cursor), ...missing);
}
function inCheckout(input: string): boolean {
  let cursor = input;
  for (let count = 0; count < 100; count++) {
    if (fs.existsSync(path.join(cursor, '.git'))) return true;
    const parent = path.dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
  throw new Error('chart_path_depth');
}
export function chartPath(childId: string, opts: ChartOptions): string {
  try {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(childId)) throw new Error('chart_child_id');
    if (opts.snapshot) return fs.realpathSync(opts.snapshot);
    const real = childId === 'reina' || childId === 'ila';
    const declared = real ? (opts.env ?? process.env).SUNNY_CHART_DIR : opts.chartDir ?? (opts.env ?? process.env).SUNNY_CHART_DIR;
    if (!declared?.trim()) throw new Error('chart_dir_required');
    const directory = physicalPath(declared);
    if (real && inCheckout(directory)) throw new Error('chart_checkout_refused');
    const file = path.join(directory, childId + '.db');
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('chart_database_symlink');
    // lstat detects dangling symlinks that existsSync intentionally ignores.
    try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error('chart_database_symlink'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return file;
  } catch (error) {
    console.error(` 🎮 [chart] [open] [refused] child=${JSON.stringify(childId)} reason=${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
