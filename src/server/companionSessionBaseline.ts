type Event = Record<string, unknown>;
export function buildCompanionSessionBaseline(events: Event[]) {
  const starts = new Map<string, number>();
  const heard = new Set<string>();
  const durations: number[] = [];
  for (const row of events) {
    const id = typeof row.requestId === 'string' ? row.requestId : '';
    const at = typeof row.ts === 'string' ? Date.parse(row.ts) : NaN;
    if (id && row.component === 'companion_timing' && row.action === 'response_started' && Number.isFinite(at)) starts.set(id, at);
    if (id && row.component === 'client_audio' && row.event === 'playback_started' && !heard.has(id)) {
      heard.add(id);
      const start = starts.get(id);
      if (start !== undefined && Number.isFinite(at) && at >= start) durations.push(at-start);
    }
  }
  durations.sort((a,b)=>a-b);
  const percentile = (fraction:number) => durations.length ? durations[Math.max(0,Math.ceil(durations.length*fraction)-1)] : undefined;
  return {
    playbackLatency:{samples:durations.length,p50Ms:percentile(.5),p95Ms:percentile(.95)},
    responseStarts:starts.size,
    companionMutes:events.filter(e=>e.component==='client_audio' && e.event==='companion_speech_mute' && e.muted===true).length,
    microphoneMutes:events.filter(e=>e.component==='client_audio' && e.event==='microphone_mute' && e.muted===true).length,
    dismissals:events.filter(e=>e.component==='companion_presence' && e.action==='dismissed').length,
    ignoredAmbient:events.filter(e=>e.component==='transcript' && e.action==='ambient_ignored').length,
    playbackFailures:events.filter(e=>e.component==='client_audio' && e.event==='playback_failed').length,
  };
}
export function renderCompanionSessionBaseline(report:ReturnType<typeof buildCompanionSessionBaseline>):string {
  const ms = (value:number|undefined) => value === undefined ? 'not measured' : `${value} ms`;
  return [
    '# Companion session baseline', '',
    '| Measure | Result |','|---|---|',
    `| Response started → browser playback acknowledgement, median | ${ms(report.playbackLatency.p50Ms)} |`,
    `| Same interval, p95 | ${ms(report.playbackLatency.p95Ms)} |`,
    `| Paired timing samples / response starts | ${report.playbackLatency.samples} / ${report.responseStarts} |`,
    `| Companion mute presses | ${report.companionMutes} |`,
    `| Microphone mute presses | ${report.microphoneMutes} |`,
    `| Voice dismissals | ${report.dismissals} |`,
    `| Ignored ambient transcripts | ${report.ignoredAmbient} |`,
    `| Browser playback failures | ${report.playbackFailures} |`, '',
    'Timing includes the acknowledgement return trip. Playback scheduling does not prove speaker audibility.',
    'Deepgram delay: not measured. Model/TTS stage delays, screen synchronization accuracy, and answer usefulness: not measured.',
    'Mute and dismissal are review signals, not automatic dissatisfaction scores. Inspect their timestamps and screen context in events.ndjson.',
    'Compare equivalent tasks with sample counts and failures. An incomplete session or zero samples is not a passing result.', '',
  ].join('\n');
}
