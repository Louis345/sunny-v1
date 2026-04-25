import {
  useCallback,
  useEffect,
  useLayoutEffect,
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

type SlotName = "prev" | "current" | "next";
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

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const accent = "#6D5EF5";
const confettiColours = ["#6D5EF5", "#a78bfa", "#fbbf24", "#f472b6", "#34d399"];
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

function isWebGpuRenderer(renderer: CompanionRenderer): renderer is WebGPURenderer {
  return "isWebGPURenderer" in renderer && renderer.isWebGPURenderer === true;
}

function hashToUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
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
  featured,
  soleFlankPair,
  contained = false,
  onMotorReady,
  onLoadSettled,
}: {
  entry: CompanionManifestEntry;
  slot: SlotName;
  active: boolean;
  featured: boolean;
  /**
   * Two companions: only the `next` flank is shown — give it a hair more presence
   * than the default side preview.
   */
  soleFlankPair?: boolean;
  contained?: boolean;
  onMotorReady?: (slot: SlotName, motor: CompanionMotor | null) => void;
  onLoadSettled: (slotKey: string) => void;
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
  const idleSeedRef = useRef(hashToUnit(entry.id));

  useEffect(() => {
    const previousSlot = slotRef.current;
    slotRef.current = slot;
    const motor = motorRef.current;
    if (previousSlot !== slot) {
      onMotorReady?.(previousSlot, null);
      if (motor) {
        onMotorReady?.(slot, motor);
      }
    }
    motor?.setShowroomIdle(featured ? "center" : "flank", idleSeedRef.current);
    motor?.setCameraAngle(contained ? "mid-shot" : "full-body", 680);
  }, [contained, featured, onMotorReady, slot]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
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
        companion: null,
        childId: null,
        toggledOff: false,
        activeNodeScreen: null,
        analyser: null,
      });
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop]);

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
    motor.setShowroomIdle(slotRef.current === "current" ? "center" : "flank", idleSeedRef.current);
    motor.setCameraAngle(contained ? "mid-shot" : "full-body", 0);
    motorRef.current = motor;
    onMotorReady?.(slotRef.current, motor);

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

      loadCompanionVrm(resolveModelUrl(entry.vrmUrl), { webgpu: webgpuMaterials })
        .then((vrm) => {
          if (cancelled) {
            vrm.scene.removeFromParent();
            return;
          }
          const size = readMountSize();
          motor.attachVrm(vrm, scene, size.w, size.h);
          motor.setShowroomIdle(slotRef.current === "current" ? "center" : "flank", idleSeedRef.current);
          motor.setCameraAngle(contained ? "mid-shot" : "full-body", 0);
          motor.playAnimation("idle", { loop: true });
          syncRendererToMount();
          requestAnimationFrame(syncRendererToMount);
          startLoop();
          onLoadSettled(slotKey);
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
      onMotorReady?.(slotRef.current, null);
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
  }, [contained, entry.vrmUrl, onLoadSettled, onMotorReady, slotKey, startLoop, stopLoop]);

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
  onPick,
  onClose,
}: {
  entry: CompanionManifestEntry;
  introText: string;
  bonusPoints?: number;
  pickLabel: string;
  picking: boolean;
  onPick: () => void;
  onClose: () => void;
}) {
  const cardAccent = entry.id
    ? `hsl(${(entry.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360}, 70%, 68%)`
    : "#a78bfa";

  return (
    <motion.div
      key="companion-info-card"
      initial={{ opacity: 0, x: 56, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 56, scale: 0.97 }}
      transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
      style={{
        position: "fixed",
        top: "50%",
        right: "clamp(16px, 5vw, 80px)",
        transform: "translateY(-50%)",
        zIndex: 34,
        width: "min(92vw, 860px)",
        maxHeight: "min(78vh, 620px)",
        borderRadius: 18,
        background: "rgba(10, 6, 24, 0.96)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 32px 90px rgba(0,0,0,0.7)",
        display: "flex",
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
          flex: "0 0 52%",
          padding: "32px 28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflowY: "auto",
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

        {entry.traits && entry.traits.length > 0 && (
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
              {entry.traits.map((t) => (
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
        )}

        {entry.subjects && entry.subjects.length > 0 && (
          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
                marginBottom: 12,
              }}
            >
              Subject Strengths
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {entry.subjects.map((s) => (
                <div key={s.label}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{s.emoji}</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {s.label}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#a78bfa",
                        marginLeft: "auto",
                      }}
                    >
                      {s.level}/5
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.07)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(s.level / 5) * 100}%`,
                        borderRadius: 999,
                        background: "linear-gradient(90deg, #6d5ef5, #a78bfa)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {entry.bio && (
          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
                marginBottom: 8,
              }}
            >
              About
            </p>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.75,
                color: "rgba(255,255,255,0.6)",
                fontStyle: "italic",
              }}
            >
              {entry.bio}
            </p>
          </div>
        )}

        {!entry.bio && !entry.traits && (
          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
                marginBottom: 8,
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
        )}

        {bonusPoints != null && bonusPoints > 0 && (
          <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 700 }}>
            ⭐ +{bonusPoints} bonus XP when you pick {entry.name}
          </div>
        )}

        <button
          type="button"
          onClick={onPick}
          disabled={picking}
          style={{
            marginTop: "auto",
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

      {/* ── RIGHT: live 3D canvas (camera already zoomed to close-up) ── */}
      <div
        style={{
          flex: "0 0 48%",
          position: "relative",
          background: `radial-gradient(ellipse at 50% 20%, ${cardAccent}22, transparent 60%), rgba(0,0,0,0.3)`,
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 340,
        }}
      >
        <CompanionSlot
          entry={entry}
          slot="current"
          active
          featured
          contained
          onLoadSettled={() => undefined}
        />

        <div
          style={{
            position: "absolute",
            bottom: 18,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(109,94,245,0.4)",
            borderRadius: 999,
            padding: "6px 18px",
            fontSize: 13,
            fontWeight: 700,
            color: "#c4b5fd",
            whiteSpace: "nowrap",
            maxWidth: "calc(100% - 32px)",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {entry.name}
        </div>
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
  const [initialCurtainDismissed, setInitialCurtainDismissed] = useState(false);
  const [settledSlotKeys, setSettledSlotKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const motorsRef = useRef<Partial<Record<SlotName, CompanionMotor>>>({});
  const timersRef = useRef<Set<number>>(new Set());
  const confettiCleanupRef = useRef<(() => void) | null>(null);
  const musicRef = useRef<AmbientMusicHandle | null>(null);
  const swipeFromXRef = useRef<number | null>(null);

  const entries = COMPANION_MANIFEST;
  const isPairDuo = entries.length === 2;
  const current = entries[currentIndex] ?? null;
  const introText = current ? getText(current.id) : "";
  const slots = useMemo(
    () => createSlotEntries(entries, currentIndex),
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

  const startMusic = useCallback(() => {
    if (!enableBackgroundMusic || !musicOn || musicRef.current) return;
    musicRef.current = createAmbientMusic();
  }, [enableBackgroundMusic, musicOn]);

  const cycle = useCallback(
    (direction: -1 | 1) => {
      if (entries.length <= 1 || spotlightOpen || picking) return;
      setIntroVisible(false);
      setCurrentIndex((prev) => (prev + direction + entries.length) % entries.length);
    },
    [entries.length, picking, spotlightOpen],
  );

  const closeSpotlight = useCallback(() => {
    clearTimers();
    setSpotlightOpen(false);
    setIntroVisible(false);
    setPicking(false);
    // Zoom back to full body on stage
    motorsRef.current.current?.setCameraAngle("full-body", 680);
    Object.values(motorsRef.current).forEach((motor) => {
      motor?.playAnimation("idle", { loop: true });
    });
  }, [clearTimers]);

  const openSpotlight = useCallback(() => {
    if (!current || spotlightOpen) return;
    startMusic();
    clearTimers();
    setSpotlightOpen(true);
    setIntroVisible(false);
    // Zoom current companion to close-up for the info card
    motorsRef.current.current?.setCameraAngle("close-up", 680);
    motorsRef.current.current?.playAnimation("wave", { loop: false });
    motorsRef.current.prev?.playAnimation("nod", { loop: false });
    motorsRef.current.next?.playAnimation("nod", { loop: false });
    schedule(() => setIntroVisible(true), 1600);
  }, [clearTimers, current, schedule, spotlightOpen, startMusic]);

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
    setPicking(true);
    confettiCleanupRef.current?.();
    confettiCleanupRef.current = launchConfetti();
    motorsRef.current.current?.playAnimation("celebrate", { loop: false });
    motorsRef.current.prev?.playAnimation("clap", { loop: false });
    motorsRef.current.next?.playAnimation("clap", { loop: false });
    schedule(() => {
      motorsRef.current.prev?.playAnimation("sad", { loop: false });
      motorsRef.current.next?.playAnimation("sad", { loop: false });
    }, 800);
    schedule(() => {
      confettiCleanupRef.current?.();
      confettiCleanupRef.current = null;
      onSelect(current.id);
    }, 1800);
  }, [current, onSelect, picking, schedule]);

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
      confettiCleanupRef.current?.();
      confettiCleanupRef.current = null;
      musicRef.current?.stop();
      musicRef.current = null;
    };
  }, [clearTimers]);

  useLayoutEffect(() => {
    Object.values(motorsRef.current).forEach((motor) => {
      motor?.playAnimation("idle", { loop: true });
    });
  }, [currentIndex]);

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
          {slots.map((s, i) => {
            const positions = ["10%", "27%", "50%", "73%", "90%"];
            const left = positions[i] ?? "50%";
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
              featured={slot.slot === "current" && !spotlightOpen}
              soleFlankPair={isPairDuo}
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
            Meet me
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
                  onPick={confirmPick}
                  onClose={closeSpotlight}
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
