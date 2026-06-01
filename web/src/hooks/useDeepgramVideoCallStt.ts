import { useCallback, useEffect, useRef, useState } from "react";
import { flushBufferIfUnmuted } from "../../../src/shared/flushBuffer";

type VideoCallSttStatus = "idle" | "connecting" | "listening" | "blocked" | "error";

type StartVideoCallSttInput = {
  childName: "Ila" | "Reina";
  chartChildId: string;
};

type UseDeepgramVideoCallSttInput = {
  assistantAudioPlaying: boolean;
  onFinalTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onBargeIn?: () => void;
  onError?: (message: string) => void;
};

type DeepgramVideoCallSttHandle = {
  status: VideoCallSttStatus;
  supported: boolean;
  start: (input: StartVideoCallSttInput) => Promise<void>;
  stop: () => void;
};

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const BARGE_IN_RMS_THRESHOLD = 0.045;
const BARGE_IN_CONSECUTIVE_FRAMES = 2;
const VIDEO_CALL_STT_CONNECTION_MESSAGE =
  "Voice connection is having trouble. You can still type.";

export function useDeepgramVideoCallStt(
  input: UseDeepgramVideoCallSttInput,
): DeepgramVideoCallSttHandle {
  const [status, setStatus] = useState<VideoCallSttStatus>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const rollingBufferRef = useRef<string[]>([]);
  const bargeInFramesRef = useRef(0);
  const assistantAudioPlayingRef = useRef(input.assistantAudioPlaying);
  const onFinalTranscriptRef = useRef(input.onFinalTranscript);
  const onInterimTranscriptRef = useRef(input.onInterimTranscript);
  const onBargeInRef = useRef(input.onBargeIn);
  const onErrorRef = useRef(input.onError);

  useEffect(() => {
    assistantAudioPlayingRef.current = input.assistantAudioPlaying;
    onFinalTranscriptRef.current = input.onFinalTranscript;
    onInterimTranscriptRef.current = input.onInterimTranscript;
    onBargeInRef.current = input.onBargeIn;
    onErrorRef.current = input.onError;
  }, [
    input.assistantAudioPlaying,
    input.onBargeIn,
    input.onError,
    input.onFinalTranscript,
    input.onInterimTranscript,
  ]);

  const sendMessage = useCallback((type: string, payload?: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, ...(payload ?? {}) }));
  }, []);

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch((err: unknown) => {
        console.warn(" 🎮 [deepgram-video-call-stt] audio_context_close_failed", err);
      });
      audioContextRef.current = null;
    }
    rollingBufferRef.current = [];
    bargeInFramesRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    stopMic();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end_session" }));
      ws.close();
    } else if (ws) {
      ws.close();
    }
    wsRef.current = null;
    setStatus("idle");
    console.log(" 🎮 [deepgram-video-call-stt] [stop] [ok]");
  }, [stopMic]);

  const startMic = useCallback(async () => {
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
    const AudioContextCtor =
      window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("audio_context_unavailable");
    }
    const audioContext = new AudioContextCtor({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    const silence = audioContext.createGain();
    silence.gain.value = 0;
    processor.onaudioprocess = (event) => {
      const float32 = event.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i += 1) {
        int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
      }
      const base64 = arrayBufferToBase64(int16.buffer);
      rollingBufferRef.current.push(base64);
      if (rollingBufferRef.current.length > 4) {
        rollingBufferRef.current.shift();
      }

      if (assistantAudioPlayingRef.current) {
        let sum = 0;
        for (let i = 0; i < float32.length; i += 1) {
          sum += float32[i] * float32[i];
        }
        const rms = Math.sqrt(sum / float32.length);
        if (rms > BARGE_IN_RMS_THRESHOLD) {
          bargeInFramesRef.current += 1;
          if (bargeInFramesRef.current >= BARGE_IN_CONSECUTIVE_FRAMES) {
            console.log(" 🎮 [deepgram-video-call-stt] [barge_in] [detected]");
            sendMessage("barge_in");
            onBargeInRef.current?.();
            flushBufferIfUnmuted(rollingBufferRef.current, false, sendMessage);
            rollingBufferRef.current = [];
            bargeInFramesRef.current = 0;
          }
        } else {
          bargeInFramesRef.current = 0;
        }
        return;
      }

      bargeInFramesRef.current = 0;
      sendMessage("audio", { data: base64 });
    };
    source.connect(processor);
    processor.connect(silence);
    silence.connect(audioContext.destination);
    console.log(" 🎮 [deepgram-video-call-stt] [mic] [listening]");
  }, [sendMessage]);

  const start = useCallback(
    async ({ childName, chartChildId }: StartVideoCallSttInput) => {
      if (!navigator.mediaDevices?.getUserMedia || typeof WebSocket === "undefined") {
        setStatus("blocked");
        onErrorRef.current?.("Always-listening voice is not available in this browser.");
        console.warn(" 🎮 [deepgram-video-call-stt] [start] [blocked]");
        return;
      }
      stop();
      setStatus("connecting");
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = ws;
        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error("deepgram_video_call_ws_error"));
        });
        sendMessage("start_session", {
          child: childName,
          chartChildId,
          silentTts: true,
          sttOnly: true,
        });
        await startMic();
        setStatus("listening");
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data) as Record<string, unknown>;
          if (message.type === "interim") {
            const text = typeof message.text === "string" ? message.text.trim() : "";
            if (text) onInterimTranscriptRef.current?.(text);
            return;
          }
          if (message.type === "final") {
            const text = typeof message.text === "string" ? message.text.trim() : "";
            if (text) onFinalTranscriptRef.current(text);
            return;
          }
          if (message.type === "error") {
            const text = typeof message.message === "string" ? message.message : "STT error";
            onErrorRef.current?.(text);
            setStatus("error");
          }
        };
        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
            setStatus("idle");
          }
        };
        console.log(" 🎮 [deepgram-video-call-stt] [start] [ok]");
      } catch (err: unknown) {
        stopMic();
        const message = err instanceof Error ? err.message : String(err);
        setStatus("error");
        onErrorRef.current?.(
          message === "deepgram_video_call_ws_error"
            ? VIDEO_CALL_STT_CONNECTION_MESSAGE
            : message,
        );
        console.warn(" 🎮 [deepgram-video-call-stt] [start] [error]", message);
      }
    },
    [sendMessage, startMic, stop, stopMic],
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    status,
    supported:
      typeof WebSocket !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    start,
    stop,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
