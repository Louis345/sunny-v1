/**
 * Client side of the streaming companion talk pipeline: POSTs to
 * /api/companions/:id/talk/stream, parses SSE frames from the response body,
 * and schedules PCM audio chunks gaplessly on an AudioContext so speech starts
 * on the first chunk instead of after the full file.
 */

export class CompanionTalkStreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanionTalkStreamUnavailableError";
  }
}

export class CompanionTalkStreamFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanionTalkStreamFailedError";
  }
}

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function getCompanionTalkAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
}

export function isCompanionTalkStreamSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof ReadableStream !== "undefined" &&
    typeof TextDecoder !== "undefined" &&
    Boolean(getCompanionTalkAudioContextCtor())
  );
}

export function isCompanionTalkStreamDisabledByQuery(
  search = typeof window !== "undefined" ? window.location.search : "",
): boolean {
  try {
    return new URLSearchParams(search).get("companionStream") === "off";
  } catch {
    return false;
  }
}

type SseFrame = { event: string; data: Record<string, unknown> };

export function parseCompanionTalkSseChunk(
  buffer: string,
): { frames: SseFrame[]; remainder: string } {
  const frames: SseFrame[] = [];
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() ?? "";
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    let event = "";
    let dataRaw = "";
    for (const line of trimmed.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice("event: ".length).trim();
      else if (line.startsWith("data: ")) dataRaw += line.slice("data: ".length);
    }
    if (!event) continue;
    let data: Record<string, unknown> = {};
    if (dataRaw) {
      try {
        data = JSON.parse(dataRaw) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    frames.push({ event, data });
  }
  return { frames, remainder };
}

export function pcm16Base64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const sampleCount = binary.length >> 1;
  const samples = new Float32Array(new ArrayBuffer(sampleCount * 4));
  for (let i = 0; i < sampleCount; i++) {
    const low = binary.charCodeAt(i * 2);
    const high = binary.charCodeAt(i * 2 + 1);
    let value = (high << 8) | low;
    if (value >= 0x8000) value -= 0x10000;
    samples[i] = value / 32768;
  }
  return samples;
}

export type CompanionTalkStreamDoneData = {
  ok?: boolean;
  text?: string;
  companionCommands?: unknown[];
  activityRequests?: unknown[];
  visualSummary?: string;
  latencySpans?: {
    claudeMs?: number;
    toolFollowupMs?: number;
    ttsMs?: number;
    firstTokenMs?: number;
    firstAudioMs?: number;
    requestToResponseMs?: number;
  };
  phaseCommands?: {
    speaking?: unknown;
    idle?: unknown;
  };
};

export type CompanionTalkStreamResult = {
  data: CompanionTalkStreamDoneData;
  hadAudio: boolean;
  /** Resolves once every scheduled audio chunk has finished playing. */
  waitForPlaybackEnd: () => Promise<void>;
  /** Hard-stops playback and aborts any remaining network activity. */
  stop: () => void;
};

const PLAYBACK_LEAD_S = 0.06;
const PLAYBACK_END_SAFETY_MS = 8000;

export async function streamCompanionTalk(opts: {
  url: string;
  payload: unknown;
  context: AudioContext;
  /** Node the PCM sources connect into (e.g. the lip-sync analyser). */
  sink: AudioNode;
  onFirstAudio?: (latencyMs: number) => void;
  onTextDelta?: (delta: string) => void;
}): Promise<CompanionTalkStreamResult> {
  const startedAt = performance.now();
  const abortController = new AbortController();
  let response: Response;
  try {
    response = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.payload),
      signal: abortController.signal,
    });
  } catch (err: unknown) {
    throw new CompanionTalkStreamUnavailableError(
      err instanceof Error ? err.message : "stream_fetch_failed",
    );
  }
  if (!response.ok || !response.body) {
    throw new CompanionTalkStreamUnavailableError(`stream_http_${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    throw new CompanionTalkStreamUnavailableError("stream_wrong_content_type");
  }

  let sampleRate = 24_000;
  let nextStartTime = 0;
  let pendingSources = 0;
  let audioDone = false;
  let stopped = false;
  let hadAudio = false;
  const activeSources = new Set<AudioBufferSourceNode>();

  let resolvePlaybackEnd: () => void = () => undefined;
  const playbackEnded = new Promise<void>((resolve) => {
    resolvePlaybackEnd = resolve;
  });
  const maybeFinishPlayback = () => {
    if ((audioDone || stopped) && pendingSources === 0) resolvePlaybackEnd();
  };

  const scheduleChunk = (base64: string) => {
    if (stopped || !base64) return;
    const samples = pcm16Base64ToFloat32(base64);
    if (samples.length === 0) return;
    const buffer = opts.context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = opts.context.createBufferSource();
    source.buffer = buffer;
    source.connect(opts.sink);
    const startAt = Math.max(opts.context.currentTime + PLAYBACK_LEAD_S, nextStartTime);
    source.start(startAt);
    nextStartTime = startAt + buffer.duration;
    pendingSources += 1;
    activeSources.add(source);
    source.onended = () => {
      activeSources.delete(source);
      pendingSources -= 1;
      maybeFinishPlayback();
    };
    if (!hadAudio) {
      hadAudio = true;
      void opts.context.resume().catch(() => undefined);
      opts.onFirstAudio?.(Math.round(performance.now() - startedAt));
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    abortController.abort();
    for (const source of activeSources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    activeSources.clear();
    pendingSources = 0;
    resolvePlaybackEnd();
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneData: CompanionTalkStreamDoneData | null = null;
  let errorMessage: string | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseCompanionTalkSseChunk(buffer);
      buffer = parsed.remainder;
      for (const frame of parsed.frames) {
        if (frame.event === "meta") {
          const rate = frame.data.pcmSampleRate;
          if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
            sampleRate = rate;
          }
        } else if (frame.event === "text_delta") {
          const delta = frame.data.delta;
          if (typeof delta === "string" && delta) opts.onTextDelta?.(delta);
        } else if (frame.event === "audio") {
          const chunk = frame.data.chunk;
          if (typeof chunk === "string") scheduleChunk(chunk);
        } else if (frame.event === "audio_done") {
          audioDone = true;
          maybeFinishPlayback();
        } else if (frame.event === "error") {
          errorMessage =
            typeof frame.data.error === "string" ? frame.data.error : "stream_error";
        } else if (frame.event === "done") {
          doneData = frame.data as CompanionTalkStreamDoneData;
        }
      }
      if (doneData || errorMessage) break;
    }
  } catch (err: unknown) {
    stop();
    if (hadAudio) {
      throw new CompanionTalkStreamFailedError(
        err instanceof Error ? err.message : "stream_read_failed",
      );
    }
    throw new CompanionTalkStreamUnavailableError(
      err instanceof Error ? err.message : "stream_read_failed",
    );
  }

  if (errorMessage || !doneData || doneData.ok === false) {
    stop();
    const message = errorMessage ?? "stream_missing_done_frame";
    if (hadAudio) throw new CompanionTalkStreamFailedError(message);
    throw new CompanionTalkStreamUnavailableError(message);
  }

  audioDone = true;
  maybeFinishPlayback();

  return {
    data: doneData,
    hadAudio,
    waitForPlaybackEnd: () => {
      const remainingMs =
        Math.max(0, nextStartTime - opts.context.currentTime) * 1000 +
        PLAYBACK_END_SAFETY_MS;
      return Promise.race([
        playbackEnded,
        new Promise<void>((resolve) => {
          setTimeout(resolve, remainingMs);
        }),
      ]);
    },
    stop,
  };
}
