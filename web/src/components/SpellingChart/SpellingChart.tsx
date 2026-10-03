import { PatternReport, type PatternRow } from './PatternReport';
import { useEffect, useState, useRef } from 'react';
import './spellingChart.css';
type Week = {
    assignmentId: string;
    stage: string;
    completed: number;
    total: number;
    title: string;
    testDate: string;
};
type Item = {
    itemId: string;
    word: string;
    instrument: string;
    index: number;
    total: number;
    instruction: string | null;
};
type Report = {
    patternHistory: PatternRow[];
    weeks: {
        assignmentId: string;
        prior: {
            brier: number | null;
            coverage: {
                matched: number;
                assigned: number;
            };
        };
        forecast: {
            brier: number | null;
            coverage: {
                matched: number;
                assigned: number;
            };
            prospectiveStatus: string;
        };
    }[];
};
type ParentView = {
    assignment: {
        words: string[];
    };
    forecast: {
        probabilities: {
            word: string;
            pCorrect: number;
        }[];
        uncertainty: string;
        missingEvidence: string[];
    } | null;
    schoolResult: unknown;
};
const titles: Record<string, string> = { prior: 'Getting ready', discovery: 'Discovery', plan: 'Your next step', practice: 'Practice', recall_check: 'Recall check', forecast: 'Finishing up', await_calibration: 'Session complete', complete: 'School result recorded' };
const token = new URLSearchParams(window.location.search).get('sunnyKioskToken') || '';
async function request<T>(url: string, body?: unknown, pin = ''): Promise<T> { const r = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-sunny-kiosk-token': token, 'x-sunny-parent-pin': pin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const data = await r.json(); if (!r.ok)
    throw new Error(data.error || 'request_failed'); return data as T; }
export function SpellingChart() {
    const [children, setChildren] = useState<string[]>([]), [child, setChild] = useState(''), [weeks, setWeeks] = useState<Week[]>([]), [week, setWeek] = useState<Week | null>(null), [item, setItem] = useState<Item | null>(null);
    const [parent, setParent] = useState(false), [pin, setPin] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [answer, setAnswer] = useState(''), [heard, setHeard] = useState(false), [audioPlays, setAudioPlays] = useState(0), [speaking, setSpeaking] = useState(false);
    const [words, setWords] = useState(''), [date, setDate] = useState(''), [report, setReport] = useState<Report | null>(null), [parentView, setParentView] = useState<ParentView | null>(null), [results, setResults] = useState<Record<string, string>>({}), [actualDate, setActualDate] = useState('');
    const [interests, setInterests] = useState('');
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioRequest = useRef<AbortController | null>(null);
    const audioUrl = useRef<string | null>(null);
    const cancelAudio = () => {
        audioRequest.current?.abort(); audioRef.current?.pause();
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = null;
    };
    const base = `/api/spelling/${encodeURIComponent(child)}`;
    const api = (suffix: string, body?: unknown) => request<any>(base + suffix, body, parent ? pin : '');
    const run = (work: () => Promise<void>) => { if (busy)
        return; setBusy(true); setError(''); work().catch(e => { console.error(' 🎮 [spelling-ui] [action] [failed]', e); setError(e instanceof Error ? e.message : 'request_failed'); }).finally(() => setBusy(false)); };
    useEffect(() => { let alive = true; request<{
        children: string[];
    }>('/api/spelling/config').then(c => { if (alive) {
        setChildren(c.children);
        if (c.children.length === 1)
            setChild(c.children[0]);
    } }).catch(e => { console.error(' 🎮 [spelling-ui] [startup] [failed]', e); if (alive)
        setError('connection_unavailable'); }); return () => { alive = false; cancelAudio(); }; }, []);
    useEffect(() => { if (!child)
        return; let alive = true; request<Week[]>(`/api/spelling/${encodeURIComponent(child)}/assignments`).then(w => { if (alive)
        setWeeks(w); }).catch(e => { console.error(' 🎮 [spelling-ui] [assignments] [failed]', e); if (alive)
        setError('connection_unavailable'); }); return () => { alive = false; }; }, [child]);
    const refresh = async () => setWeeks(await api('/assignments'));
    const open = async (w: Week) => { setWeek(await api(`/assignments/${w.assignmentId}`)); setItem(null); setParentView(null); setResults({}); setActualDate(w.testDate); };
    const present = async () => { if (!week)
        return; const next = await api(`/assignments/${week.assignmentId}/present`, {}); setItem(next); setAnswer(''); setHeard(false); setAudioPlays(0); };
    const submit = async (status: 'answered' | 'unknown') => { if (!week || !item)
        return; const saved = await api(`/assignments/${week.assignmentId}/respond`, { itemId: item.itemId, rawResponse: status === 'answered' ? answer : null, status, audioReplays: Math.max(0, audioPlays - 1) }); setWeek(saved.state); setItem(null); setAnswer(''); setHeard(false); await refresh(); };
    const hear = () => {
        if (!item || speaking) return;
        cancelAudio(); const controller = new AbortController(); audioRequest.current = controller;
        setSpeaking(true); setError('');
        fetch(base + '/audio', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', 'x-sunny-kiosk-token': token }, body: JSON.stringify({ itemId: item.itemId }) })
            .then(async response => {
                if (!response.ok) throw new Error('audio_unavailable');
                const blob = await response.blob(); if (controller.signal.aborted) return;
                const url = URL.createObjectURL(blob); audioUrl.current = url;
                const audio = new Audio(url); audioRef.current = audio;
                audio.onended = () => { URL.revokeObjectURL(url); if (!controller.signal.aborted) { setHeard(true); setAudioPlays(n => n + 1); setSpeaking(false); } };
                audio.onerror = () => { URL.revokeObjectURL(url); if (!controller.signal.aborted) { setSpeaking(false); setError('audio_unavailable'); } };
                await audio.play();
            }).catch(error => { if (!controller.signal.aborted) { console.error(' 🎮 [spelling-ui] [audio] [failed]', error); setSpeaking(false); setError('audio_unavailable'); } });
    };
    const leave = () => { cancelAudio(); setSpeaking(false); setItem(null); setWeek(null); setError(''); };
    return <main className="spelling-chart"><header className="spelling-header"><a href={window.location.href} className="spelling-logo">sunny<span>✦</span></a><button onClick={() => { leave(); setParent(p => !p); setPin(''); setReport(null); }} disabled={busy}>{parent ? 'Back to child view' : 'Parent area'}</button></header>
 <section className="spelling-shell"><div className="spelling-intro"><p className="spelling-eyebrow">A little discovery. A little practice. Real progress.</p><h1>{parent ? 'Your parent space' : 'Your spelling journey'}</h1><p>{parent ? 'Add a spelling list and see how Sunny’s predictions compare with school results.' : 'Listen, give it a try, and take it one word at a time.'}</p></div>
 <div className="spelling-children" aria-label="Choose child">{children.map(c => <button key={c} className={c === child ? 'selected' : ''} disabled={busy} onClick={() => { leave(); setChild(c); setReport(null); }}>{c.charAt(0).toUpperCase() + c.slice(1)}</button>)}</div>
 {busy && <p role="status">Saving or preparing your next step… Please keep this window open.</p>}
 {error && <div role="alert" className="spelling-error"><strong>{error === 'audio_unavailable' ? 'The word audio did not play. Try the sound button again.' : 'This step needs attention. Your saved answers are safe.'}</strong>{parent && <details><summary>Details for a parent</summary>{error}</details>}</div>}
 {parent && <label className="spelling-field">Parent PIN<input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} autoComplete="off"/></label>}
 {!week && child && <>
 {parent && <section className="spelling-card"><h2>This week’s spelling</h2><form onSubmit={e => { e.preventDefault(); run(async () => { await api('/assignments', { words: words.split(/[\n,]+/).map(w => w.trim()).filter(Boolean), testDate: date, sourceText: words }); setWords(''); await refresh(); }); }}><label>Words, one per line<textarea required value={words} onChange={e => setWords(e.target.value)} placeholder="Type the words from the school list"/></label><label>Scheduled school test<input type="date" required value={date} onChange={e => setDate(e.target.value)}/></label><button className="primary" disabled={busy || !pin}>Save confirmed list</button></form><details><summary>Help Sunny know your child</summary><label>Interests and motivating activities<input value={interests} onChange={e => setInterests(e.target.value)}/></label><button disabled={busy || !pin} onClick={() => run(async () => { await api('/profile', { displayName: child, interests: interests.split(',').map(s => s.trim()).filter(Boolean) }); })}>Save profile</button></details></section>}
 <div className="spelling-week-list">{weeks.length === 0 ? <section className="spelling-card"><h2>Your next adventure starts here</h2><p>A parent can add your school spelling list in the Parent area.</p></section> : weeks.map(w => <button className="spelling-card spelling-week" key={w.assignmentId} onClick={() => run(() => open(w))} disabled={busy}><span className="spelling-eyebrow">School test · {w.testDate}</span><strong>{titles[w.stage]}</strong><span>{w.total} words · {w.completed ? `${w.completed} saved` : 'Ready when you are'} <b>→</b></span></button>)}</div>
 {parent && <section className="spelling-card"><h2>Is Sunny getting better at predicting?</h2><button disabled={busy || !pin} onClick={() => run(async () => setReport(await api('/report')))}>View report</button>{report && <><p>Prediction error runs from 0 to 1. Lower is better. Coverage tells you how many words could actually be compared.</p><div className="spelling-table"><table><thead><tr><th>Week</th><th>Discovery error</th><th>School forecast error</th></tr></thead><tbody>{report.weeks.map((w, i) => <tr key={w.assignmentId}><td>{i + 1}</td><td>{w.prior.brier?.toFixed(3) ?? 'Not measured'}<small>{w.prior.coverage.matched}/{w.prior.coverage.assigned} words</small></td><td>{w.forecast.brier?.toFixed(3) ?? 'Awaiting school result'}<small>{w.forecast.coverage.matched}/{w.forecast.coverage.assigned} words · {w.forecast.prospectiveStatus === 'before_test_date' ? 'Forecast before test date' : 'Forecast timing unverified'}</small></td></tr>)}</tbody></table></div><PatternReport rows={report.patternHistory} weeks={report.weeks} /><p>One or two weeks cannot establish an improvement in learning. Look for a sustained trend with comparable coverage.</p></>}</section>}
 </>}
 {week && <section className="spelling-card spelling-room"><button className="back" disabled={busy} onClick={leave}>← Save my place & leave</button><p className="spelling-eyebrow">{titles[week.stage]}</p><h2>{week.stage === 'practice' ? week.title : titles[week.stage]}</h2>
 {parent ? <><button disabled={busy || !pin} onClick={() => run(async () => setParentView(await api(`/assignments/${week.assignmentId}/parent`)))}>View words and forecast</button>{parentView && <><p>{parentView.assignment.words.join(' · ')}</p>{parentView.forecast && <><h3>School-test forecast</h3><ul>{parentView.forecast.probabilities.map(p => <li key={p.word}>{p.word}: {Math.round(p.pCorrect * 100)}%</li>)}</ul><p>{parentView.forecast.uncertainty}</p><p>Missing: {parentView.forecast.missingEvidence.join(', ') || 'None reported'}</p></>}{!parentView.schoolResult && week.stage === 'await_calibration' && <form onSubmit={e => { e.preventDefault(); run(async () => { await api(`/assignments/${week.assignmentId}/school`, { testDate: actualDate, sourceText: JSON.stringify({ parentConfirmed: true, results, actualDate }), results: parentView.assignment.words.map(word => ({ word, correct: results[word] === 'correct', writtenResponse: null })) }); await open(week); await refresh(); }); }}><h3>Enter the returned school test</h3><p>These are your typed marks; no photo is attached. Select the teacher’s mark for every word. Leave this pending if any word was not tested. Never fill missing words as wrong.</p><label>Actual test date<input required type="date" value={actualDate} onChange={e => setActualDate(e.target.value)}/></label>{parentView.assignment.words.map(word => <label key={word}>{word}<select aria-label={word} required value={results[word] || ''} onChange={e => setResults(r => ({ ...r, [word]: e.target.value }))}><option value="">Select teacher’s mark</option><option value="correct">Correct</option><option value="incorrect">Incorrect</option></select></label>)}<button className="primary" disabled={busy}>Confirm school results</button><p>These marks are saved permanently. Corrections require a parent audit; each fact currently permits only one correction.</p></form>}</>}
 </> : item ? <><div className="spelling-progress" aria-label={`Word ${item.index + 1} of ${item.total}`}><span style={{ width: `${100 * item.index / item.total}%` }}/></div><p>Word {item.index + 1} of {item.total}</p>{item.instrument === 'practice' && <><div className="spelling-target">{item.word}</div><p>{item.instruction}</p></>}<button className="spelling-sound" onClick={hear} disabled={speaking || busy}>{speaking ? 'Playing…' : heard ? 'Hear it again' : 'Hear the word'}</button><form onSubmit={e => { e.preventDefault(); if (heard && answer.trim())
                run(() => submit('answered')); }}><label>Your spelling<input autoFocus value={answer} onChange={e => setAnswer(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-label="Your spelling"/></label><button className="primary" disabled={busy || speaking || !heard || !answer.trim()}>Save answer</button><button type="button" disabled={busy || speaking || !heard} onClick={() => run(() => submit('unknown'))}>I’m not sure</button></form><p className="spelling-caption">{item.instrument === 'practice' ? 'This is practice. You can look at the spelling.' : 'The spelling stays hidden. “Not sure” is okay.'}</p></> : ['discovery', 'practice', 'recall_check'].includes(week.stage) ? <><p>{week.completed} of {week.total} answers saved. You can leave and return.</p><button className="primary" disabled={busy} onClick={() => run(present)}>{week.completed ? 'Continue' : 'Start'}</button></> : ['prior', 'plan', 'forecast'].includes(week.stage) ? <><p>{week.stage === 'plan' ? 'Discovery is saved. Sunny can now prepare practice from your answers.' : week.stage === 'forecast' ? 'Your recall check is saved. Sunny can now prepare a forecast for your parent.' : 'Sunny prepares its predictions before hearing your answers.'}</p><button className="primary" disabled={busy} onClick={() => run(async () => { setWeek(await api(`/assignments/${week.assignmentId}/advance`, {})); await refresh(); })}>Prepare next step</button></> : <><div className="spelling-finish">✦</div><h3>All done for now</h3><p>Your work is saved. The next piece is the school test result, which your parent can add later.</p><button className="primary" onClick={leave}>Back to my journey</button></>}
 </section>}
 <footer>Discovery → Practice → Recall → School result</footer></section></main>;
}
