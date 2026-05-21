#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetUrl =
  process.env.SUNNY_SHOWROOM_URL ??
  "http://127.0.0.1:5173/dbz-preview.html?showroomTheme=crystal";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(__dirname, "../test-artifacts/showroom-video-chat-flicker-lab", stamp);
const headless = process.env.SUNNY_SHOWROOM_LAB_HEADLESS !== "false";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless });
const page = await browser.newPage({
  viewport: { width: 2048, height: 1018 },
  deviceScaleFactor: 1,
});
const consoleLines = [];

page.on("console", (message) => {
  const text = message.text();
  if (
    text.includes("[showroom-lab]") ||
    text.includes("[showroom-video-chat]") ||
    text.includes("[CompanionMotor] [animate]")
  ) {
    consoleLines.push({
      type: message.type(),
      text,
      at: new Date().toISOString(),
    });
  }
});

await page.addInitScript(() => {
  const metrics = [];
  const marks = {};
  const recorded = new Set();
  const lab = {
    metrics,
    marks,
    mark(name) {
      marks[name] = performance.now();
      console.log(`🎮 [showroom-lab] mark ${name}`);
    },
    recordMetric(name, value, extra = {}) {
      metrics.push({ name, value, roundedMs: Math.round(value), extra });
      console.log(`🎮 [showroom-lab] metric ${name}=${Math.round(value)}ms`);
    },
    recordMetricOnce(name, value, extra = {}) {
      if (recorded.has(name)) return;
      recorded.add(name);
      this.recordMetric(name, value, extra);
    },
  };
  window.__sunnyShowroomLab = lab;

  const makeCameraStream = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const draw = () => {
      if (ctx) {
        const hue = (frame * 3) % 360;
        ctx.fillStyle = `hsl(${hue}, 70%, 24%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(255,255,255,0.86)";
        ctx.beginPath();
        ctx.arc(320 + Math.sin(frame / 12) * 56, 180, 62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.font = "700 28px sans-serif";
        ctx.fillText("Sunny video lab", 206, 310);
      }
      frame += 1;
      requestAnimationFrame(draw);
    };
    draw();
    if (typeof canvas.captureStream === "function") {
      return canvas.captureStream(15);
    }
    return new MediaStream();
  };

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => {
        lab.mark("camera_live");
        return makeCameraStream();
      },
    },
  });

  let recognitionStarts = 0;
  class MockSpeechRecognition {
    constructor() {
      this.lang = "en-US";
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
    }

    start() {
      recognitionStarts += 1;
      lab.mark("listening_started");
      if (lab.marks.video_clicked) {
        lab.recordMetricOnce(
          "click_to_listening_ms",
          performance.now() - lab.marks.video_clicked,
          { recognitionStarts },
        );
      }
      window.setTimeout(() => {
        if (recognitionStarts === 1) {
          lab.mark("question_submitted");
          this.onresult?.({
            results: [[{ transcript: "Can you help me practice spelling?" }]],
          });
        }
        this.onend?.();
      }, 260);
    }

    abort() {
      this.onend?.();
    }
  }

  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: MockSpeechRecognition,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    value: MockSpeechRecognition,
  });

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    if (url.includes("/api/companions/") && url.includes("/talk")) {
      lab.mark("talk_request");
      await new Promise((resolve) => window.setTimeout(resolve, 240));
      lab.mark("talk_response");
      if (lab.marks.talk_request) {
        lab.recordMetricOnce(
          "ask_to_response_ms",
          performance.now() - lab.marks.talk_request,
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          text: "I am here with you. Keep your shoulders loose and try one brave word.",
          audioBase64: btoa("sunny-mock-audio"),
          audioContentType: "audio/mpeg",
          phaseCommands: {
            speaking: {
              apiVersion: "1.0",
              type: "animate",
              childId: "showroom",
              timestamp: Date.now(),
              source: "claude",
              payload: { animation: "talking", loop: true },
            },
            idle: {
              apiVersion: "1.0",
              type: "animate",
              childId: "showroom",
              timestamp: Date.now() + 1,
              source: "claude",
              payload: { animation: "idle", loop: true },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return realFetch(input, init);
  };

  class MockAudio extends EventTarget {
    constructor(src) {
      super();
      this.src = src;
      this.currentTime = 0;
    }

    play() {
      lab.mark("audio_play");
      window.setTimeout(() => {
        lab.mark("audio_end");
        this.dispatchEvent(new Event("ended"));
      }, 520);
      return Promise.resolve();
    }

    pause() {}
  }

  class MockAudioContext {
    constructor() {
      this.destination = {};
      this.state = "running";
    }

    createMediaElementSource() {
      return { connect: () => undefined };
    }

    createAnalyser() {
      return {
        fftSize: 2048,
        frequencyBinCount: 32,
        connect: () => undefined,
        getByteFrequencyData: (array) => {
          for (let index = 0; index < array.length; index += 1) {
            array[index] = index % 2 === 0 ? 72 : 18;
          }
        },
      };
    }

    resume() {
      return Promise.resolve();
    }

    close() {
      return Promise.resolve();
    }
  }

  Object.defineProperty(window, "Audio", {
    configurable: true,
    value: MockAudio,
  });
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: MockAudioContext,
  });
  Object.defineProperty(window, "webkitAudioContext", {
    configurable: true,
    value: MockAudioContext,
  });

  const observePhase = () => {
    const observer = new MutationObserver(() => {
      if (!lab.marks.audio_end) return;
      const text = document.body?.innerText ?? "";
      if (text.includes("Ready") || text.includes("is listening")) {
        lab.recordMetricOnce(
          "audio_end_to_idle_ms",
          performance.now() - lab.marks.audio_end,
          { phaseText: text.includes("is listening") ? "listening" : "ready" },
        );
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  if (document.body) {
    observePhase();
  } else {
    document.addEventListener("DOMContentLoaded", observePhase, { once: true });
  }
});

async function screenshot(name) {
  const path = resolve(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('[data-showroom-theme="crystal"]', { timeout: 20_000 });
  await page
    .waitForFunction(
      () => {
        const button = document.querySelector('button[aria-label="Video Chat"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      { timeout: 15_000 },
    )
    .catch(async () => {
      console.log(
        "🎮 [showroom-lab] opening curtain stayed active in headless; bypassing for lab run",
      );
      await page.addStyleTag({
        content:
          '[role="status"][aria-live="polite"] { display: none !important; pointer-events: none !important; }',
      });
      await page.evaluate(() => {
        const button = document.querySelector('button[aria-label="Video Chat"]');
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
          button.removeAttribute("disabled");
        }
      });
    });
  await screenshot("01-crystal-before-video-chat");

  await page.evaluate(() => window.__sunnyShowroomLab?.mark("video_clicked"));
  await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Video Chat"]');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Video Chat button not found");
    }
    button.disabled = false;
    button.removeAttribute("disabled");
    button.click();
  });
  await page.waitForSelector('video[aria-label="Child camera preview"]', {
    timeout: 20_000,
  });
  await screenshot("02-video-chat-open");

  await page
    .waitForFunction(
      () =>
        window.__sunnyShowroomLab?.metrics?.some(
          (metric) => metric.name === "ask_to_response_ms",
        ),
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await screenshot("03-after-mocked-response");

  await page
    .waitForFunction(
      () =>
        window.__sunnyShowroomLab?.metrics?.some(
          (metric) => metric.name === "audio_end_to_idle_ms",
        ),
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  await screenshot("04-after-audio-end");

  const metrics = await page.evaluate(() => window.__sunnyShowroomLab?.metrics ?? []);
  const summary = {
    targetUrl,
    outDir,
    screenshots: [
      "01-crystal-before-video-chat.png",
      "02-video-chat-open.png",
      "03-after-mocked-response.png",
      "04-after-audio-end.png",
    ],
    metrics,
    consoleLines,
    animationPlayCount: consoleLines.filter((line) =>
      line.text.includes('[animate] [play]'),
    ).length,
    animationSkipCount: consoleLines.filter((line) =>
      line.text.includes("[skip] already playing"),
    ).length,
  };
  await writeFile(
    resolve(outDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  console.log(`🎮 [showroom-lab] wrote ${resolve(outDir, "summary.json")}`);
} finally {
  await browser.close();
}
