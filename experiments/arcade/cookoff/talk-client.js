// CompanionTalk: "Hey Elli" inside a game (trial, 11/11). Shared by every 3D game; the game supplies the companion, the live state and the animation hooks.
// Say her name (or tap her) → she turns and listens → the question goes to /talk with the game state → her answer comes back in her voice.
// After she answers, a follow-up within a few seconds needs no name.
(function () {
  const log = (...a) => console.log(' 🎮 [companion-talk]', ...a);
  const WAKE_MS = 9000, FOLLOW_MS = 7000, GUARD = 40;   // GUARD: max questions per page, a runaway-loop stop (Law 2)

  function start(o) {
    let awakeUntil = 0, busy = false, utter = '', asked = 0, ws = null, rec = null, stream = null, stopped = false, reconnects = 0;
    const history = [];   // this companion's conversation on this page only
    const names = o.names.map(n => n.toLowerCase());
    const wakeRe = new RegExp(`\\b(?:hey|hi|okay|ok|yo)?[\\s,.!]*(${names.join('|')})\\b[\\s,.!?]*`, 'i');
    const awake = () => Date.now() < awakeUntil;

    function wake(how) {
      if (busy) return; const was = awake(); awakeUntil = Date.now() + WAKE_MS;
      if (!was) { log('[wake]', how); try { o.onWake?.(how); } catch (e) { console.error(' 🎮 [companion-talk] [onWake] [failed]', e); } }
    }
    function sleep() { awakeUntil = 0; utter = ''; try { o.onSleep?.(); } catch (e) { console.error(' 🎮 [companion-talk] [onSleep] [failed]', e); } }

    async function ask(text) {
      if (busy) return; if (++asked > GUARD) { log('[ask] [guard-stop]', asked); return; }
      busy = true; utter = ''; awakeUntil = 0; log('[ask]', JSON.stringify(text));
      try { o.onThinking?.(text); } catch (e) { console.error(' 🎮 [companion-talk] [onThinking] [failed]', e); }
      try {
        const r = await fetch('/talk', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ child: o.child, childName: o.childName, companion: o.companion, text, context: o.getContext(), history }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
        history.push({ child: text, reply: j.reply }); log('[reply]', JSON.stringify(j.reply), j.ms);
        const bytes = Uint8Array.from(atob(j.audio), c => c.charCodeAt(0)).buffer;
        await o.onReply({ text: j.reply, heard: text, audio: bytes });
        awakeUntil = Date.now() + FOLLOW_MS; try { o.onFollowUp?.(); } catch (e) { console.error(' 🎮 [companion-talk] [onFollowUp] [failed]', e); }
      } catch (e) { console.error(' 🎮 [companion-talk] [ask] [failed]', e); try { o.onError?.(e); } catch (e2) { console.error(' 🎮 [companion-talk] [onError] [failed]', e2); } sleep(); }
      finally { busy = false; }
    }

    // a finished utterance: strip her name; ask if there is a question, otherwise stay listening
    function finish() {
      const said = utter.trim(); utter = ''; if (!said || busy) return;
      const m = said.match(wakeRe); const rest = (m ? said.slice(m.index + m[0].length) : said).trim();
      if (m) wake('voice');
      if (awake() && rest.replace(/[^a-z0-9]/gi, '').length >= 2) ask(rest);
      else if (awake()) log('[heard] [name-only]', JSON.stringify(said));
    }

    function onMessage(ev) {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (busy || o.isSpeaking?.()) return;   // never answer her own voice
      if (m.type === 'UtteranceEnd') return finish();
      if (m.type !== 'Results') return;
      const t = m.channel?.alternatives?.[0]?.transcript ?? ''; if (!t) return;
      if (!awake() && wakeRe.test(t)) wake('voice');   // interim match: turn to her right away
      if (m.is_final) { utter += ' ' + t; if (m.speech_final) finish(); }
    }

    async function listen() {
      if (stopped) return;
      try {
        stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const q = new URLSearchParams(); o.names.slice(0, 3).forEach(n => q.append('keyterm', n));
        ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/listen?${q}`);
        ws.onmessage = onMessage;
        ws.onopen = () => { reconnects = 0; rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' }); rec.ondataavailable = e => { if (e.data.size && ws?.readyState === 1) ws.send(e.data); }; rec.start(250); log('[listen] [on]'); o.onListening?.(true); };
        ws.onclose = () => { try { rec?.state !== 'inactive' && rec?.stop(); } catch (e) { console.warn(' 🎮 [companion-talk] [recorder] [stop-failed]', e); } o.onListening?.(false);
          if (!stopped && ++reconnects <= 5) { log('[listen] [reconnect]', reconnects); setTimeout(listen, 1500 * reconnects); } else if (!stopped) log('[listen] [gave-up] tap still works'); };
        ws.onerror = e => console.warn(' 🎮 [companion-talk] [listen] [socket-error]', e.type);
      } catch (e) { console.warn(' 🎮 [companion-talk] [mic] [unavailable] tap still works', e.message); o.onListening?.(false); }
    }
    listen();

    return {
      wake: () => wake('tap'),
      ask,   // for tests: ask without a microphone
      stop() { stopped = true; try { ws?.close(); } catch (e) { console.warn(' 🎮 [companion-talk] [stop] [failed]', e); } stream?.getTracks().forEach(t => t.stop()); },
      get awake() { return awake(); }, get busy() { return busy; },
    };
  }
  window.CompanionTalk = { start };
})();
