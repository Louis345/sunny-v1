/**
 * How present the companion was, read from the server log (owner, 2026-11-16: "we need verifiable proof that the fix
 * worked"). Ila called Elli annoying because she "keeps saying the same over and over"; these numbers say whether a
 * change helped: how often she cut the companion off, how long replies ran, how many repeated a recent reply, and how
 * fast speech started. New logs carry one exact line per reply; older logs are rebuilt from speech chunks, marked
 * approximate.
 */
const STOP = new Set(["the", "and", "her", "she", "you", "your", "for", "with", "this", "that", "are", "was", "has", "have", "can", "but", "its", "it's", "one"]);
const contentWords = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\p{N}'-]{3,}/gu) ?? []).filter(word => !STOP.has(word)));
const wordCount = (text: string) => (text.match(/[\p{L}\p{N}'-]+/gu) ?? []).length;

/** Share of the shorter reply's content words that the other reply also says (0 to 1); short replies never count. */
export function replyOverlap(a: string, b: string): number {
  const x = contentWords(a), y = contentWords(b);
  const small = x.size <= y.size ? x : y, large = small === x ? y : x;
  if (small.size < 4) return 0;
  return [...small].filter(word => large.has(word)).length / small.size;
}

export const REPEAT_OVERLAP = 0.5;

export type CompanionPresenceAudit = {
  from: string; to: string; minutes: number; approximate: boolean;
  replies: number; medianWords: number; longReplies: number; repeats: number;
  interruptions: number; interruptionsPer10Min: number;
  medianFirstAudioMs: number | null; p90FirstAudioMs: number | null;
};

const at = (line: string) => Date.parse(line.slice(0, 24));
const median = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const p90 = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : null; };

export function auditCompanionPresence(lines: string[], window: { from: string; to: string }): CompanionPresenceAudit {
  const from = Date.parse(window.from), to = Date.parse(window.to);
  const inside = lines.filter(line => { const time = at(line); return Number.isFinite(time) && time >= from && time <= to; });
  const exact = inside.flatMap(line => { const m = /\[companion\] \[reply\] \[said\] .*words=(\d+) repeat=([\d.]+)/.exec(line); return m ? [{ words: Number(m[1]), repeat: Number(m[2]) }] : []; });
  let replies: Array<{ words: number; repeat: number }> = exact;
  if (!exact.length) {
    // Older logs: one reply is speech chunks less than 1.5 s apart; a one- or two-word chunk is a game prompt ("circus.").
    const groups: Array<{ end: number; text: string }> = [];
    for (const line of inside) {
      const m = /🔊 TTS: "(.*)"\s*$/.exec(line);
      if (!m) continue;
      const time = at(line), last = groups.at(-1);
      if (last && time - last.end < 1500) { last.text += ` ${m[1]}`; last.end = time; } else groups.push({ end: time, text: m[1] });
    }
    const said = groups.map(group => group.text).filter(text => wordCount(text) > 2);
    replies = said.map((text, index) => ({ words: wordCount(text), repeat: Math.max(0, ...said.slice(Math.max(0, index - 3), index).map(earlier => replyOverlap(text, earlier))) }));
  }
  const interruptions = inside.filter(line => line.includes("action=barge_in") && line.includes("stateBefore=SPEAKING")).length;
  const firstAudio = inside.flatMap(line => { const m = /\[turn_first_audio\].*eot_to_first_audio=(\d+)ms/.exec(line); return m ? [Number(m[1])] : []; });
  const minutes = Math.round((to - from) / 60000);
  return {
    from: window.from, to: window.to, minutes, approximate: !exact.length,
    replies: replies.length, medianWords: median(replies.map(row => row.words)), longReplies: replies.filter(row => row.words > 30).length,
    repeats: replies.filter(row => row.repeat >= REPEAT_OVERLAP).length,
    interruptions, interruptionsPer10Min: minutes ? Math.round((interruptions / minutes) * 100) / 10 : 0,
    medianFirstAudioMs: firstAudio.length ? median(firstAudio) : null, p90FirstAudioMs: p90(firstAudio),
  };
}
