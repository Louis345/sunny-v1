import { useState, useRef, useCallback, useEffect } from "react";

// --- Types ---

interface CompanionConfig {
  childName: string;
  companionName: string;
  emoji: string;
  voiceId: string;
  openingLine: string;
  goodbye: string;
}

interface RewardEvent {
  rewardStyle: "flash" | "takeover" | "none";
  svg?: string;
  label?: string;
  displayDuration_ms: number;
}

interface CanvasState {
  mode: "idle" | "teaching" | "reward" | "riddle" | "championship";
  svg?: string;
  label?: string;
  content?: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
}

type SessionPhase = "picker" | "connecting" | "active" | "ended";

interface SessionState {
  phase: SessionPhase;
  childName: string | null;
  companion: CompanionConfig | null;
  companionText: string;
  interimTranscript: string;
  canvas: CanvasState;
  correctStreak: number;
  sessionPhase: string;
  reward: RewardEvent | null;
  error: string | null;
}

export function useSession() {
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);

  const [state, setState] = useState<SessionState>({
    phase: "picker",
    childName: null,
    companion: null,
    companionText: "",
    interimTranscript: "",
    canvas: { mode: "idle" },
    correctStreak: 0,
    sessionPhase: "warmup",
    reward: null,
    error: null,
  });

  // --- Refs for handler to avoid stale closure ---
  const setStateRef = useRef(setState);
  setStateRef.current = setState;

  const sendMessageRef = useRef<(type: string, payload?: Record<string, unknown>) => void>(() => {});
  const stopMicRef = useRef<() => void>(() => {});

  // --- WebSocket connection ---

  const sendMessage = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...payload }));
    }
  }, []);

  sendMessageRef.current = sendMessage;

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg, setStateRef, stopMicRef);
    };

    ws.onerror = () => {
      setStateRef.current((s) => ({ ...s, error: "Connection lost" }));
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  }, []);

  // --- Handle server messages ---

  function handleServerMessage(
    msg: Record<string, unknown>,
    setStateRef: React.MutableRefObject<typeof setState>,
    stopMicRef: React.MutableRefObject<() => void>
  ) {
    switch (msg.type) {
      case "session_started": {
        const m = msg as Record<string, string>;
        setStateRef.current((s) => ({
          ...s,
          phase: "active",
          childName: m.childName ?? m.child ?? "",
          companion: {
            childName: m.childName ?? m.child ?? "",
            companionName: m.companionName ?? m.companion ?? "",
            emoji: m.emoji ?? "🌟",
            voiceId: m.voiceId ?? "",
            openingLine: m.openingLine ?? "",
            goodbye: m.goodbye ?? "",
          },
        }));
        break;
      }

      case "interim":
        setStateRef.current((s) => ({ ...s, interimTranscript: (msg.text as string) ?? "" }));
        break;

      case "final":
        setStateRef.current((s) => ({
          ...s,
          interimTranscript: "",
          companionText: "",
        }));
        break;

      case "response_text":
        setStateRef.current((s) => ({
          ...s,
          companionText: s.companionText + ((msg.chunk as string) ?? ""),
        }));
        break;

      case "audio": {
        const audioData = base64ToArrayBuffer((msg.data as string) ?? "");
        audioQueueRef.current.push(audioData);
        if (!isPlayingRef.current) {
          playNextChunk();
        }
        break;
      }

      case "audio_done":
        break;

      case "tool_call": {
        const tool = msg.tool as string;
        const args = (msg.args ?? {}) as Record<string, unknown>;
        const result = msg.result as Record<string, unknown> | undefined;

        if (tool === "showCanvas" && result) {
          const mode = result.mode as CanvasState["mode"];
          const validModes: CanvasState["mode"][] = [
            "idle",
            "teaching",
            "reward",
            "riddle",
            "championship",
          ];
          setStateRef.current((s) => ({
            ...s,
            canvas: {
              mode: mode && validModes.includes(mode) ? mode : "idle",
              svg: result.svg as string | undefined,
              label: result.label as string | undefined,
              content: result.content as string | undefined,
              phonemeBoxes: result.phonemeBoxes as CanvasState["phonemeBoxes"],
            },
          }));
        }
        if (tool === "logAttempt") {
          const correct = args.correct === true;
          setStateRef.current((s) => ({
            ...s,
            correctStreak: correct ? s.correctStreak + 1 : 0,
          }));
        }
        break;
      }

      case "reward": {
        const m = msg as unknown as RewardEvent & { displayDuration_ms?: number };
        setStateRef.current((s) => ({ ...s, reward: m }));
        setTimeout(() => {
          setStateRef.current((s) => ({ ...s, reward: null }));
        }, m.displayDuration_ms ?? 3000);
        break;
      }

      case "phase":
        setStateRef.current((s) => ({
          ...s,
          sessionPhase: (msg.phase as string) ?? s.sessionPhase,
          companionText: "",
        }));
        break;

      case "session_ended":
        setStateRef.current((s) => ({ ...s, phase: "ended" }));
        stopMicRef.current();
        break;

      case "error":
        setStateRef.current((s) => ({ ...s, error: (msg.message as string) ?? "Unknown error" }));
        break;
    }
  }

  // --- Audio: Mic (browser → server) ---

  const startMic = useCallback(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        mediaStreamRef.current = stream;
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        const silence = audioCtx.createGain();
        silence.gain.value = 0;

        processor.onaudioprocess = (e) => {
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
          }
          const base64 = arrayBufferToBase64(int16.buffer);
          sendMessageRef.current("audio", { data: base64 });
        };

        source.connect(processor);
        processor.connect(silence);
        silence.connect(audioCtx.destination);
      } catch (err) {
        console.error("Mic access failed:", err);
        setStateRef.current((s) => ({ ...s, error: "Microphone access denied" }));
      }
    })();
  }, []);

  const stopMic = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  stopMicRef.current = stopMic;

  // --- Audio: Speaker (server → browser) ---

  async function playNextChunk() {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioBuffer = await audioContextRef.current.decodeAudioData(chunk.slice(0));
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => playNextChunk();
      source.start();
    } catch (err) {
      console.error("Audio playback error:", err);
      isPlayingRef.current = false;
      playNextChunk();
    }
  }

  // --- Actions ---

  const startSession = useCallback(
    (childName: string) => {
      setState((s) => ({ ...s, phase: "connecting", error: null }));
      connect();

      let timeoutId: ReturnType<typeof setTimeout>;
      const check = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          clearInterval(check);
          clearTimeout(timeoutId);
          sendMessage("start_session", { child: childName });
          startMic();
        }
      }, 100);

      timeoutId = setTimeout(() => {
        clearInterval(check);
        setStateRef.current((s) => ({
          ...s,
          error: "Connection timeout",
          phase: "picker",
        }));
      }, 10000);
    },
    [connect, sendMessage, startMic]
  );

  const bargeIn = useCallback(() => {
    sendMessage("barge_in");
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, [sendMessage]);

  const endSession = useCallback(() => {
    sendMessage("end_session");
  }, [sendMessage]);

  const resetToPicker = useCallback(() => {
    setState({
      phase: "picker",
      childName: null,
      companion: null,
      companionText: "",
      interimTranscript: "",
      canvas: { mode: "idle" },
      correctStreak: 0,
      sessionPhase: "warmup",
      reward: null,
      error: null,
    });
    wsRef.current?.close();
    wsRef.current = null;
    stopMic();
  }, [stopMic]);

  useEffect(() => {
    return () => {
      stopMic();
      wsRef.current?.close();
    };
  }, [stopMic]);

  return {
    state,
    startSession,
    bargeIn,
    endSession,
    resetToPicker,
  };
}

// --- Helpers ---

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
