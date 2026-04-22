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
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../../src/shared/companionTypes";
import { loadCompanionVrm } from "../utils/loadCompanionVrm";
import { CompanionMotor } from "../companion/CompanionMotor";

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
  /** Validated `companionAct` commands (voice or map WebSocket). */
  companionCommands?: CompanionCommand[];
  /** Screen pixel for LookAt (viewport); null drifts gaze toward screen center. */
  activeNodeScreen?: { x: number; y: number } | null;
  /** Playback analyser from `useSession` for mouth sync; omit in diag/tests (no voice pipeline). */
  analyserNodeRef?: RefObject<AnalyserNode | null>;
  /** Short line above companion (non-interactive). */
  speechBubbleText?: string | null;
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
  companionCommands = [],
  activeNodeScreen = null,
  analyserNodeRef: analyserNodeRefProp,
  speechBubbleText,
}: CompanionLayerProps) {
  const fallbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const analyserNodeRef = analyserNodeRefProp ?? fallbackAnalyserRef;

  const [portraitMuted, setPortraitMuted] = useState(false);
  const portraitMutedRef = useRef(portraitMuted);
  const modeRef = useRef(mode);
  useLayoutEffect(() => {
    portraitMutedRef.current = portraitMuted;
    modeRef.current = mode;
  }, [portraitMuted, mode]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const toggledOffRef = useRef(toggledOff);
  /** Head bone world position sampled at VRM load; used for portrait camera framing. */
  const portraitHeadPosRef = useRef<THREE.Vector3 | null>(null);

  const motorRef = useRef<CompanionMotor | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<CompanionRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<THREE.Timer | null>(null);

  const companionEventsRef = useRef<CompanionEventPayload[]>(companionEvents);
  const childIdRef = useRef<string | null>(childId);
  const companionRef = useRef<CompanionConfig | null>(companion);
  const activeNodeScreenRef = useRef(activeNodeScreen);
  useLayoutEffect(() => {
    companionEventsRef.current = companionEvents;
    toggledOffRef.current = toggledOff;
    childIdRef.current = childId;
    companionRef.current = companion;
    activeNodeScreenRef.current = activeNodeScreen;
  }, [companionEvents, toggledOff, childId, companion, activeNodeScreen]);

  useLayoutEffect(() => {
    motorRef.current?.processCompanionCommands(
      companionCommands,
      childId,
      companionRef.current,
    );
  }, [companionCommands, childId, companion]);

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
        toggledOff: toggledOffRef.current || portraitMutedRef.current,
        activeNodeScreen: activeNodeScreenRef.current,
        analyser: analyserNodeRef.current,
      });
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop, analyserNodeRef]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) {
      wrap.style.display = toggledOff ? "none" : "block";
    }
    if (toggledOff) {
      stopLoop();
    } else if (motorRef.current?.hasVrm()) {
      startLoop();
    }
  }, [toggledOff, startLoop, stopLoop]);

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
  }, [childId, companion?.vrmUrl, mode, startLoop, stopLoop]);

  if (!childId || !companion) {
    return null;
  }

  if (mode === "portrait") {
    return (
      <div
        data-testid="companion-portrait"
        ref={wrapRef}
        onClick={() => setPortraitMuted((m) => !m)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 120,
          height: 120,
          borderRadius: "50%",
          overflow: "hidden",
          zIndex: 9999,
          cursor: "pointer",
        }}
      >
        <div
          ref={mountRef}
          style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        />
        {portraitMuted && (
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
    );
  }

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[15]"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {speechBubbleText ? (
        <div
          style={{
            position: "fixed",
            bottom: karaokeActive ? "22vh" : "min(68vh, calc(10vh + min(56vh, 85%) + 8px))",
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
      <div
        ref={mountRef}
        className="pointer-events-none overflow-hidden"
        style={{
          position: "fixed",
          width: "min(28vw, 40%)",
          height: "min(56vh, 85%)",
          bottom: karaokeActive ? 12 : "10vh",
          right: karaokeActive ? 12 : "2vw",
          zIndex: 15,
          transform: karaokeActive ? "scale(0.2)" : undefined,
          transformOrigin: karaokeActive ? "bottom right" : undefined,
        }}
      />
    </div>
  );
}
