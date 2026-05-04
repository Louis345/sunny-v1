import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  COMPANION_ANIMATE_TO_EXPRESSION_KEY,
  type CompanionCommand,
} from "../../../src/shared/companions/companionContract";
import type { CompanionCareView } from "../../../src/shared/companionCareTypes";
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../../src/shared/companionTypes";
import { loadCompanionVrm } from "../utils/loadCompanionVrm";
import { CompanionMotor } from "../companion/CompanionMotor";
import { CompanionVfxLayer } from "../companion/CompanionVfxLayer";
import {
  resolveSaiyanVfxLevel,
  shouldUseSaiyanVfx,
} from "../companion/companionVfxState";
import {
  deriveCompanionBehavior,
  type CompanionBehavior,
} from "../context/companionCareBehavior";

/** Interim animate→expression pulse keys (Opus will replace with procedural bones). */
export const ANIMATE_TO_EXPRESSION_KEY = COMPANION_ANIMATE_TO_EXPRESSION_KEY;

export interface CompanionLayerProps {
  childId: string | null;
  companion: CompanionConfig | null;
  toggledOff: boolean;
  /** "portrait": 120×120 fixed bottom-right circle (canvas/game overlay). "full": full-screen overlay (default). */
  mode?: "full" | "portrait";
  /** When true, shrink companion to bottom-right for karaoke reading space. Ignored in portrait mode. */
  karaokeActive?: boolean;
  companionEvents?: CompanionEventPayload[];
  /** Current learning streak; Kefla uses this to enter Saiyan-style VFX states. */
  correctStreak?: number;
  /** Validated `companionAct` commands (voice or map WebSocket). */
  companionCommands?: CompanionCommand[];
  /** @deprecated Prefer companionBehavior from CompanionCareProvider. */
  companionCare?: CompanionCareView | null;
  /** Derived visible behavior from CompanionCareProvider. */
  companionBehavior?: CompanionBehavior | null;
  /** Screen pixel for LookAt (viewport); null drifts gaze toward screen center. */
  activeNodeScreen?: { x: number; y: number } | null;
  /** Playback analyser from `useSession` for mouth sync; omit in diag/tests (no voice pipeline). */
  analyserNodeRef?: RefObject<AnalyserNode | null>;
  /** Short line above companion (non-interactive). */
  speechBubbleText?: string | null;
  /** Current real mic mute state (from useSession). Controls 🔇 overlay in portrait mode. */
  micMuted?: boolean;
  /** Called when portrait is tapped. Should call useSession's toggleMicMute. */
  onToggleMute?: () => void;
}

type CompanionRenderer = WebGPURenderer | THREE.WebGLRenderer;

function isWebGpuRenderer(r: CompanionRenderer): r is WebGPURenderer {
  return "isWebGPURenderer" in r && r.isWebGPURenderer === true;
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

const FEED_EMOJI: Record<string, string> = {
  apple_bite: "🍎",
  brain_berry: "🧠",
  cozy_soup: "🍲",
  star_candy: "🍬",
  mystery_snack: "✨",
};

const COMBO_COLORS = ["#f8fafc", "#facc15", "#fb923c", "#fb7185", "#a855f7", "#ec4899"];
const BURST_EMOJIS = ["✨", "⭐", "💛", "💥", "🌟", "🎉", "🌈", "💖"];

interface FeedComboState {
  count: number;
  eventId: string;
}

let companionFeedAudioContext: AudioContext | null = null;

function getCompanionFeedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return null;
  companionFeedAudioContext ??= new AudioContextCtor();
  return companionFeedAudioContext;
}

function playTone(
  ctx: AudioContext,
  at: number,
  fromHz: number,
  toHz: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromHz, at);
  osc.frequency.exponentialRampToValueAtTime(toHz, at + duration);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.025);
}

function playCompanionFeedSfx(reference: string, comboCount: number) {
  const ctx = getCompanionFeedAudioContext();
  if (!ctx) return;
  void ctx.resume?.().catch(() => undefined);
  const now = ctx.currentTime;

  if (reference === "animation-b") {
    [523, 659, 784, 1046].forEach((hz, index) => {
      playTone(ctx, now + index * 0.055, hz, hz * 1.32, 0.18, 0.055, "triangle");
    });
    playTone(ctx, now + 0.18, 196, 330, 0.32, 0.035, "sine");
    return;
  }

  playTone(ctx, now, 180, 95, 0.075, 0.055, "triangle");
  playTone(ctx, now + 0.075, 420, 760, 0.13, 0.035, "sine");
  if (comboCount >= 2) {
    const start = comboCount >= 5 ? 620 : 520;
    [0, 1, 2].forEach((step) => {
      playTone(
        ctx,
        now + 0.16 + step * 0.055,
        start * (1 + step * 0.22),
        start * (1.25 + step * 0.22),
        0.13,
        comboCount >= 4 ? 0.045 : 0.03,
        "sine",
      );
    });
  }
}

/**
 * Full-screen overlay (pointer-events none); WebGPU canvas when supported, else WebGL fallback (COMPANION-002).
 */
export function CompanionLayer({
  childId,
  companion,
  toggledOff,
  mode = "full",
  karaokeActive = false,
  companionEvents = [],
  correctStreak = 0,
  companionCommands = [],
  companionCare = null,
  companionBehavior = null,
  activeNodeScreen = null,
  analyserNodeRef: analyserNodeRefProp,
  speechBubbleText,
  micMuted = false,
  onToggleMute,
}: CompanionLayerProps) {
  const fallbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const analyserNodeRef = analyserNodeRefProp ?? fallbackAnalyserRef;

  const micMutedRef = useRef(micMuted);
  const modeRef = useRef(mode);
  useLayoutEffect(() => {
    micMutedRef.current = micMuted;
    modeRef.current = mode;
  }, [micMuted, mode]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const toggledOffRef = useRef(toggledOff);
  /** Head bone world position sampled at VRM load; used for portrait camera framing. */
  const portraitHeadPosRef = useRef<THREE.Vector3 | null>(null);

  const motorRef = useRef<CompanionMotor | null>(null);
  const vfxLayerRef = useRef<CompanionVfxLayer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<CompanionRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<THREE.Timer | null>(null);

  const companionEventsRef = useRef<CompanionEventPayload[]>(companionEvents);
  const correctStreakRef = useRef(correctStreak);
  const childIdRef = useRef<string | null>(childId);
  const companionRef = useRef<CompanionConfig | null>(companion);
  const activeNodeScreenRef = useRef(activeNodeScreen);
  const behavior = companionBehavior ?? deriveCompanionBehavior(companionCare);
  const feedEffect = behavior.feedAnimation;
  const feedEmoji = feedEffect ? (FEED_EMOJI[feedEffect.itemId] ?? "🍎") : null;
  const layerZIndex = feedEffect ? 12050 : 15;
  const [feedCombo, setFeedCombo] = useState<FeedComboState | null>(null);
  const feedComboRef = useRef<{ count: number; lastAt: number; eventId: string | null }>({
    count: 0,
    lastAt: 0,
    eventId: null,
  });
  const comboCount = feedEffect?.reference === "animation-b" ? Math.max(feedCombo?.count ?? 1, 5) : feedCombo?.count ?? 0;
  const comboColor = COMBO_COLORS[Math.min(comboCount, COMBO_COLORS.length - 1)] ?? COMBO_COLORS[0];
  const comboLabel =
    feedEffect?.reference === "animation-b"
      ? "SUPER FULL!"
      : comboCount >= 5
        ? "SUPER!"
        : comboCount >= 4
          ? "4x MEGA!"
          : comboCount >= 3
            ? "3x COMBO!"
            : comboCount >= 2
              ? "2x COMBO!"
              : null;
  const burstCount = feedEffect?.reference === "animation-b" ? 24 : comboCount >= 5 ? 22 : comboCount >= 4 ? 18 : comboCount >= 3 ? 14 : comboCount >= 2 ? 9 : 0;
  const behaviorRef = useRef(behavior);
  useLayoutEffect(() => {
    companionEventsRef.current = companionEvents;
    correctStreakRef.current = correctStreak;
    toggledOffRef.current = toggledOff;
    childIdRef.current = childId;
    companionRef.current = companion;
    activeNodeScreenRef.current = activeNodeScreen;
    behaviorRef.current = behavior;
  }, [companionEvents, correctStreak, toggledOff, childId, companion, activeNodeScreen]);

  useLayoutEffect(() => {
    behaviorRef.current = behavior;
  }, [behavior]);

  useEffect(() => {
    if (!feedEffect) return;
    const eventId = behavior.animationEventId ?? `${feedEffect.reference}:${feedEffect.itemId}`;
    if (feedComboRef.current.eventId === eventId) return;

    const now = Date.now();
    const nextCount =
      now - feedComboRef.current.lastAt <= 2500
        ? Math.min(feedComboRef.current.count + 1, 5)
        : 1;
    feedComboRef.current = { count: nextCount, lastAt: now, eventId };
    setFeedCombo({ count: nextCount, eventId });
    playCompanionFeedSfx(feedEffect.reference, nextCount);
  }, [behavior.animationEventId, feedEffect]);

  const applyBehaviorToMotor = useCallback(
    (nextBehavior: CompanionBehavior) => {
      if (!childId || !motorRef.current?.hasVrm()) return;
      const now = Date.now();
      const commands: CompanionCommand[] = [
        {
          apiVersion: "1.0",
          type: "emote",
          payload: {
            emote: nextBehavior.emote,
            intensity: nextBehavior.intensity,
          },
          childId,
          timestamp: now,
          source: "diag",
        },
      ];
      if (nextBehavior.animation) {
        commands.push({
          apiVersion: "1.0",
          type: "animate",
          payload: { animation: nextBehavior.animation, loop: false },
          childId,
          timestamp: now + 1,
          source: "diag",
        });
      }
      motorRef.current.processCompanionCommands(
        commands,
        childId,
        companionRef.current,
      );
    },
    [childId],
  );

  useLayoutEffect(() => {
    motorRef.current?.processCompanionCommands(
      companionCommands,
      childId,
      companionRef.current,
    );
  }, [companionCommands, childId, companion]);

  useLayoutEffect(() => {
    applyBehaviorToMotor(behavior);
  }, [
    applyBehaviorToMotor,
    behavior.animation,
    behavior.animationEventId,
    behavior.emote,
    behavior.intensity,
  ]);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    const motor = motorRef.current;
    if (!mount || !motor?.hasVrm()) return;
    const w = Math.floor(mount.clientWidth || 1);
    const h = Math.floor(mount.clientHeight || 1);
    motor.syncCameraToMount(w, h);
  }, [karaokeActive]);

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

    let tickCount = 0;
    const tick = (time: number) => {
      const motor = motorRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!motor?.hasVrm() || !scene || !camera || !renderer) {
        rafRef.current = null;
        return;
      }
      if (toggledOffRef.current) {
        rafRef.current = null;
        return;
      }
      tickCount += 1;
      if (tickCount % 90 === 0) {
        console.log("companionEvents:", companionEventsRef.current);
      }
      timer.update(time);
      const dt = timer.getDelta();
      /** Cap so RAF gaps / loop restarts do not burn a whole reaction in one tick. */
      const dtMs = Math.min(dt * 1000, 100);
      motor.tick({
        dt,
        dtMs,
        companionEvents: companionEventsRef.current,
        companion: companionRef.current,
        childId: childIdRef.current,
        toggledOff: toggledOffRef.current || micMutedRef.current,
        activeNodeScreen: activeNodeScreenRef.current,
        analyser: analyserNodeRef.current,
      });
      const vfxLayer = vfxLayerRef.current;
      if (vfxLayer) {
        vfxLayer.setLevel(resolveSaiyanVfxLevel({
          companionId: companionRef.current?.companionId,
          correctStreak: correctStreakRef.current,
          companionEvents: companionEventsRef.current,
        }));
        vfxLayer.tick(dt, camera);
      }
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop, analyserNodeRef]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) {
      wrap.style.display = toggledOff
        ? "none"
        : mode === "portrait"
          ? "flex"
          : "block";
    }
    if (toggledOff) {
      stopLoop();
    } else if (motorRef.current?.hasVrm()) {
      startLoop();
    }
  }, [toggledOff, mode, startLoop, stopLoop]);

  /** New events must be visible to RAF tick immediately (ref sync alone can lag one frame vs WS). */
  useLayoutEffect(() => {
    if (toggledOffRef.current || !motorRef.current?.hasVrm()) return;
    startLoop();
  }, [companionEvents, companionCommands, startLoop]);

  useEffect(() => {
    if (!childId || !companion) {
      stopLoop();
      const r = rendererRef.current;
      const s = sceneRef.current;
      vfxLayerRef.current?.dispose();
      vfxLayerRef.current = null;
      motorRef.current?.dispose();
      motorRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      timerRef.current?.dispose();
      timerRef.current = null;
      if (r) {
        const canvas = r.domElement;
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
        r.dispose();
      }
      if (s) {
        s.clear();
      }
      return;
    }

    const mount = mountRef.current;
    if (!mount) {
      console.error("CompanionLayer: [effect] mountRef.current is null — skip Three setup");
      return;
    }

    let cancelled = false;
    portraitHeadPosRef.current = null;
    stopLoop();

    const readMountSize = () => {
      const rawW = Math.floor(mountRef.current?.clientWidth ?? 0);
      const rawH = Math.floor(mountRef.current?.clientHeight ?? 0);
      const w = rawW > 0 ? rawW : 1;
      const h = rawH > 0 ? rawH : 1;
      return { w, h };
    };

    const applyPortraitCamera = (cam: THREE.PerspectiveCamera, headPos: THREE.Vector3) => {
      // ─── Portrait framing knobs ───────────────────────────────────────────
      // headPos is the skull-base bone in world space (from vrm.humanoid).
      //
      // CAMERA Z-OFFSET (distance in front of face, metres)
      //   Smaller → zoom in (tighter face crop)
      //   Larger  → zoom out (more body visible)
      const zOffset = 0.65;

      // CAMERA Y-OFFSET (vertical shift of camera body relative to head bone)
      //   More negative → camera lower  → slight upward look angle
      //   Less negative → camera higher → more level / slight downward angle
      const camYOffset = -0.02;

      // LOOK-AT Y-OFFSET (point the camera aims at, relative to head bone)
      //   More negative → aim lower (chin/neck) → head moves toward top of frame
      //   Less negative → aim higher (eyes/forehead) → head moves toward bottom
      const lookAtYOffset = -0.04;

      // FOV (degrees) — affects how much is visible at the given distance
      //   Lower → telephoto / tighter  |  Higher → wider / more context
      const fov = 28;
      // ─────────────────────────────────────────────────────────────────────

      cam.position.set(headPos.x, headPos.y + camYOffset, headPos.z + zOffset);
      cam.fov = fov;
      cam.aspect = 1; // portrait container is always 1:1
      cam.updateProjectionMatrix();
      cam.lookAt(headPos.x, headPos.y + lookAtYOffset, headPos.z);
    };

    const syncRendererToMount = (reason: string) => {
      const cam = cameraRef.current;
      const ren = rendererRef.current;
      const motor = motorRef.current;
      if (!cam || !ren || cancelled) return;
      const { w, h } = readMountSize();
      ren.setSize(w, h);
      const headPos = portraitHeadPosRef.current;
      if (modeRef.current === "portrait" && headPos) {
        applyPortraitCamera(cam, headPos);
      } else {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        if (motor?.hasVrm()) {
          motor.syncCameraToMount(w, h);
        }
      }
      console.log("CompanionLayer: [sync]", reason, { w, h, aspect: cam.aspect });
    };

    const motor = new CompanionMotor();
    motorRef.current = motor;
    motor.resetSessionState();
    console.log("CompanionLayer: [effect] building scene for child", childId);
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    if (shouldUseSaiyanVfx(companion.companionId)) {
      const vfxLayer = new CompanionVfxLayer("yellow_power_aura");
      vfxLayer.setLevel(resolveSaiyanVfxLevel({
        companionId: companion.companionId,
        correctStreak,
        companionEvents,
      }));
      scene.add(vfxLayer.group);
      vfxLayerRef.current = vfxLayer;
    } else {
      vfxLayerRef.current = null;
    }

    const { w: cw0, h: ch0 } = readMountSize();
    const camera = new THREE.PerspectiveCamera(22, cw0 / ch0, 0.05, 50);
    camera.position.set(0, 1, -3);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;
    motor.setCamera(camera);
    console.log("CompanionLayer: [effect] scene + camera ready", {
      aspect: camera.aspect,
      mountCss: {
        w: mountRef.current?.clientWidth ?? 0,
        h: mountRef.current?.clientHeight ?? 0,
      },
      usedSize: { w: cw0, h: ch0 },
    });

    const finishSetup = (renderer: CompanionRenderer, webgpuMaterials: boolean) => {
      console.log("CompanionLayer: [finishSetup] enter", { webgpuMaterials, cancelled });
      if (cancelled) {
        console.log("CompanionLayer: [finishSetup] cancelled, disposing renderer");
        renderer.dispose();
        return;
      }
      rendererRef.current = renderer;

      const canvas = renderer.domElement;
      canvas.style.zIndex = "10";
      canvas.style.pointerEvents = "none";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      console.log("CompanionLayer: [finishSetup] canvas styled (already in DOM)");

      const amb = new THREE.AmbientLight(0xffffff, 0.62);
      const dir = new THREE.DirectionalLight(0xffffff, 0.88);
      dir.position.set(1.2, 2.2, 0.8);
      scene.add(amb, dir);
      console.log("CompanionLayer: [finishSetup] lights added, loading VRM...");

      const modelUrl = resolveModelUrl(companion.vrmUrl);
      console.log("CompanionLayer: [finishSetup] calling loadCompanionVrm", modelUrl, {
        webgpu: webgpuMaterials,
      });
      loadCompanionVrm(modelUrl, { webgpu: webgpuMaterials })
      .then((vrm) => {
        if (cancelled) {
          vrm.scene.removeFromParent();
          return;
        }
        const { w: mw, h: mh } = readMountSize();
        motor.attachVrm(vrm, scene, mw, mh);
        applyBehaviorToMotor(behaviorRef.current);

        if (modeRef.current === "portrait") {
          // Sample head bone world position for accurate face+shoulders framing.
          // Bounding-box fraction math is unreliable for tight close-ups.
          const getNormBone = vrm.humanoid?.getNormalizedBoneNode;
          const headBone =
            typeof getNormBone === "function"
              ? getNormBone.call(vrm.humanoid, "head")
              : null;
          if (headBone) {
            const headPos = new THREE.Vector3();
            headBone.getWorldPosition(headPos);
            portraitHeadPosRef.current = headPos;
          }
        }

        syncRendererToMount("after VRM load");
        requestAnimationFrame(() => syncRendererToMount("rAF1 post VRM"));
        requestAnimationFrame(() =>
          requestAnimationFrame(() => syncRendererToMount("rAF2 post VRM")),
        );

        console.log("CompanionLayer: [VRM] loaded, starting loop if visible");
        if (!toggledOffRef.current) {
          startLoop();
        }
      })
      .catch((err: unknown) => {
        console.error("CompanionLayer: failed to load or validate VRM —", err);
      });
    };

    const onResize = () => {
      syncRendererToMount("window resize");
    };
    window.addEventListener("resize", onResize);

    let mountResizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      mountResizeObserver = new ResizeObserver(() => {
        syncRendererToMount("mount ResizeObserver");
      });
      mountResizeObserver.observe(mount);
    }

    void (async () => {
      console.log("CompanionLayer: [init] async renderer setup started");
      if (cancelled) {
        console.log("CompanionLayer: [init] aborted (cancelled before create)");
        return;
      }

      let renderer: CompanionRenderer | undefined;
      let webgpuAttempt: WebGPURenderer | undefined;

      try {
        console.log("CompanionLayer: [init] constructing WebGPURenderer...");
        webgpuAttempt = new WebGPURenderer({ antialias: true });
        console.log("CompanionLayer: [init] awaiting webgpuAttempt.init()...");
        await webgpuAttempt.init();
        console.log("CompanionLayer: [init] WebGPURenderer init() succeeded");
        renderer = webgpuAttempt;
      } catch (e: unknown) {
        console.error("WebGPU failed, falling back:", e);
        if (webgpuAttempt) {
          try {
            webgpuAttempt.dispose();
          } catch (disposeErr: unknown) {
            console.error("CompanionLayer: [init] WebGPU dispose after failure:", disposeErr);
          }
        }
        console.log("CompanionLayer: [init] constructing THREE.WebGLRenderer fallback...");
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
        console.log("CompanionLayer: [init] WebGLRenderer constructed");
      }

      if (cancelled || !renderer) {
        console.log("CompanionLayer: [init] stop after create", { cancelled, hasRenderer: Boolean(renderer) });
        renderer?.dispose();
        return;
      }

      if (!mount) {
        console.error("CompanionLayer: [init] mount ref missing, cannot append canvas");
        renderer.dispose();
        return;
      }

      const { w: iw, h: ih } = readMountSize();
      renderer.setSize(iw, ih);
      renderer.setClearColor(0x000000, 0);
      console.log("CompanionLayer: [init] setClearColor(0x000000, 0)");

      const pr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2);
      renderer.setPixelRatio(pr);
      console.log("CompanionLayer: [init] setPixelRatio", pr);

      mount.appendChild(renderer.domElement);
      console.log("Renderer canvas appended");

      syncRendererToMount("post-append");
      requestAnimationFrame(() => syncRendererToMount("rAF1 post-append"));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => syncRendererToMount("rAF2 post-append")),
      );

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      if (!isWebGpuRenderer(renderer)) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }

      const webgpuMaterials = isWebGpuRenderer(renderer);
      console.log("CompanionLayer: [init] material pipeline", webgpuMaterials ? "WebGPU (MToonNode)" : "WebGL (classic MToon)");
      finishSetup(renderer, webgpuMaterials);
    })();

    return () => {
      cancelled = true;
      mountResizeObserver?.disconnect();
      window.removeEventListener("resize", onResize);
      stopLoop();
      vfxLayerRef.current?.dispose();
      vfxLayerRef.current = null;
      motor.dispose();
      motorRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      timerRef.current?.dispose();
      timerRef.current = null;
      if (rendererRef.current) {
        const c = rendererRef.current.domElement;
        if (c.parentNode) {
          c.parentNode.removeChild(c);
        }
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, [childId, companion?.companionId, companion?.vrmUrl, mode, startLoop, stopLoop]);

  if (!childId || !companion) {
    return null;
  }

  if (mode === "portrait") {
    return (
      <div
        ref={wrapRef}
        data-testid="companion-portrait-stack"
        data-companion-care-mood={behavior.mood}
        data-companion-care-state={behavior.presentationState}
        data-companion-care-low={behavior.low ? "true" : "false"}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {speechBubbleText ? (
          <div
            data-testid="companion-speech-bubble"
            style={{
              position: "relative",
              maxWidth: 220,
              padding: "10px 14px",
              borderRadius: 14,
              background: "rgba(15,23,42,0.88)",
              color: "#f8fafc",
              fontSize: 14,
              lineHeight: 1.35,
              pointerEvents: "none",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            {speechBubbleText}
          </div>
        ) : null}
        <div
          data-testid="companion-portrait"
          onClick={() => onToggleMute?.()}
          style={{
            position: "relative",
            width: 120,
            height: 120,
            borderRadius: "50%",
            overflow: "hidden",
            cursor: "pointer",
            pointerEvents: "auto",
            filter: behavior.visualTreatment.filter,
            opacity: behavior.visualTreatment.opacity,
            transition: "filter 220ms ease, opacity 220ms ease",
          }}
        >
          <div
            ref={mountRef}
            style={{ width: "100%", height: "100%", pointerEvents: "none" }}
          />
          {feedEffect && feedEmoji ? (
            <div
              key={behavior.animationEventId ?? `${feedEffect.reference}:${feedEffect.itemId}`}
              data-testid="companion-feed-effect"
              data-feed-animation={feedEffect.reference}
              style={{
                position: "absolute",
                left: feedEffect.reference === "animation-b" ? "50%" : "18%",
                top: feedEffect.reference === "animation-b" ? "22%" : "72%",
                fontSize: feedEffect.reference === "animation-b" ? 32 : 24,
                transform: "translate(-50%, -50%)",
                animation:
                  feedEffect.reference === "animation-b"
                    ? "companion-loot-pop 2300ms ease both"
                    : "companion-food-arc 900ms ease both",
                filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
                zIndex: 4,
              }}
            >
              {feedEmoji}
            </div>
          ) : null}
          {feedEffect?.reference === "animation-b" ? (
            <div
              key={`${behavior.animationEventId ?? feedEffect.itemId}:banner`}
              data-testid="companion-loot-banner"
              style={{
                position: "absolute",
                left: "50%",
                top: "8%",
                transform: "translateX(-50%)",
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #fde68a",
                background: "rgba(88,28,135,0.9)",
                color: "#fde68a",
                fontSize: 10,
                fontWeight: 900,
                whiteSpace: "nowrap",
                animation: "companion-loot-pop 2300ms ease both",
                zIndex: 5,
              }}
            >
              RARE BOOST
            </div>
          ) : null}
          <style>{`
            @keyframes companion-food-arc {
              0% { opacity: 0; transform: translate(-110px, 46px) scale(.7) rotate(-10deg); }
              55% { opacity: 1; transform: translate(-40px, -40px) scale(1.18) rotate(8deg); }
              100% { opacity: 0; transform: translate(-50%, -50%) scale(.55) rotate(0deg); }
            }
            @keyframes companion-loot-pop {
              0% { opacity: 0; transform: translate(-50%, -50%) scale(.25); }
              25% { opacity: 1; transform: translate(-50%, -50%) scale(1.18); }
              75% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
              100% { opacity: 0; transform: translate(-50%, -50%) scale(.82); }
            }
          `}</style>
          {micMuted && (
            <div
              data-testid="companion-muted-overlay"
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
              }}
            >
              🔇
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      data-testid="companion-layer-stack"
      className="fixed inset-0"
      data-companion-care-mood={behavior.mood}
      data-companion-care-state={behavior.presentationState}
      data-companion-care-low={behavior.low ? "true" : "false"}
      style={{ pointerEvents: "none", zIndex: layerZIndex }}
      aria-hidden
    >
      {speechBubbleText ? (
        <div
          style={{
            position: "fixed",
            bottom: karaokeActive ? "22vh" : "min(72vh, 95%)",
            right: karaokeActive ? 20 : "max(2vw, 12px)",
            maxWidth: 260,
            padding: "10px 14px",
            borderRadius: 14,
            background: "rgba(15,23,42,0.88)",
            color: "#f8fafc",
            fontSize: 14,
            lineHeight: 1.35,
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            zIndex: 16,
          }}
        >
          {speechBubbleText}
        </div>
      ) : null}
      {feedEffect && feedEmoji ? (
        <div
          key={behavior.animationEventId ?? `${feedEffect.reference}:${feedEffect.itemId}`}
          data-testid="companion-feed-effect"
          data-feed-animation={feedEffect.reference}
          style={{
            position: "fixed",
            right: feedEffect.reference === "animation-b" ? "17vw" : "18vw",
            bottom: feedEffect.reference === "animation-b" ? "56vh" : "42vh",
            fontSize: feedEffect.reference === "animation-b" ? 56 : 44,
            transform: "translate(-50%, -50%)",
            animationName:
              feedEffect.reference === "animation-b"
                ? "companion-loot-drop"
                : "companion-chomp-arc",
            animationDuration: feedEffect.reference === "animation-b" ? "2600ms" : "1100ms",
            animationTimingFunction: "cubic-bezier(.34,1.56,.64,1)",
            animationFillMode: "both",
            filter: "drop-shadow(0 5px 14px rgba(0,0,0,0.45))",
            zIndex: 12060,
          }}
        >
          {feedEmoji}
        </div>
      ) : null}
      {feedEffect?.reference === "animation-b" ? (
        <div
          key={`${behavior.animationEventId ?? feedEffect.itemId}:banner`}
          data-testid="companion-loot-banner"
          style={{
            position: "fixed",
            right: "20vw",
            bottom: "62vh",
            transform: "translateX(50%)",
            padding: "12px 18px",
            borderRadius: 18,
            border: "2px solid #fde68a",
            background: "rgba(88,28,135,0.88)",
            color: "#fde68a",
            fontSize: 18,
            fontWeight: 900,
            boxShadow: "0 0 34px rgba(250,204,21,0.38)",
            animation: "companion-loot-drop 2600ms cubic-bezier(.34,1.56,.64,1) both",
            zIndex: 12061,
          }}
        >
          ✨ RARE BOOST!
        </div>
      ) : null}
      {comboLabel ? (
        <div
          key={`${feedCombo?.eventId ?? behavior.animationEventId ?? feedEffect?.itemId}:combo`}
          data-testid="companion-combo-badge"
          style={{
            position: "fixed",
            left: "50%",
            top: comboCount >= 5 ? "26%" : "30%",
            transform: "translate(-50%, -50%)",
            color: comboColor,
            fontFamily: "Fredoka, ui-rounded, system-ui, sans-serif",
            fontSize: comboCount >= 5 ? "clamp(42px, 7vw, 96px)" : "clamp(28px, 4.5vw, 58px)",
            fontWeight: 900,
            letterSpacing: 0,
            textShadow: `0 0 28px ${comboColor}, 0 3px 10px rgba(0,0,0,0.72)`,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            animation: comboCount >= 5
              ? "companion-super-badge 2600ms cubic-bezier(.34,1.56,.64,1) both"
              : "companion-combo-pop 1350ms cubic-bezier(.34,1.56,.64,1) both",
            zIndex: 12064,
          }}
        >
          {comboCount >= 5 ? "🌈 " : null}
          {comboLabel}
        </div>
      ) : null}
      {burstCount > 0 ? (
        <div
          key={`${feedCombo?.eventId ?? behavior.animationEventId ?? feedEffect?.itemId}:burst`}
          data-testid="companion-feed-burst"
          style={{
            position: "fixed",
            left: "50%",
            top: comboCount >= 5 ? "34%" : "38%",
            width: 1,
            height: 1,
            pointerEvents: "none",
            zIndex: 12063,
          }}
        >
          {Array.from({ length: burstCount }, (_, i) => {
            const angle = (i / burstCount) * 360;
            const distance = comboCount >= 5 ? 210 : feedEffect?.reference === "animation-b" ? 170 : 110;
            const emoji =
              feedEffect?.reference === "animation-b"
                ? ["💎", "✨", "⭐", "🌟"][i % 4]
                : BURST_EMOJIS[i % BURST_EMOJIS.length];
            return (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  fontSize: comboCount >= 5 ? 28 : 22,
                  transform: "translate(-50%, -50%)",
                  animation: `companion-burst-particle ${feedEffect?.reference === "animation-b" ? 2400 : 1500}ms ease-out both`,
                  animationDelay: `${(i % 5) * 35}ms`,
                  ["--burst-x" as string]: `${Math.cos((angle * Math.PI) / 180) * distance}px`,
                  ["--burst-y" as string]: `${Math.sin((angle * Math.PI) / 180) * distance}px`,
                }}
              >
                {emoji}
              </span>
            );
          })}
        </div>
      ) : null}
      <div
        ref={mountRef}
        className="pointer-events-none overflow-hidden"
        style={{
          position: "fixed",
          width: "min(28vw, 40%)",
          height: "min(72vh, 95%)",
          bottom: karaokeActive ? 12 : 0,
          right: karaokeActive ? 12 : "2vw",
          zIndex: 15,
          filter: behavior.visualTreatment.filter,
          opacity: behavior.visualTreatment.opacity,
          transition: "filter 220ms ease, opacity 220ms ease",
          transform: karaokeActive ? "scale(0.2)" : undefined,
          transformOrigin: karaokeActive ? "bottom right" : undefined,
        }}
      />
      <style>{`
        @keyframes companion-chomp-arc {
          0% { opacity: 0; transform: translate(-46vw, 34vh) scale(.65) rotate(-14deg); }
          45% { opacity: 1; transform: translate(-20vw, -11vh) scale(1.2) rotate(9deg); }
          78% { opacity: 1; transform: translate(-3vw, 1vh) scale(.9) rotate(0deg); }
          100% { opacity: 0; transform: translate(0, 0) scale(.45) rotate(0deg); }
        }
        @keyframes companion-loot-drop {
          0% { opacity: 0; transform: translate(-26vw, 24vh) scale(.35) rotate(-10deg); }
          18% { opacity: 1; transform: translate(-12vw, -10vh) scale(1.22) rotate(8deg); }
          78% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(.82); }
        }
        @keyframes companion-combo-pop {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.38); }
          22% { opacity: 1; transform: translate(-50%, -50%) scale(1.18); }
          76% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -60%) scale(.88); }
        }
        @keyframes companion-super-badge {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.25) rotate(-3deg); filter: brightness(1); }
          18% { opacity: 1; transform: translate(-50%, -50%) scale(1.16) rotate(2deg); filter: brightness(1.45); }
          82% { opacity: 1; transform: translate(-50%, -50%) scale(1); filter: brightness(1.1); }
          100% { opacity: 0; transform: translate(-50%, -64%) scale(.82); filter: brightness(1); }
        }
        @keyframes companion-burst-particle {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.3) rotate(0deg); }
          16% { opacity: 1; }
          78% { opacity: 1; }
          100% { opacity: 0; transform: translate(calc(-50% + var(--burst-x)), calc(-50% + var(--burst-y))) scale(.72) rotate(220deg); }
        }
      `}</style>
    </div>
  );
}
