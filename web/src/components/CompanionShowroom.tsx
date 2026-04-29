import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as PointEvt,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { CompanionMotor } from "../companion/CompanionMotor";
import {
  COMPANION_MANIFEST,
  type CompanionManifestEntry,
} from "../companion/companions.generated";
import type {
  CameraAngle,
  CompanionCommand,
} from "../../../src/shared/companions/companionContract";
import { COMPANION_ANIMATION_IDS } from "../../../src/shared/companions/companionContract";
import { COMPANION_CAPABILITIES } from "../../../src/shared/companions/registry";
import { validateCompanionCommand } from "../../../src/shared/companions/validateCompanionCommand";
import { mergeCompanionConfigWithDefaults } from "../../../src/shared/companionTypes";
import { ensurePlaybackAnalyser } from "../utils/audioAnalyser";
import { loadCompanionVrm } from "../utils/loadCompanionVrm";

export type CompanionShowroomProps = {
  /**
   * Called with the chosen companionId when the child confirms their pick.
   * The parent handles navigation / persistence.
   */
  onSelect: (companionId: string) => void;

  /**
   * Returns the intro speech text for a given companion.
   * Currently powers the on-screen subtitle; designed so ElevenLabs TTS
   * (and later Claude streaming) can drop in as the text source without
   * changing this component.
   * Signature is intentionally synchronous — caller pre-fetches if async.
   */
  getText: (companionId: string) => string;

  /**
   * Optional bonus-point values per companion.
   * { [companionId]: number }
   * Displayed on the stats card in the spotlight.
   */
  bonusPoints?: Record<string, number>;

  /**
   * Child's first name for personalised labels ("Pick me, Ila!").
   * Omit for generic labels.
   */
  childName?: string;

  /**
   * When true, use `generatedBackgroundUrl` as the showroom backdrop.
   * When false or when no URL is available, use the built-in stage background.
   */
  useGeneratedBackground?: boolean;

  /**
   * Server-generated image URL, for example from `/api/grok-image`.
   * The component never calls Grok directly so API keys stay server-side.
   */
  generatedBackgroundUrl?: string | null;

  /**
   * Enables soft generated background music after the first user gesture.
   * Browsers block autoplay, so the component starts it on click/key interaction.
   */
  enableBackgroundMusic?: boolean;

  /**
   * True while the parent is asking the server to enrich the stage with a generated image.
   * Used only to pace the intro curtain; failures should set this back to false.
   */
  generatedBackgroundLoading?: boolean;
};

type SlotName = "prev" | "current" | "next" | "hidden";
type CompanionRenderer = WebGPURenderer | THREE.WebGLRenderer;

type CarouselSlot = {
  slot: SlotName;
  entry: CompanionManifestEntry;
};

type ConfettiParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
};

type AmbientMusicHandle = {
  stop: () => void;
};

type SpeakingLine = "intro" | "plead";
type GestureLine = SpeakingLine | "meet";
export type CompanionShowroomGestureProfile = {
  meet?: string;
  intro?: string[];
  plead?: string[];
  specialDance?: string;
};
export type ShowroomSpeechGesturePlan = {
  sequence: string[];
  sustainPrimary: boolean;
  intervalMs: number | null;
};

const AWKWARD_SPEECH_GESTURE_REPLACEMENTS: Readonly<Record<string, string>> = {
  wave: "talking",
  dance_victory: "talking",
  surprise_jump: "talking",
  silly_dancing: "talking",
  hip_hop_dancing: "talking",
  hip_hop_dancing_2: "talking",
  salsa_dancing: "talking",
};

function sanitizeSpeechGesture(animation: string): string {
  return AWKWARD_SPEECH_GESTURE_REPLACEMENTS[animation] ?? animation;
}

export function resolveShowroomGestureSequence(
  profile: CompanionShowroomGestureProfile | null | undefined,
  line: GestureLine,
): string[] {
  if (line === "meet") {
    return [profile?.meet ?? "wave"];
  }

  const fallback = line === "intro" ? ["talking", "think"] : ["talking", "think"];
  const rawSequence =
    profile?.[line] && profile[line]!.length > 0 ? profile[line]! : fallback;
  const seen = new Set<string>();
  const sanitized = rawSequence
    .map((animation) => sanitizeSpeechGesture(animation))
    .filter((animation) => {
      if (seen.has(animation)) return false;
      seen.add(animation);
      return true;
    });

  return sanitized.length > 0 ? sanitized : fallback;
}

export function resolveShowroomSpeechGesturePlan(
  profile: CompanionShowroomGestureProfile | null | undefined,
  line: SpeakingLine,
): ShowroomSpeechGesturePlan {
  const sequence = resolveShowroomGestureSequence(profile, line);
  const primary = sequence[0] ?? "talking";
  if (primary === "talking") {
    return {
      sequence: [primary],
      sustainPrimary: true,
      intervalMs: null,
    };
  }
  return {
    sequence,
    sustainPrimary: false,
    intervalMs: line === "intro" ? 2600 : 2100,
  };
}

export const SHOWROOM_CARD_REVEAL_DELAY_MS = 1400;

export function shouldRunShowroomSlotLoop(
  slot: SlotName,
  active: boolean,
  contained = false,
): boolean {
  if (contained) return true;
  if (slot === "hidden") return false;
  if (slot === "current") return true;
  return active;
}

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const accent = "#6D5EF5";
const confettiColours = ["#6D5EF5", "#a78bfa", "#fbbf24", "#f472b6", "#34d399"];
const SHOWROOM_COMMAND_CHILD_ID = "showroom";
let showroomCommandSequence = 0;
const sparkleSeeds = [
  { left: "9%", top: "18%", delay: "0s", size: 3 },
  { left: "18%", top: "42%", delay: "1.1s", size: 4 },
  { left: "27%", top: "12%", delay: "2.2s", size: 3 },
  { left: "38%", top: "30%", delay: "0.7s", size: 5 },
  { left: "48%", top: "9%", delay: "1.8s", size: 4 },
  { left: "58%", top: "34%", delay: "0.4s", size: 3 },
  { left: "69%", top: "15%", delay: "2.6s", size: 5 },
  { left: "80%", top: "44%", delay: "1.4s", size: 3 },
  { left: "91%", top: "22%", delay: "0.9s", size: 4 },
  { left: "74%", top: "61%", delay: "3.1s", size: 3 },
  { left: "23%", top: "64%", delay: "2.9s", size: 4 },
  { left: "50%", top: "52%", delay: "1.9s", size: 3 },
];

function createShowroomCommand(
  type: string,
  payload: Record<string, unknown>,
): CompanionCommand {
  const cmd = validateCompanionCommand(
    { type, payload },
    COMPANION_CAPABILITIES,
    { childId: SHOWROOM_COMMAND_CHILD_ID, source: "diag" },
  );
  if (!cmd) {
    throw new Error(`CompanionShowroom invalid ${type} command`);
  }
  return {
    ...cmd,
    // CompanionMotor de-dupes by timestamp/type/child/source. Keep rapid showroom
    // gesture bursts distinct even if they happen within the same millisecond.
    timestamp: cmd.timestamp * 1000 + showroomCommandSequence++,
  };
}

export function createShowroomAnimateCommand(
  animation: string,
  opts: { loop?: boolean } = {},
): CompanionCommand {
  return createShowroomCommand("animate", {
    animation,
    ...(opts.loop === undefined ? {} : { loop: opts.loop }),
  });
}

export function createShowroomCameraCommand(
  angle: CameraAngle,
  transitionMs?: number,
): CompanionCommand {
  return createShowroomCommand("camera", {
    angle,
    ...(transitionMs === undefined ? {} : { transition_ms: transitionMs }),
  });
}

function processShowroomCommand(
  motor: CompanionMotor | null | undefined,
  cmd: CompanionCommand,
): void {
  motor?.processCompanionCommands([cmd], SHOWROOM_COMMAND_CHILD_ID);
}

function isWebGpuRenderer(renderer: CompanionRenderer): renderer is WebGPURenderer {
  return "isWebGPURenderer" in renderer && renderer.isWebGPURenderer === true;
}

function resolveModelUrl(vrmUrl: string): string {
  if (vrmUrl.startsWith("http://") || vrmUrl.startsWith("https://")) {
    return vrmUrl;
  }
  if (typeof window === "undefined") {
    return vrmUrl;
  }
  return `${window.location.origin}${vrmUrl.startsWith("/") ? "" : "/"}${vrmUrl}`;
}

function createSlotEntries(
  entries: CompanionManifestEntry[],
  currentIndex: number,
): CarouselSlot[] {
  if (entries.length === 0) return [];
  if (entries.length === 1) {
    return [{ slot: "current", entry: entries[0] }];
  }

  /**
   * With two companions, prev and next in a 3-up carousel would be the *same* entry,
   * so we show a single "preview" flank (the next in list) — the character you'll get
   * from the right-arrow / swipe left-to-right transition.
   */
  if (entries.length === 2) {
    const other = entries[(currentIndex + 1) % 2];
    return [
      { slot: "next", entry: other },
      { slot: "current", entry: entries[currentIndex] },
    ];
  }

  const prev = (currentIndex - 1 + entries.length) % entries.length;
  const next = (currentIndex + 1) % entries.length;
  return [
    { slot: "prev", entry: entries[prev] },
    { slot: "current", entry: entries[currentIndex] },
    { slot: "next", entry: entries[next] },
  ];
}

function createPersistentSlotEntries(
  entries: CompanionManifestEntry[],
  currentIndex: number,
): CarouselSlot[] {
  if (entries.length <= 3) {
    return createSlotEntries(entries, currentIndex);
  }
  return entries.map((entry, index) => {
    const forward = (index - currentIndex + entries.length) % entries.length;
    const backward = (currentIndex - index + entries.length) % entries.length;
    let slot: SlotName = "hidden";
    if (index === currentIndex) {
      slot = "current";
    } else if (backward === 1) {
      slot = "prev";
    } else if (forward === 1) {
      slot = "next";
    }
    return { slot, entry };
  });
}

function slotFrameStyle(
  slot: SlotName,
  opts: { soleFlankPair?: boolean } = {},
): CSSProperties {
  const { soleFlankPair } = opts;
  const base: CSSProperties = {
    position: "absolute",
    top: slot === "current" ? "5%" : "8%",
    width: slot === "current" ? "min(36vw, 360px)" : "min(24vw, 260px)",
    height: "min(66vh, 560px)",
    minWidth: slot === "current" ? 230 : 150,
    minHeight: 300,
    transition:
      "left 620ms cubic-bezier(0.22, 1, 0.36, 1), width 620ms cubic-bezier(0.22, 1, 0.36, 1), transform 620ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease, filter 420ms ease",
    pointerEvents: slot === "current" ? "auto" : "none",
  };

  if (slot === "prev") {
    return {
      ...base,
      left: soleFlankPair ? "24%" : "16%",
      opacity: 0.4,
      filter: "saturate(0.75)",
      transform: "translateX(-50%) scale(0.76)",
      zIndex: 1,
    };
  }
  if (slot === "next") {
    return {
      ...base,
      left: soleFlankPair ? "76%" : "84%",
      opacity: soleFlankPair ? 0.5 : 0.4,
      filter: "saturate(0.75)",
      transform: `translateX(-50%) scale(${soleFlankPair ? 0.78 : 0.76})`,
      zIndex: 1,
    };
  }
  if (slot === "hidden") {
    return {
      ...base,
      left: "50%",
      opacity: 0,
      filter: "saturate(0.55)",
      transform: "translateX(-50%) scale(0.62)",
      zIndex: 0,
      pointerEvents: "none",
    };
  }
  return {
    ...base,
    left: "50%",
    opacity: 1,
    transform: "translateX(-50%) scale(1)",
    zIndex: 3,
  };
}

function launchConfetti(): () => void {
  if (typeof document === "undefined") return () => {};

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  let raf = 0;
  let stopped = false;
  const start = performance.now();
  const duration = 2200;
  const particles: ConfettiParticle[] = Array.from({ length: 80 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
    const speed = 4 + Math.random() * 7;
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.34,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.16 + Math.random() * 0.09,
      size: 6 + Math.random() * 8,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: confettiColours[Math.floor(Math.random() * confettiColours.length)],
    };
  });

  const resize = () => {
    canvas.width = Math.ceil(window.innerWidth * window.devicePixelRatio);
    canvas.height = Math.ceil(window.innerHeight * window.devicePixelRatio);
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  };

  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    zIndex: "80",
    pointerEvents: "none",
  });
  resize();
  document.body.appendChild(canvas);
  window.addEventListener("resize", resize);

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.remove();
  };

  const tick = (now: number) => {
    const elapsed = now - start;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.spin;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.rotation);
      context.fillStyle = p.color;
      context.globalAlpha = Math.max(0, 1 - elapsed / duration);
      context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.58);
      context.restore();
    }

    if (elapsed < duration) {
      raf = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  };

  raf = requestAnimationFrame(tick);
  return cleanup;
}

function createAmbientMusic(): AmbientMusicHandle | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  const master = context.createGain();
  master.gain.value = 0.038;
  master.connect(context.destination);

  const padGain = context.createGain();
  padGain.gain.value = 0.018;
  padGain.connect(master);

  const padRoot = context.createOscillator();
  padRoot.type = "sine";
  padRoot.frequency.value = 220;
  padRoot.connect(padGain);
  padRoot.start();

  const padFifth = context.createOscillator();
  padFifth.type = "triangle";
  padFifth.frequency.value = 329.63;
  padFifth.connect(padGain);
  padFifth.start();

  let step = 0;
  const melody = [659.25, 739.99, 880, 739.99, 587.33, 659.25];
  const playChime = () => {
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = melody[step % melody.length];
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.052, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 1.2);
    step += 1;
  };

  playChime();
  const interval = window.setInterval(playChime, 1850);
  void context.resume();

  return {
    stop: () => {
      window.clearInterval(interval);
      padRoot.stop();
      padFifth.stop();
      void context.close();
    },
  };
}

function CompanionSlot({
  entry,
  slot,
  active,
  soleFlankPair,
  contained = false,
  getAnalyser,
  onMotorReady,
  onLoadSettled,
  onVrmAttached,
}: {
  entry: CompanionManifestEntry;
  slot: SlotName;
  active: boolean;
  /**
   * Two companions: only the `next` flank is shown — give it a hair more presence
   * than the default side preview.
  */
  soleFlankPair?: boolean;
  contained?: boolean;
  getAnalyser?: () => AnalyserNode | null;
  onMotorReady?: (slot: SlotName, motor: CompanionMotor | null) => void;
  onLoadSettled: (slotKey: string) => void;
  /** Fires once after `attachVrm` succeeds (not called on load failure). */
  onVrmAttached?: () => void;
}) {
  const slotKey = entry.id;
  const mountRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<THREE.Timer | null>(null);
  const motorRef = useRef<CompanionMotor | null>(null);
  const rendererRef = useRef<CompanionRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const slotRef = useRef(slot);
  const activeRef = useRef(active);
  const containedRef = useRef(contained);
  const companionConfig = useMemo(
    () =>
      mergeCompanionConfigWithDefaults(
        entry.companionConfig ?? {
          companionId: entry.id,
          vrmUrl: entry.vrmUrl,
        },
      ),
    [entry.companionConfig, entry.id, entry.vrmUrl],
  );

  useEffect(() => {
    const previousSlot = slotRef.current;
    slotRef.current = slot;
    const motor = motorRef.current;
      if (previousSlot !== slot) {
        onMotorReady?.(previousSlot, null);
      if (motor && slot !== "hidden") {
        onMotorReady?.(slot, motor);
      }
    }
    motor?.setCameraAngle("mid-shot", 680);
  }, [contained, onMotorReady, slot]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    if (
      !shouldRunShowroomSlotLoop(
        slotRef.current,
        activeRef.current,
        containedRef.current,
      )
    ) {
      return;
    }
    const timer =
      timerRef.current ??
      (() => {
        const t = new THREE.Timer();
        if (typeof document !== "undefined") {
          t.connect(document);
        }
        return t;
      })();
    timerRef.current = timer;

    const tick = (time: number) => {
      if (
        !shouldRunShowroomSlotLoop(
          slotRef.current,
          activeRef.current,
          containedRef.current,
        )
      ) {
        rafRef.current = null;
        return;
      }
      const motor = motorRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!motor?.hasVrm() || !scene || !camera || !renderer) {
        rafRef.current = null;
        return;
      }

      timer.update(time);
      const dt = timer.getDelta();
      motor.tick({
        dt,
        dtMs: Math.min(dt * 1000, 100),
        companionEvents: [],
        companion: companionConfig,
        childId: SHOWROOM_COMMAND_CHILD_ID,
        toggledOff: false,
        activeNodeScreen: null,
        analyser: getAnalyser?.() ?? null,
      });
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [companionConfig, getAnalyser, stopLoop]);

  useEffect(() => {
    activeRef.current = active;
    containedRef.current = contained;
    if (!shouldRunShowroomSlotLoop(slot, active, contained)) {
      stopLoop();
      return;
    }
    if (motorRef.current?.hasVrm()) {
      startLoop();
    }
  }, [active, contained, slot, startLoop, stopLoop]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    stopLoop();

    const readMountSize = () => {
      const rawW = Math.floor(mount.clientWidth || 0);
      const rawH = Math.floor(mount.clientHeight || 0);
      return { w: rawW > 0 ? rawW : 1, h: rawH > 0 ? rawH : 1 };
    };

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const { w, h } = readMountSize();
    const camera = new THREE.PerspectiveCamera(22, w / h, 0.05, 50);
    camera.position.set(0, 1, -3);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    const motor = new CompanionMotor();
    motor.resetSessionState();
    motor.setCamera(camera);
    motor.setCameraAngle("mid-shot", 0);
    motorRef.current = motor;
    if (slotRef.current !== "hidden") {
      onMotorReady?.(slotRef.current, motor);
    }

    const syncRendererToMount = () => {
      const renderer = rendererRef.current;
      const currentCamera = cameraRef.current;
      const currentMotor = motorRef.current;
      if (!renderer || !currentCamera || cancelled) return;
      const size = readMountSize();
      renderer.setSize(size.w, size.h);
      currentCamera.aspect = size.w / size.h;
      currentCamera.updateProjectionMatrix();
      if (currentMotor?.hasVrm()) {
        currentMotor.syncCameraToMount(size.w, size.h);
      }
    };

    const finishSetup = (renderer: CompanionRenderer, webgpuMaterials: boolean) => {
      if (cancelled) {
        renderer.dispose();
        return;
      }

      rendererRef.current = renderer;
      const canvas = renderer.domElement;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.style.pointerEvents = "none";

      scene.add(new THREE.AmbientLight(0xffffff, 0.62));
      const dir = new THREE.DirectionalLight(0xffffff, 0.88);
      dir.position.set(1.2, 2.2, 0.8);
      scene.add(dir);

      loadCompanionVrm(resolveModelUrl(companionConfig.vrmUrl), { webgpu: webgpuMaterials })
        .then((vrm) => {
          if (cancelled) {
            vrm.scene.removeFromParent();
            return;
          }
          const size = readMountSize();
          motor.attachVrm(vrm, scene, size.w, size.h);
          motor.setCameraAngle("mid-shot", 0);
          syncRendererToMount();
          requestAnimationFrame(syncRendererToMount);
          if (
            shouldRunShowroomSlotLoop(
              slotRef.current,
              activeRef.current,
              containedRef.current,
            )
          ) {
            startLoop();
          }
          onLoadSettled(slotKey);
          onVrmAttached?.();
        })
        .catch((err: unknown) => {
          console.error("CompanionShowroom: failed to load VRM —", err);
          onLoadSettled(slotKey);
        });
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(syncRendererToMount);
      resizeObserver.observe(mount);
    }

    void (async () => {
      let renderer: CompanionRenderer | undefined;
      let webgpuAttempt: WebGPURenderer | undefined;

      try {
        webgpuAttempt = new WebGPURenderer({ antialias: true });
        await webgpuAttempt.init();
        renderer = webgpuAttempt;
      } catch (err: unknown) {
        console.error("CompanionShowroom: WebGPU failed, falling back:", err);
        if (webgpuAttempt) {
          try {
            webgpuAttempt.dispose();
          } catch (disposeErr: unknown) {
            console.error("CompanionShowroom: WebGPU dispose after failure:", disposeErr);
          }
        }
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
      }

      if (cancelled || !renderer) {
        renderer?.dispose();
        return;
      }

      renderer.setSize(w, h);
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      if (!isWebGpuRenderer(renderer)) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }
      mount.appendChild(renderer.domElement);
      syncRendererToMount();
      finishSetup(renderer, isWebGpuRenderer(renderer));
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      stopLoop();
      if (slotRef.current !== "hidden") {
        onMotorReady?.(slotRef.current, null);
      }
      motor.dispose();
      motorRef.current = null;
      timerRef.current?.dispose();
      timerRef.current = null;
      const renderer = rendererRef.current;
      rendererRef.current = null;
      if (renderer) {
        renderer.domElement.remove();
        renderer.dispose();
      }
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [
    contained,
    companionConfig.vrmUrl,
    onLoadSettled,
    onMotorReady,
    onVrmAttached,
    slotKey,
    startLoop,
    stopLoop,
  ]);

  return (
    <motion.div
      aria-hidden={slot !== "current"}
      initial={false}
      style={
        contained
          ? {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 1,
              zIndex: 1,
              pointerEvents: "none",
              transform: "scale(1.38)",
              transformOrigin: "50% 58%",
            }
          : slotFrameStyle(slot, {
              soleFlankPair: Boolean(soleFlankPair) && (slot === "next" || slot === "prev"),
            })
      }
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.34, ease: "easeOut" }}
        style={{
          width: "100%",
          height: "100%",
          animation: active ? "sunny-showroom-breathe 3s ease-in-out infinite alternate" : undefined,
        }}
      >
        <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      </motion.div>
    </motion.div>
  );
}

/**
 * CompanionInfoCard
 * ─────────────────
 * Two-panel info card that slides in when the user clicks "Meet me".
 * LEFT:  name, personality traits, subject strengths, bio
 * RIGHT: live 3D canvas close-up for the selected companion.
 *
 * Picking now happens inside the card so the bottom of the stage stays clear.
 */
function CompanionInfoCard({
  entry,
  introText,
  bonusPoints,
  pickLabel,
  picking,
  speakingLine,
  speechError,
  selectedVoiceId,
  getAnalyser,
  onVoiceChange,
  onSpeak,
  onSpecialDance,
  onPick,
  onClose,
  onCardMotorReady,
  onCardVrmSettled,
  cardPreviewVrmReady,
}: {
  entry: CompanionManifestEntry;
  introText: string;
  bonusPoints?: number;
  pickLabel: string;
  picking: boolean;
  speakingLine: SpeakingLine | null;
  speechError: string | null;
  selectedVoiceId: string;
  getAnalyser: () => AnalyserNode | null;
  onVoiceChange: (voiceId: string) => void;
  onSpeak: (line: SpeakingLine) => void;
  onSpecialDance: () => void;
  onPick: () => void;
  onClose: () => void;
  onCardMotorReady: (motor: CompanionMotor | null) => void;
  onCardVrmSettled: () => void;
  /** True after the card 3D preview has a VRM (signature dance + speech gestures are reliable). */
  cardPreviewVrmReady: boolean;
}) {
  const cardAccent = entry.id
    ? `hsl(${(entry.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360}, 70%, 68%)`
    : "#a78bfa";
  const showroom = entry.showroom;

  const handleCardSlotMotorReady = useCallback(
    (_slot: SlotName, motor: CompanionMotor | null) => {
      onCardMotorReady(motor);
    },
    [onCardMotorReady],
  );

  const handleCardVrmAttached = useCallback(() => {
    onCardVrmSettled();
  }, [onCardVrmSettled]);

  const ignoreCardSlotLoadSettled = useCallback(() => {}, []);

  const detailRows = [
    { label: "Likes", values: showroom?.likes ?? [] },
    { label: "Special skills", values: showroom?.specialSkills ?? [] },
    { label: "Catchphrases", values: showroom?.catchphrases ?? [] },
  ].filter((row) => row.values.length > 0);
  const voices = entry.voices ?? [];
  const canSpeak = voices.length > 0;

  return (
    <motion.div
      key="companion-info-card"
      initial={{ opacity: 0, x: 56, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 56, scale: 0.97 }}
      transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
      style={{
        position: "fixed",
        top: "auto",
        bottom: "clamp(18px, 4vh, 46px)",
        right: "clamp(14px, 3vw, 46px)",
        zIndex: 34,
        width: "min(62vw, 860px)",
        minWidth: "min(94vw, 390px)",
        height: "min(58vh, 520px)",
        maxHeight: "calc(100vh - 56px)",
        borderRadius: 16,
        background: "rgba(10, 6, 24, 0.96)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 26px 70px rgba(0,0,0,0.64)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(180px, 0.55fr)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        aria-label="Close companion card"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 6,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.24)",
          background: "rgba(15,23,42,0.86)",
          color: "#f8fafc",
          fontSize: 24,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>
      {/* ── LEFT: bio + traits + strengths ── */}
      <div
        style={{
          height: "100%",
          padding: "28px 24px 22px",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 4,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "clamp(28px, 4.4vw, 42px)",
                fontWeight: 800,
                color: "#fff",
                lineHeight: 1.05,
                overflowWrap: "anywhere",
              }}
            >
              {entry.name}
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)",
              }}
            >
              {introText.slice(0, 48)}…
            </p>
          </div>

          <p
            style={{
              margin: 0,
              borderRadius: 14,
              background: "rgba(255,255,255,0.94)",
              color: "#1e1b4b",
              fontSize: 15,
              lineHeight: 1.45,
              padding: "14px 16px",
              boxShadow: "0 12px 34px rgba(0,0,0,0.24)",
            }}
          >
            {introText}
          </p>

          <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
                marginBottom: 10,
              }}
            >
              Personality
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {entry.personality.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 999,
                    background: "rgba(109,94,245,0.22)",
                    border: "1.5px solid rgba(109,94,245,0.45)",
                    color: "#c4b5fd",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {showroom?.personality && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.62)",
              }}
            >
              {showroom.personality}
            </p>
          )}

          {detailRows.map((row) => (
            <div key={row.label}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.28)",
                  margin: "0 0 8px",
                }}
              >
                {row.label}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.58)",
                }}
              >
                {row.values.slice(0, 4).join(", ")}
              </p>
            </div>
          ))}

          {bonusPoints != null && bonusPoints > 0 && (
            <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 700 }}>
              +{bonusPoints} bonus XP when you pick {entry.name}
            </div>
          )}
        </div>

        <div
          style={{
            flex: "0 0 auto",
            margin: "14px -24px -22px",
            padding: "14px 24px 22px",
            background:
              "linear-gradient(180deg, rgba(10,6,24,0.6), rgba(10,6,24,0.98))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {voices.length > 1 && (
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                color: "rgba(255,255,255,0.58)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Voice
              <select
                value={selectedVoiceId}
                onChange={(event) => onVoiceChange(event.target.value)}
                disabled={speakingLine != null}
                style={{
                  minHeight: 40,
                  borderRadius: 12,
                  border: "1px solid rgba(109,94,245,0.42)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#f8fafc",
                  fontSize: 14,
                  fontWeight: 800,
                  fontFamily: "Lexend, system-ui, sans-serif",
                  padding: "0 12px",
                  outline: "none",
                }}
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onSpeak("intro")}
              disabled={!canSpeak || speakingLine != null || !cardPreviewVrmReady}
              title={!cardPreviewVrmReady ? "Loading 3D preview…" : undefined}
              style={{
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: 999,
                background: canSpeak ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                color: canSpeak ? "#f8fafc" : "rgba(255,255,255,0.38)",
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "Lexend, system-ui, sans-serif",
                padding: "11px 16px",
                cursor:
                  canSpeak && speakingLine == null && cardPreviewVrmReady ? "pointer" : "not-allowed",
              }}
            >
              {speakingLine === "intro" ? "Speaking..." : canSpeak ? "Say Hi" : "Needs voice"}
            </button>
            <button
              type="button"
              onClick={() => onSpeak("plead")}
              disabled={!canSpeak || speakingLine != null || !cardPreviewVrmReady}
              title={!cardPreviewVrmReady ? "Loading 3D preview…" : undefined}
              style={{
                border: "1px solid rgba(109,94,245,0.45)",
                borderRadius: 999,
                background: canSpeak ? "rgba(109,94,245,0.22)" : "rgba(255,255,255,0.05)",
                color: canSpeak ? "#ddd6fe" : "rgba(255,255,255,0.38)",
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "Lexend, system-ui, sans-serif",
                padding: "11px 16px",
                cursor:
                  canSpeak && speakingLine == null && cardPreviewVrmReady ? "pointer" : "not-allowed",
              }}
            >
              {speakingLine === "plead" ? "Speaking..." : canSpeak ? "Why Pick Me?" : "Needs voice"}
            </button>
            <button
              type="button"
              onClick={onSpecialDance}
              disabled={!cardPreviewVrmReady}
              title={!cardPreviewVrmReady ? "Loading 3D preview…" : undefined}
              style={{
                border: "1px solid rgba(251,191,36,0.38)",
                borderRadius: 999,
                background: "rgba(251,191,36,0.13)",
                color: "#fde68a",
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "Lexend, system-ui, sans-serif",
                padding: "11px 16px",
                cursor: cardPreviewVrmReady ? "pointer" : "not-allowed",
              }}
            >
              Signature Dance
            </button>
          </div>

          {speechError && (
            <p style={{ margin: 0, color: "#fca5a5", fontSize: 12, lineHeight: 1.4 }}>
              {speechError}
            </p>
          )}

          <button
            type="button"
            onClick={onPick}
            disabled={picking}
            style={{
              border: 0,
              borderRadius: 999,
              background: accent,
              color: "#fff",
              fontSize: 18,
              fontWeight: 800,
              fontFamily: "Lexend, system-ui, sans-serif",
              padding: "14px 22px",
              boxShadow: "0 18px 44px rgba(109,94,245,0.42)",
              cursor: picking ? "wait" : "pointer",
              opacity: picking ? 0.76 : 1,
              whiteSpace: "normal",
            }}
          >
            {pickLabel}
          </button>
        </div>
      </div>
      <div
        aria-hidden
        style={{
          position: "relative",
          minHeight: 0,
          background: `radial-gradient(ellipse at 50% 18%, ${cardAccent}22, transparent 62%), rgba(0,0,0,0.24)`,
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <CompanionSlot
          entry={entry}
          slot="current"
          active
          contained
          getAnalyser={getAnalyser}
          onMotorReady={handleCardSlotMotorReady}
          onLoadSettled={ignoreCardSlotLoadSettled}
          onVrmAttached={handleCardVrmAttached}
        />
      </div>
    </motion.div>
  );
}

export function CompanionShowroom({
  onSelect,
  getText,
  bonusPoints,
  childName,
  useGeneratedBackground = false,
  generatedBackgroundUrl,
  enableBackgroundMusic = false,
  generatedBackgroundLoading = false,
}: CompanionShowroomProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [picking, setPicking] = useState(false);
  const [musicOn, setMusicOn] = useState(enableBackgroundMusic);
  const [speakingLine, setSpeakingLine] = useState<SpeakingLine | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [voiceSelections, setVoiceSelections] = useState<Record<string, string>>({});
  const [showroomDiagAnimation, setShowroomDiagAnimation] = useState<string>("idle");
  const [showroomDiagLastCommand, setShowroomDiagLastCommand] =
    useState<string>("none");
  const [initialCurtainDismissed, setInitialCurtainDismissed] = useState(false);
  const [settledSlotKeys, setSettledSlotKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const motorsRef = useRef<Partial<Record<SlotName, CompanionMotor>>>({});
  const cardMotorRef = useRef<CompanionMotor | null>(null);
  /** Spotlight card mounts a second WebGL viewer; wait for VRM before driving clips (else emote fallback looks identical per character). */
  const [cardPreviewVrmReady, setCardPreviewVrmReady] = useState(false);
  const timersRef = useRef<Set<number>>(new Set());
  const confettiCleanupRef = useRef<(() => void) | null>(null);
  const musicRef = useRef<AmbientMusicHandle | null>(null);
  const speechAudioRef = useRef<{
    audio: HTMLAudioElement;
    context: AudioContext;
  } | null>(null);
  const speechAnalyserRef = useRef<AnalyserNode | null>(null);
  const speechGestureIntervalRef = useRef<number | null>(null);
  const speechUrlRef = useRef<string | null>(null);
  const swipeFromXRef = useRef<number | null>(null);
  const getSpeechAnalyser = useCallback(() => speechAnalyserRef.current, []);

  const entries = COMPANION_MANIFEST;
  const isPairDuo = entries.length === 2;
  const current = entries[currentIndex] ?? null;
  const introText = current ? getText(current.id) : "";
  const slots = useMemo(
    () => createPersistentSlotEntries(entries, currentIndex),
    [entries, currentIndex],
  );
  const expectedSlotKeys = useMemo(
    () => slots.map((slot) => slot.entry.id),
    [slots],
  );
  const visibleSlotsSettled = expectedSlotKeys.every((slotKey) =>
    settledSlotKeys.has(slotKey),
  );
  const showroomReady = visibleSlotsSettled && !generatedBackgroundLoading;
  const initialStageLoading = !initialCurtainDismissed && !showroomReady;

  useEffect(() => {
    if (introVisible) {
      setCardPreviewVrmReady(false);
    }
  }, [introVisible]);

  const handleCardMotorReady = useCallback((motor: CompanionMotor | null) => {
    cardMotorRef.current = motor;
  }, []);

  const handleCardVrmSettled = useCallback(() => {
    setCardPreviewVrmReady(true);
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const setMotor = useCallback((slot: SlotName, motor: CompanionMotor | null) => {
    if (motor) {
      motorsRef.current[slot] = motor;
    } else {
      delete motorsRef.current[slot];
    }
  }, []);

  const markSlotLoadSettled = useCallback((slotKey: string) => {
    setSettledSlotKeys((prev) => {
      if (prev.has(slotKey)) return prev;
      const next = new Set(prev);
      next.add(slotKey);
      return next;
    });
  }, []);

  const playCurrentCompanionAnimation = useCallback(
    (animation: string, opts?: { loop?: boolean }) => {
      const cmd = createShowroomAnimateCommand(animation, opts);
      processShowroomCommand(motorsRef.current.current, cmd);
      processShowroomCommand(cardMotorRef.current, cmd);
    },
    [],
  );

  const fireShowroomDiagAnimation = useCallback(
    (animation: string, opts?: { loop?: boolean }) => {
      playCurrentCompanionAnimation(animation, opts);
      setShowroomDiagLastCommand(
        `${animation}${opts?.loop === true ? " loop" : ""}`,
      );
    },
    [playCurrentCompanionAnimation],
  );

  const playSlotAnimation = useCallback(
    (slot: SlotName, animation: string, opts?: { loop?: boolean }) => {
      processShowroomCommand(
        motorsRef.current[slot],
        createShowroomAnimateCommand(animation, opts),
      );
    },
    [],
  );

  const setCurrentCompanionCamera = useCallback(
    (angle: CameraAngle, transitionMs?: number) => {
      const cmd = createShowroomCameraCommand(angle, transitionMs);
      processShowroomCommand(motorsRef.current.current, cmd);
      processShowroomCommand(cardMotorRef.current, cmd);
    },
    [],
  );

  const startMusic = useCallback(() => {
    if (!enableBackgroundMusic || !musicOn || musicRef.current) return;
    musicRef.current = createAmbientMusic();
  }, [enableBackgroundMusic, musicOn]);

  const clearSpeechGestures = useCallback(() => {
    if (speechGestureIntervalRef.current != null) {
      window.clearInterval(speechGestureIntervalRef.current);
      speechGestureIntervalRef.current = null;
    }
  }, []);

  const playShowroomGesture = useCallback(
    (line: GestureLine, step = 0, opts?: { loop?: boolean }) => {
      if (!current) return;
      const sequence = resolveShowroomGestureSequence(
        current.showroom?.gestureProfile,
        line,
      );
      const animation = sequence[step % sequence.length] ?? "wave";
      playCurrentCompanionAnimation(animation, { loop: opts?.loop ?? false });
    },
    [current, playCurrentCompanionAnimation],
  );

  const startSpeechGestures = useCallback(
    (line: SpeakingLine) => {
      clearSpeechGestures();
      if (!current) return;
      const plan = resolveShowroomSpeechGesturePlan(
        current.showroom?.gestureProfile,
        line,
      );
      const primary = plan.sequence[0] ?? "talking";
      playCurrentCompanionAnimation(primary, { loop: plan.sustainPrimary });
      if (plan.sustainPrimary || plan.intervalMs == null || plan.sequence.length <= 1) {
        return;
      }
      let step = 1;
      speechGestureIntervalRef.current = window.setInterval(() => {
        const animation = plan.sequence[step % plan.sequence.length] ?? primary;
        playCurrentCompanionAnimation(animation, { loop: false });
        step += 1;
      }, plan.intervalMs);
    },
    [clearSpeechGestures, current, playCurrentCompanionAnimation],
  );

  const stopSpeech = useCallback(() => {
    clearSpeechGestures();
    speechAudioRef.current?.audio.pause();
    void speechAudioRef.current?.context.close();
    speechAudioRef.current = null;
    speechAnalyserRef.current = null;
    if (speechUrlRef.current) {
      URL.revokeObjectURL(speechUrlRef.current);
      speechUrlRef.current = null;
    }
    setSpeakingLine(null);
  }, [clearSpeechGestures]);

  const cycle = useCallback(
    (direction: -1 | 1) => {
      if (entries.length <= 1 || spotlightOpen || picking) return;
      stopSpeech();
      setIntroVisible(false);
      setCurrentIndex((prev) => (prev + direction + entries.length) % entries.length);
    },
    [entries.length, picking, spotlightOpen, stopSpeech],
  );

  const closeSpotlight = useCallback(() => {
    clearTimers();
    stopSpeech();
    setSpotlightOpen(false);
    setIntroVisible(false);
    setPicking(false);
    setCardPreviewVrmReady(false);
    // Zoom back to full body on stage
    setCurrentCompanionCamera("full-body", 680);
  }, [clearTimers, setCurrentCompanionCamera, stopSpeech]);

  const openSpotlight = useCallback(() => {
    if (!current || spotlightOpen) return;
    startMusic();
    clearTimers();
    setSpotlightOpen(true);
    setIntroVisible(false);
    setCurrentCompanionCamera("mid-shot", 680);
    playShowroomGesture("meet");
    playSlotAnimation("prev", "wave", { loop: false });
    playSlotAnimation("next", "wave", { loop: false });
    schedule(() => {
      playCurrentCompanionAnimation("idle", { loop: true });
    }, Math.max(0, SHOWROOM_CARD_REVEAL_DELAY_MS - 160));
    schedule(() => setIntroVisible(true), SHOWROOM_CARD_REVEAL_DELAY_MS);
  }, [
    clearTimers,
    current,
    playCurrentCompanionAnimation,
    playShowroomGesture,
    playSlotAnimation,
    schedule,
    setCurrentCompanionCamera,
    spotlightOpen,
    startMusic,
  ]);

  const onStagePointerDown = useCallback(
    (e: PointEvt<HTMLDivElement>) => {
      if (entries.length <= 1 || spotlightOpen || picking) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore — capture may be unavailable
      }
      swipeFromXRef.current = e.clientX;
    },
    [entries.length, picking, spotlightOpen],
  );

  const onStagePointerUp = useCallback(
    (e: PointEvt<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore if not captured
      }
      if (swipeFromXRef.current == null) return;
      const fromX = swipeFromXRef.current;
      swipeFromXRef.current = null;
      if (entries.length <= 1 || spotlightOpen || picking) return;
      const delta = e.clientX - fromX;
      const minSwipe = 64;
      if (delta < -minSwipe) {
        cycle(1);
      } else if (delta > minSwipe) {
        cycle(-1);
      }
    },
    [cycle, entries.length, picking, spotlightOpen],
  );

  const onStagePointerCancel = useCallback(() => {
    swipeFromXRef.current = null;
  }, []);

  const confirmPick = useCallback(() => {
    if (!current || picking) return;
    stopSpeech();
    setPicking(true);
    confettiCleanupRef.current?.();
    confettiCleanupRef.current = launchConfetti();
    playCurrentCompanionAnimation(
      current.showroom?.gestureProfile.specialDance ?? "dance_victory",
      { loop: false },
    );
    playSlotAnimation("prev", "wave", { loop: false });
    playSlotAnimation("next", "wave", { loop: false });
    schedule(() => {
      playSlotAnimation("prev", "shrug", { loop: false });
      playSlotAnimation("next", "shrug", { loop: false });
    }, 800);
    schedule(() => {
      confettiCleanupRef.current?.();
      confettiCleanupRef.current = null;
      onSelect(current.id);
    }, 1800);
  }, [
    current,
    onSelect,
    picking,
    playCurrentCompanionAnimation,
    playSlotAnimation,
    schedule,
    stopSpeech,
  ]);

  const playSpecialDance = useCallback(() => {
    if (!current) return;
    stopSpeech();
    playCurrentCompanionAnimation(
      current.showroom?.gestureProfile.specialDance ?? "dance_victory",
      { loop: false },
    );
  }, [current, playCurrentCompanionAnimation, stopSpeech]);

  const speakCurrent = useCallback(
    async (line: SpeakingLine) => {
      const currentDefaultVoice =
        current?.voices.find((voice) => voice.default)?.id ?? current?.voices[0]?.id ?? "";
      const selectedVoiceId = current ? voiceSelections[current.id] ?? currentDefaultVoice : "";
      if (!current || current.voices.length === 0 || !selectedVoiceId || speakingLine) return;
      stopSpeech();
      setSpeechError(null);
      setSpeakingLine(line);
      startSpeechGestures(line);
      try {
        const response = await fetch(
          `/api/companions/${encodeURIComponent(current.id)}/speak`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ line, language: "en", voiceId: selectedVoiceId }),
          },
        );
        if (!response.ok) {
          const err = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(err?.error ?? `speech_${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        speechUrlRef.current = url;
        const audio = new Audio(url);
        const AudioContextCtor =
          window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextCtor) {
          throw new Error("audio_context_unavailable");
        }
        const context = new AudioContextCtor();
        const source = context.createMediaElementSource(audio);
        const analyser = ensurePlaybackAnalyser(context);
        source.connect(analyser);
        analyser.connect(context.destination);
        speechAnalyserRef.current = analyser;
        speechAudioRef.current = { audio, context };
        audio.addEventListener("ended", () => {
          stopSpeech();
          playCurrentCompanionAnimation("idle", { loop: true });
        });
        audio.addEventListener("error", () => {
          setSpeechError("I could not play that voice just now.");
          stopSpeech();
          playCurrentCompanionAnimation("idle", { loop: true });
        });
        await context.resume();
        await audio.play();
      } catch (err: unknown) {
        setSpeechError(err instanceof Error ? err.message : "Voice preview failed.");
        stopSpeech();
        playCurrentCompanionAnimation("idle", { loop: true });
      }
    },
    [
      current,
      playCurrentCompanionAnimation,
      speakingLine,
      startSpeechGestures,
      stopSpeech,
      voiceSelections,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        cycle(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        cycle(1);
      } else if (event.key === "Escape" && spotlightOpen) {
        event.preventDefault();
        closeSpotlight();
      } else if (event.key === "Enter" && !spotlightOpen) {
        event.preventDefault();
        startMusic();
        openSpotlight();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSpotlight, cycle, openSpotlight, spotlightOpen, startMusic]);

  useEffect(() => {
    if (initialCurtainDismissed || !showroomReady) return;
    const timer = window.setTimeout(() => {
      setInitialCurtainDismissed(true);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [initialCurtainDismissed, showroomReady]);

  useEffect(() => {
    if (!enableBackgroundMusic || !musicOn) {
      musicRef.current?.stop();
      musicRef.current = null;
      return;
    }

    const startFromGesture = () => startMusic();
    window.addEventListener("pointerdown", startFromGesture, { once: true });
    window.addEventListener("keydown", startFromGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", startFromGesture);
      window.removeEventListener("keydown", startFromGesture);
    };
  }, [enableBackgroundMusic, musicOn, startMusic]);

  useEffect(() => {
    return () => {
      clearTimers();
      stopSpeech();
      confettiCleanupRef.current?.();
      confettiCleanupRef.current = null;
      musicRef.current?.stop();
      musicRef.current = null;
    };
  }, [clearTimers, stopSpeech]);

  if (!current) {
    return (
      <div
        role="region"
        aria-label="Companion Showroom"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0f0a1e",
          color: "#f8fafc",
          fontFamily: "Lexend, system-ui, sans-serif",
        }}
      >
        No companions are ready yet.
      </div>
    );
  }

  const bonus = bonusPoints?.[current.id] ?? 0;
  const pickLabel = `Pick ${current.name}${childName ? `, ${childName}` : ""}!`;
  const currentDefaultVoice =
    current.voices.find((voice) => voice.default)?.id ?? current.voices[0]?.id ?? "";
  const selectedVoiceId = voiceSelections[current.id] ?? currentDefaultVoice;
  const activeGeneratedBackground =
    useGeneratedBackground && generatedBackgroundUrl?.trim()
      ? generatedBackgroundUrl.trim()
      : null;

  return (
    <div
      role="region"
      aria-label="Companion Showroom"
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        background: "#0f0a1e",
        color: "#f8fafc",
        fontFamily: "Lexend, system-ui, sans-serif",
      }}
    >
      <p
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          border: 0,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
        }}
        aria-live="polite"
        aria-atomic
      >
        {`Viewing ${current.name} — ${currentIndex + 1} of ${entries.length}. Use arrows, dots, or swipe the stage to change.`}
      </p>
      {activeGeneratedBackground && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `linear-gradient(180deg, rgba(15,10,30,0.32), rgba(15,10,30,0.88)), url("${activeGeneratedBackground.replace(/"/g, '\\"')}")`,
            backgroundPosition: "center",
            backgroundSize: "cover",
            filter: "saturate(1.08)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      {useGeneratedBackground && !activeGeneratedBackground && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(110deg, rgba(109,94,245,0.08), rgba(167,139,250,0.18), rgba(244,114,182,0.08))",
            backgroundSize: "200% 200%",
            animation: "sunny-showroom-bg-wait 3.8s ease-in-out infinite",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      {!activeGeneratedBackground && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 22%, rgba(109,94,245,0.2), transparent 32%), #0f0a1e",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      <style>
        {`@import url("https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700;800&display=swap");
          @keyframes sunny-showroom-breathe {
            from { transform: scale(1); }
            to { transform: scale(1.012); }
          }
          @keyframes sunny-showroom-sparkle {
            0%, 100% { transform: translateY(0) scale(0.7); opacity: 0.22; }
            50% { transform: translateY(-16px) scale(1.3); opacity: 0.95; }
          }
          @keyframes sunny-showroom-bg-wait {
            0%, 100% { background-position: 0% 50%; opacity: 0.42; }
            50% { background-position: 100% 50%; opacity: 0.78; }
          }
          @media (max-width: 640px) {
            .sunny-showroom-stage { height: 58vh !important; }
            .sunny-showroom-dots { bottom: 4px !important; }
          }`}
      </style>

      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
        {sparkleSeeds.map((sparkle) => (
          <span
            key={`${sparkle.left}-${sparkle.top}`}
            style={{
              position: "absolute",
              left: sparkle.left,
              top: sparkle.top,
              width: sparkle.size,
              height: sparkle.size,
              borderRadius: "50%",
              background: "#fef3c7",
              boxShadow: "0 0 18px rgba(254,243,199,0.95)",
              animation: `sunny-showroom-sparkle 4.2s ease-in-out ${sparkle.delay} infinite`,
            }}
          />
        ))}
      </div>

      {enableBackgroundMusic && (
        <button
          type="button"
          aria-label={musicOn ? "Turn background music off" : "Turn background music on"}
          onClick={() => {
            if (musicOn) {
              musicRef.current?.stop();
              musicRef.current = null;
              setMusicOn(false);
            } else {
              setMusicOn(true);
              window.setTimeout(() => {
                if (!musicRef.current) {
                  musicRef.current = createAmbientMusic();
                }
              }, 0);
            }
          }}
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            zIndex: 42,
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.28)",
            background: "rgba(15,23,42,0.72)",
            color: "#f8fafc",
            fontSize: 20,
            cursor: "pointer",
            boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
          }}
        >
          {musicOn ? "♫" : "♪"}
        </button>
      )}

      {import.meta.env.DEV && (
        <div
          className="pointer-events-auto"
          style={{
            position: "fixed",
            left: 16,
            bottom: 16,
            zIndex: 55,
            width: 280,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(15,23,42,0.92)",
            boxShadow: "0 18px 48px rgba(0,0,0,0.34)",
            color: "#f8fafc",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "rgba(248,250,252,0.62)",
            }}
          >
            Intro animation diag
          </div>
          <select
            value={showroomDiagAnimation}
            onChange={(event) => setShowroomDiagAnimation(event.target.value)}
            style={{
              width: "100%",
              marginBottom: 8,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.24)",
              background: "rgba(24,24,27,0.96)",
              color: "#f8fafc",
              fontSize: 14,
            }}
          >
            {COMPANION_ANIMATION_IDS.map((animation) => (
              <option key={animation} value={animation}>
                {animation}
              </option>
            ))}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => fireShowroomDiagAnimation(showroomDiagAnimation)}
              style={{
                border: 0,
                borderRadius: 8,
                background: "#0f7dad",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                padding: "9px 10px",
                cursor: "pointer",
              }}
            >
              Fire
            </button>
            <button
              type="button"
              onClick={() => fireShowroomDiagAnimation("idle", { loop: true })}
              style={{
                border: 0,
                borderRadius: 8,
                background: "#047857",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                padding: "9px 10px",
                cursor: "pointer",
              }}
            >
              Force idle
            </button>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "rgba(248,250,252,0.62)",
              overflowWrap: "anywhere",
            }}
          >
            Last: {showroomDiagLastCommand}
          </div>
        </div>
      )}

      <div
        className="sunny-showroom-stage"
        onPointerDown={onStagePointerDown}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerCancel}
        style={{
          position: "relative",
          height: "72vh",
          minHeight: 440,
          zIndex: 1,
          touchAction: entries.length > 1 && !spotlightOpen && !picking ? "none" : "auto",
          cursor:
            entries.length > 1 && !spotlightOpen && !picking ? "grab" : "default",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "auto 0 0",
            height: "36%",
            background: "radial-gradient(ellipse 80% 30% at 50% 100%, #1a1040, transparent)",
            pointerEvents: "none",
          }}
        />
        {/* God rays — one per companion position */}
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
          {slots.filter((s) => s.slot !== "hidden").map((s) => {
            const left = s.slot === "prev" ? "16%" : s.slot === "next" ? "84%" : "50%";
            const isActive = s.entry.id === (current?.id ?? "");
            return (
              <div
                key={s.entry.id}
                style={{
                  position: "absolute",
                  left,
                  top: 0,
                  width: s.slot === "current" ? 130 : 80,
                  height: s.slot === "current" ? "55%" : "45%",
                  transform: "translateX(-50%)",
                  background: `linear-gradient(180deg,
                    rgba(255,255,255,${isActive ? 0.07 : 0.035}) 0%,
                    rgba(255,255,255,0.018) 55%,
                    transparent 100%)`,
                  clipPath: "polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)",
                  pointerEvents: "none",
                  transition: "opacity 0.8s",
                }}
              />
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {slots.map((slot) => (
            <CompanionSlot
              key={slot.entry.id}
              entry={slot.entry}
              slot={slot.slot}
              active={!spotlightOpen}
              soleFlankPair={isPairDuo}
              getAnalyser={getSpeechAnalyser}
              onMotorReady={setMotor}
              onLoadSettled={markSlotLoadSettled}
            />
          ))}
        </AnimatePresence>
        {entries.length > 1 && !spotlightOpen && (
          <div
            role="group"
            aria-label="Companions — tap a dot to switch"
            className="sunny-showroom-dots"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 10,
              transform: "translateX(-50%)",
              display: "flex",
              gap: 10,
              zIndex: 14,
              flexWrap: "wrap",
              justifyContent: "center",
              maxWidth: "min(90vw, 400px)",
              padding: "0 12px",
            }}
          >
            {entries.map((e, i) => {
              const dotActive = i === currentIndex;
              return (
                <button
                  type="button"
                  key={e.id}
                  title={e.name}
                  id={`sunny-showroom-pick-${e.id}`}
                  aria-label={`Show ${e.name}`}
                  aria-current={dotActive ? "true" : undefined}
                  onClick={() => {
                    if (picking) return;
                    setCurrentIndex(i);
                  }}
                  style={{
                    width: dotActive ? 12 : 9,
                    height: dotActive ? 12 : 9,
                    borderRadius: 999,
                    border: 0,
                    padding: 0,
                    background: dotActive ? accent : "rgba(255,255,255,0.3)",
                    cursor: picking ? "not-allowed" : "pointer",
                    boxShadow: dotActive
                      ? "0 0 0 1px rgba(255,255,255,0.2), 0 2px 14px rgba(109,94,245,0.45)"
                      : "0 0 0 1px rgba(0,0,0,0.1)",
                    transition: "width 0.2s ease, height 0.2s ease, background 0.2s ease",
                    opacity: picking ? 0.5 : 1,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Previous companion"
        onClick={() => cycle(-1)}
        disabled={entries.length <= 1 || spotlightOpen || picking}
        style={{
          position: "absolute",
          left: "clamp(16px, 6vw, 88px)",
          top: "38%",
          zIndex: 12,
          width: 58,
          height: 58,
          borderRadius: "50%",
          border: "1px solid rgba(248,250,252,0.22)",
          background: "rgba(15,23,42,0.62)",
          color: "#f8fafc",
          fontSize: 28,
          cursor: "pointer",
        }}
      >
        ◀
      </button>

      <button
        type="button"
        aria-label="Next companion"
        onClick={() => cycle(1)}
        disabled={entries.length <= 1 || spotlightOpen || picking}
        style={{
          position: "absolute",
          right: "clamp(16px, 6vw, 88px)",
          top: "38%",
          zIndex: 12,
          width: 58,
          height: 58,
          borderRadius: "50%",
          border: "1px solid rgba(248,250,252,0.22)",
          background: "rgba(15,23,42,0.62)",
          color: "#f8fafc",
          fontSize: 28,
          cursor: "pointer",
        }}
      >
        ▶
      </button>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "calc(72vh - 36px)",
          transform: "translateX(-50%)",
          zIndex: 18,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {!spotlightOpen && (
          <button
            type="button"
            onClick={openSpotlight}
            disabled={initialStageLoading}
            style={{
              border: 0,
              borderRadius: 999,
              background: accent,
              color: "#fff",
              fontSize: 20,
              fontWeight: 800,
              fontFamily: "Lexend, system-ui, sans-serif",
              padding: "16px 34px",
              boxShadow: "0 18px 44px rgba(109,94,245,0.42)",
              cursor: initialStageLoading ? "wait" : "pointer",
              opacity: initialStageLoading ? 0.68 : 1,
            }}
          >
            Meet {current.name}
          </button>
        )}
      </div>

      <AnimatePresence>
        {spotlightOpen && (
          <motion.div
            key="spotlight-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 320px 480px at 50% 40%, transparent 0%, rgba(0,0,0,0.72) 100%)",
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {spotlightOpen && (
          <>
            <motion.button
              key="close"
              type="button"
              aria-label="Close spotlight"
              onClick={closeSpotlight}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: "fixed",
                top: 22,
                right: 22,
                zIndex: 40,
                width: 46,
                height: 46,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.26)",
                background: "rgba(15,23,42,0.86)",
                color: "#f8fafc",
                fontSize: 28,
                cursor: "pointer",
              }}
            >
              ×
            </motion.button>

            <AnimatePresence>
              {introVisible && (
                <CompanionInfoCard
                  key="companion-info-card"
                  entry={current}
                  introText={introText}
                  bonusPoints={bonus > 0 ? bonus : undefined}
                  pickLabel={pickLabel}
                  picking={picking}
                  speakingLine={speakingLine}
                  speechError={speechError}
                  selectedVoiceId={selectedVoiceId}
                  getAnalyser={getSpeechAnalyser}
                  onVoiceChange={(voiceId) =>
                    setVoiceSelections((prev) => ({ ...prev, [current.id]: voiceId }))
                  }
                  onSpeak={speakCurrent}
                  onSpecialDance={playSpecialDance}
                  onPick={confirmPick}
                  onClose={closeSpotlight}
                  onCardMotorReady={handleCardMotorReady}
                  onCardVrmSettled={handleCardVrmSettled}
                  cardPreviewVrmReady={cardPreviewVrmReady}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {initialStageLoading && (
          <motion.div
            key="showroom-loading"
            role="status"
            aria-live="polite"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 90,
              display: "grid",
              placeItems: "center",
              background:
                "radial-gradient(circle at 50% 34%, rgba(109,94,245,0.28), transparent 34%), rgba(15,10,30,0.94)",
              color: "#f8fafc",
              pointerEvents: "none",
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.42, ease: "easeOut" }}
              style={{
                width: "min(82vw, 440px)",
                textAlign: "center",
              }}
            >
              <div
                aria-hidden
                style={{
                  margin: "0 auto 22px",
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.18)",
                  background:
                    "radial-gradient(circle, rgba(251,191,36,0.95) 0 12%, rgba(109,94,245,0.6) 13% 42%, rgba(15,23,42,0.65) 43%)",
                  boxShadow:
                    "0 0 46px rgba(167,139,250,0.5), inset 0 0 28px rgba(255,255,255,0.16)",
                  animation: "sunny-showroom-breathe 1.1s ease-in-out infinite alternate",
                }}
              />
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  lineHeight: 1.15,
                  marginBottom: 10,
                }}
              >
                Opening the companion stage
              </div>
              <div
                style={{
                  color: "rgba(248,250,252,0.68)",
                  fontSize: 15,
                  lineHeight: 1.45,
                }}
              >
                {generatedBackgroundLoading
                  ? "Painting a magical backdrop..."
                  : "Warming up the friends..."}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
