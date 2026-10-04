import { createHash } from 'node:crypto';

/** Bounded traversal: JSON deeper than ten levels is rejected, including cycles. */
export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 10) throw new Error('chart_json_depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, item => canonicalJson(item, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key], depth + 1)).join(',') + '}';
  }
  throw new Error('chart_json_invalid');
}

export function eventId(type: string, naturalKey: unknown): string {
  return createHash('sha256').update(canonicalJson({ type, naturalKey })).digest('hex');
}
