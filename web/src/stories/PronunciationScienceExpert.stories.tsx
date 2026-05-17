import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  PronunciationScienceExpertPanel,
  type ExpertPronunciationResult,
  type ProviderStatus,
  type ProviderComparison,
} from "../storybook/PronunciationScienceExpertPanel";

const flowState: ExpertPronunciationResult["flowState"] = {
  timeOnTask_ms: 42_000,
  bestStreak: 6,
  heatReached: true,
  comboReached: false,
  retries: 3,
  missToHitRecoveries: 2,
  idleEvents: 0,
  pauseRequests: 1,
  replayRequests: 1,
  powerBarSurvival_ms: 42_000,
  abandoned: false,
};

const aheadResults: ExpertPronunciationResult[] = [
  {
    targetWord: "ahead",
    spokenTranscript: "ahead",
    provider: "azure",
    wordScore: 62,
    phonemeScores: [
      { phoneme: "ah", score: 92, position: "initial" },
      { phoneme: "h", score: 28, position: "medial" },
      { phoneme: "eh", score: 61, position: "medial" },
      { phoneme: "d", score: 88, position: "final" },
    ],
    omissions: ["h"],
    insertions: [],
    substitutions: [],
    wilsonSignals: [
      "medial_sound_confusion",
      "segmentation",
      "vowel_confusion",
      "recovery_after_model",
      "high_frequency_word_recognition",
    ],
    confidence: 0.62,
    flowState,
  },
  {
    targetWord: "ahead",
    spokenTranscript: "ahead",
    provider: "speechace",
    wordScore: 58,
    phonemeScores: [
      { phoneme: "ah", score: 90, position: "initial" },
      { phoneme: "h", score: 20, position: "medial", soundMostLike: "d" },
      { phoneme: "eh", score: 64, position: "medial" },
      { phoneme: "d", score: 88, position: "final" },
    ],
    omissions: ["h"],
    insertions: [],
    substitutions: [{ expected: "h", actual: "d", position: "medial" }],
    wilsonSignals: [
      "medial_sound_confusion",
      "segmentation",
      "vowel_confusion",
      "recovery_after_model",
      "high_frequency_word_recognition",
    ],
    confidence: 0.58,
    flowState,
  },
];

const comparisons: ProviderComparison[] = [
  {
    targetWord: "ahead",
    agreement: "agree",
    clearestProvider: "speechace",
    reason:
      "Both providers flagged medial-sound and segmentation risk; Speechace exposed sound_most_like for /h/.",
  },
];

type CompareResponse = {
  ok?: boolean;
  error?: string;
  results?: ExpertPronunciationResult[];
  comparisons?: ProviderComparison[];
  providerStatuses?: ProviderStatus[];
};

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function downsample(buffer: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return buffer;
  const ratio = sourceRate / targetRate;
  const length = Math.round(buffer.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), buffer.length);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += buffer[j] ?? 0;
      count += 1;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

async function recordWavClip(durationMs: number): Promise<{ audioBase64: string; mimeType: string }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("AudioContext unavailable");
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(audioContext.destination);
  await new Promise((resolve) => window.setTimeout(resolve, durationMs));
  processor.disconnect();
  source.disconnect();
  stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const sampleRate = 16_000;
  const wav = encodeWav(downsample(merged, audioContext.sampleRate, sampleRate), sampleRate);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(wav);
  });
  return {
    audioBase64: dataUrl.split(",")[1] ?? "",
    mimeType: "audio/wav",
  };
}

function LiveComparisonFixture(): React.ReactElement {
  const [results, setResults] = useState(aheadResults);
  const [liveComparisons, setLiveComparisons] = useState(comparisons);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [status, setStatus] = useState("Ready. Say \"ahead\" after clicking record.");
  const [busy, setBusy] = useState(false);

  const runLiveCompare = async () => {
    setBusy(true);
    setStatus("Recording 2.5 seconds. Say: ahead.");
    try {
      const clip = await recordWavClip(2500);
      setStatus("Sending clip to Sunny server for Azure + Speechace comparison.");
      const response = await fetch("http://localhost:3001/api/pronunciation-science/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetWord: "ahead",
          audioClipId: `storybook-ahead-${Date.now()}`,
          ...clip,
        }),
      });
      const data = await response.json() as CompareResponse;
      if (!response.ok || data.ok === false) throw new Error(data.error ?? `compare failed ${response.status}`);
      setResults(data.results?.length ? data.results : aheadResults);
      setLiveComparisons(data.comparisons?.length ? data.comparisons : []);
      setProviderStatuses(data.providerStatuses ?? []);
      setStatus("Live comparison complete.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Live comparison failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PronunciationScienceExpertPanel
      results={results}
      comparisons={liveComparisons}
      providerStatuses={providerStatuses}
      onLiveCompare={runLiveCompare}
      liveCompareStatus={status}
      liveCompareDisabled={busy}
    />
  );
}

const meta: Meta = {
  title: "Expert Review/Pronunciation Science",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const AheadProviderComparison: Story = {
  render: () => (
    <PronunciationScienceExpertPanel
      results={aheadResults}
      comparisons={comparisons}
    />
  ),
};

export const LiveApiComparison: Story = {
  render: () => <LiveComparisonFixture />,
};
