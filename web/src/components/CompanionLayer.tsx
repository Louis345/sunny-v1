import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import type { VRM } from "@pixiv/three-vrm";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../../src/shared/companionTypes";
import { isCompanionEmote } from "../../../src/shared/companionEmotes";
import {
  applyAcceptedEmote,
  applyAcceptedTrigger,
  applyExpressionStateToVrm,
  applyThinkingHeadTiltToVrm,
  CompanionEventDeduper,
  createNeutralExpressionState,
  pickEmotesToApply,
  pickTriggersToApply,
  tickExpressionDecay,
  type ExpressionDecayState,
} from "../utils/companionExpressions";
import {
  applyIdleMotionToVrm,
  createInitialIdleState,
  expressionBlocksIdle,
  screenPixelToLookTargetWorld,
  tickCompanionIdle,
  type CompanionIdleState,
} from "../utils/companionIdle";
import { audioAnalyserRef, updateMouthSync } from "../utils/audioAnalyser";
import {
  startCameraTransition,
  tickCameraTransition,
  type CameraAnimState,
} from "../utils/companionCamera";
import { loadCompanionVrm } from "../utils/loadCompanionVrm";
import {
  COMPANION_MOVE_OFFSETS,
  mapAnimationToEmote,
  moveSpeedToLerpPerFrame,
} from "../../../src/shared/companions/companionAnimateBridge";

export interface CompanionLayerProps {
  childId: string | null;
  companion: CompanionConfig | null;
  toggledOff: boolean;
  companionEvents?: CompanionEventPayload[];
  /** Validated `companionAct` commands (voice or map WebSocket). */
  companionCommands?: CompanionCommand[];
  /** Screen pixel for LookAt (viewport); null drifts gaze toward screen center. */
  activeNodeScreen?: { x: number; y: number } | null;
}

type CompanionRenderer = WebGPURenderer | THREE.WebGLRenderer;

function isWebGpuRenderer(r: CompanionRenderer): r is WebGPURenderer {
  return "isWebGPURenderer" in r && r.isWebGPURenderer === true;
}

/** Fixed companion viewport (px); mount uses CSS `position:fixed` with these — no flex sizing. */
const COMPANION_MOUNT_W = 200;
const COMPANION_MOUNT_H = 400;

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
  companionEvents = [],
  companionCommands = [],
  activeNodeScreen = null,
}: CompanionLayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const toggledOffRef = useRef(toggledOff);
  toggledOffRef.current = toggledOff;

  const vrmRef = useRef<VRM | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<CompanionRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<THREE.Timer | null>(null);

  const companionEventsRef = useRef<CompanionEventPayload[]>(companionEvents);
  useLayoutEffect(() => {
    companionEventsRef.current = companionEvents;
  }, [companionEvents]);
  const childIdRef = useRef<string | null>(childId);
  childIdRef.current = childId;
  const companionRef = useRef<CompanionConfig | null>(companion);
  companionRef.current = companion;
  const expressionStateRef = useRef<ExpressionDecayState>(createNeutralExpressionState());
  const eventDeduperRef = useRef<CompanionEventDeduper>(new CompanionEventDeduper());
  const idleStateRef = useRef<CompanionIdleState>(createInitialIdleState());
  const lookTargetRef = useRef<THREE.Object3D | null>(null);
  const scratchVecRef = useRef(new THREE.Vector3());
  const activeNodeScreenRef = useRef(activeNodeScreen);
  activeNodeScreenRef.current = activeNodeScreen;

  const processedCommandKeysRef = useRef<Set<string>>(new Set());
  const cameraAnimRef = useRef<CameraAnimState | null>(null);
  const cameraScratchRef = useRef(new THREE.Vector3());
  const moveTargetRef = useRef<{ x: number; z: number } | null>(null);
  const moveLerpRef = useRef(0.065);

  useLayoutEffect(() => {
    const want = childId?.trim().toLowerCase() ?? "";
    for (const cmd of companionCommands) {
      if (want && cmd.childId.trim().toLowerCase() !== want) continue;
      const key = `${cmd.timestamp}|${cmd.type}|${cmd.childId}|${cmd.source}`;
      if (processedCommandKeysRef.current.has(key)) continue;
      processedCommandKeysRef.current.add(key);
      if (processedCommandKeysRef.current.size > 256) {
        const sorted = [...processedCommandKeysRef.current].sort();
        for (let i = 0; i < sorted.length - 128; i++) {
          processedCommandKeysRef.current.delete(sorted[i]!);
        }
      }
      const cam = cameraRef.current;
      if (cmd.type === "emote") {
        const em = cmd.payload.emote;
        if (isCompanionEmote(em)) {
          const intRaw = cmd.payload.intensity;
          const intensity =
            typeof intRaw === "number" && Number.isFinite(intRaw)
              ? intRaw
              : undefined;
          applyAcceptedEmote(expressionStateRef.current, em, intensity);
        }
      } else if (cmd.type === "camera" && cam) {
        const angle = String(cmd.payload.angle ?? "mid-shot");
        const tr = cmd.payload.transition_ms;
        const transitionMs =
          typeof tr === "number" && Number.isFinite(tr) ? tr : undefined;
        startCameraTransition(
          cam,
          angle,
          transitionMs,
          cameraAnimRef,
          cameraScratchRef.current,
        );
      } else if (cmd.type === "animate") {
        const anim = typeof cmd.payload.animation === "string" ? cmd.payload.animation : "idle";
        const em = mapAnimationToEmote(anim);
        if (em && isCompanionEmote(em)) {
          applyAcceptedEmote(expressionStateRef.current, em);
          console.log("🎮 [CompanionLayer] companion_command animate", anim, "→", em);
        }
      } else if (cmd.type === "move") {
        const target = typeof cmd.payload.target === "string" ? cmd.payload.target : "center";
        const off = COMPANION_MOVE_OFFSETS[target] ?? COMPANION_MOVE_OFFSETS.center;
        moveTargetRef.current = { x: off.x, z: off.z };
        const spd =
          typeof cmd.payload.speed === "string" ? cmd.payload.speed : undefined;
        moveLerpRef.current = moveSpeedToLerpPerFrame(spd);
        console.log("🎮 [CompanionLayer] companion_command move", {
          target,
          speed: spd ?? "normal",
        });
      }
    }
  }, [companionCommands, childId]);

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
      const vrm = vrmRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!vrm || !scene || !camera || !renderer) {
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
      const comp = companionRef.current;
      const ex = expressionStateRef.current;
      if (comp) {
        const emotes = pickEmotesToApply(companionEventsRef.current, eventDeduperRef.current, {
          forChildId: childIdRef.current,
        });
        for (const { emote, intensity } of emotes) {
          applyAcceptedEmote(ex, emote, intensity);
        }
        const triggers = pickTriggersToApply(
          companionEventsRef.current,
          comp,
          () => Math.random(),
          eventDeduperRef.current,
          { forChildId: childIdRef.current },
        );
        for (const t of triggers) {
          applyAcceptedTrigger(ex, t);
        }
        tickExpressionDecay(ex, dtMs);
        applyExpressionStateToVrm(vrm, ex);
        const busy = expressionBlocksIdle(
          ex.faceExpression,
          ex.faceWeight,
          ex.thinkingActive,
        );
        tickCompanionIdle(
          idleStateRef.current,
          dtMs,
          comp,
          toggledOffRef.current,
          busy,
          () => Math.random(),
        );
        applyIdleMotionToVrm(vrm, idleStateRef.current);
        const mouthW = updateMouthSync(audioAnalyserRef.current, dt);
        vrm.expressionManager?.setValue("aa", mouthW);
      }

      const look = vrm.lookAt;
      const lt = lookTargetRef.current;
      if (look && lt && camera) {
        const scr = activeNodeScreenRef.current;
        const w = typeof window !== "undefined" ? window.innerWidth : 1;
        const h = typeof window !== "undefined" ? window.innerHeight : 1;
        const cx = scr?.x ?? w / 2;
        const cy = scr?.y ?? h / 2;
        screenPixelToLookTargetWorld(cx, cy, camera, scratchVecRef.current);
        lt.position.copy(scratchVecRef.current);
      }

      tickCameraTransition(camera, cameraAnimRef);
      const mt = moveTargetRef.current;
      if (mt) {
        const p = vrm.scene.position;
        const a = moveLerpRef.current;
        p.x += (mt.x - p.x) * a;
        p.z += (mt.z - p.z) * a;
        if (Math.abs(p.x - mt.x) < 0.006 && Math.abs(p.z - mt.z) < 0.006) {
          p.x = mt.x;
          p.z = mt.z;
        }
      }
      vrm.update(dt);
      applyThinkingHeadTiltToVrm(vrm, expressionStateRef.current);
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) {
      wrap.style.display = toggledOff ? "none" : "block";
    }
    if (toggledOff) {
      stopLoop();
    } else if (vrmRef.current) {
      startLoop();
    }
  }, [toggledOff, startLoop, stopLoop]);

  /** New events must be visible to RAF tick immediately (ref sync alone can lag one frame vs WS). */
  useLayoutEffect(() => {
    if (toggledOffRef.current || !vrmRef.current) return;
    startLoop();
  }, [companionEvents, companionCommands, startLoop]);

  useEffect(() => {
    if (!childId || !companion) {
      stopLoop();
      const r = rendererRef.current;
      const s = sceneRef.current;
      const v = vrmRef.current;
      if (v?.lookAt) {
        v.lookAt.target = null;
      }
      const lt0 = lookTargetRef.current;
      lookTargetRef.current = null;
      if (lt0?.parent) {
        lt0.parent.remove(lt0);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      vrmRef.current = null;
      timerRef.current?.dispose();
      timerRef.current = null;
      if (r) {
        const canvas = r.domElement;
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
        r.dispose();
      }
      if (v) {
        v.scene.removeFromParent();
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
    stopLoop();

    const readMountSize = () => {
      const rawW = Math.floor(mountRef.current?.clientWidth ?? 0);
      const rawH = Math.floor(mountRef.current?.clientHeight ?? 0);
      const w = rawW > 0 ? rawW : COMPANION_MOUNT_W;
      const h = rawH > 0 ? rawH : COMPANION_MOUNT_H;
      return { w, h };
    };

    const syncRendererToMount = (reason: string) => {
      const cam = cameraRef.current;
      const ren = rendererRef.current;
      if (!cam || !ren || cancelled) return;
      const { w, h } = readMountSize();
      ren.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      console.log("CompanionLayer: [sync]", reason, { w, h, aspect: cam.aspect });
    };

    processedCommandKeysRef.current.clear();
    cameraAnimRef.current = null;
    moveTargetRef.current = null;
    console.log("CompanionLayer: [effect] building scene for child", childId);
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const { w: cw0, h: ch0 } = readMountSize();
    const camera = new THREE.PerspectiveCamera(22, cw0 / ch0, 0.05, 50);
    camera.position.set(0, 0.8, 4.0);
    camera.lookAt(0, 0.8, 0);
    cameraRef.current = camera;
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
        vrmRef.current = vrm;
        expressionStateRef.current = createNeutralExpressionState();
        eventDeduperRef.current = new CompanionEventDeduper();
        idleStateRef.current = createInitialIdleState();
        const lookTarget = new THREE.Object3D();
        scene.add(lookTarget);
        lookTargetRef.current = lookTarget;
        if (vrm.lookAt) {
          vrm.lookAt.target = lookTarget;
        }
        scene.add(vrm.scene);
        vrm.scene.rotation.y = 0;
        vrm.scene.position.set(0, -0.8, 0);

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

      console.log("CompanionLayer: [init] setSize(200, 400)");
      renderer.setSize(200, 400);
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

      if (isWebGpuRenderer(renderer)) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
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
      const v = vrmRef.current;
      if (v?.lookAt) {
        v.lookAt.target = null;
      }
      const lt = lookTargetRef.current;
      lookTargetRef.current = null;
      if (lt?.parent) {
        lt.parent.remove(lt);
      }
      vrmRef.current = null;
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
      if (v) {
        v.scene.removeFromParent();
      }
    };
  }, [childId, companion?.vrmUrl, startLoop, stopLoop]);

  if (!childId || !companion) {
    return null;
  }

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none fixed inset-0 z-[15]"
      aria-hidden
    >
      <div
        ref={mountRef}
        className="pointer-events-none overflow-hidden"
        style={{
          position: "fixed",
          width: COMPANION_MOUNT_W,
          height: COMPANION_MOUNT_H,
          bottom: 80,
          right: 24,
          zIndex: 15,
        }}
      />
    </div>
  );
}
