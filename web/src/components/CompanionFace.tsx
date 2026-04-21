import { useEffect, useRef } from "react";
import * as THREE from "three";
import { WebGLRenderer } from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { CompanionFaceCamera } from "../../../src/shared/companionTypes";
import { applyCompanionVrmExpression, loadCompanionVrm } from "../utils/loadCompanionVrm";

function resolveModelUrl(vrmUrl: string): string {
  if (vrmUrl.startsWith("http://") || vrmUrl.startsWith("https://")) {
    return vrmUrl;
  }
  if (typeof window === "undefined") {
    return vrmUrl;
  }
  return `${window.location.origin}${vrmUrl.startsWith("/") ? "" : "/"}${vrmUrl}`;
}

export interface CompanionFaceProps {
  vrmUrl: string;
  /** VRM blend shape name (from children.config expressions values). */
  expression: string;
  size?: number;
  muted?: boolean;
  faceCamera: CompanionFaceCamera;
  /** True while TTS audio is playing — drives sine-wave mouth animation. */
  isSpeaking?: boolean;
}

/**
 * Face-only VRM preview (circular crop). Game iframe anchor — no speech bubble / full body framing.
 */
export function CompanionFace({
  vrmUrl,
  expression,
  size = 80,
  muted = false,
  faceCamera,
  isSpeaking = false,
}: CompanionFaceProps) {
  console.log('[CompanionFace] render called', { vrmUrl, expression, muted });
  const expressionRef = useRef(expression);
  expressionRef.current = expression;
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cancelled = false;
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const w = Math.max(1, size);
    const h = Math.max(1, size);
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.05, 50);
    camera.position.set(
      faceCamera.position[0],
      faceCamera.position[1],
      faceCamera.position[2],
    );
    camera.lookAt(
      new THREE.Vector3(
        faceCamera.target[0],
        faceCamera.target[1],
        faceCamera.target[2],
      ),
    );
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    renderer.setSize(w, h);
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);
    console.log('[CompanionFace] canvas created:', !!rendererRef.current?.domElement);
    console.log('[CompanionFace] renderer created:', !!rendererRef.current);
    console.log('[CompanionFace] container size:', {
      width: mountRef.current?.offsetWidth,
      height: mountRef.current?.offsetHeight,
    });
    console.log('[CompanionFace] canvas size:', {
      width: rendererRef.current?.domElement?.width,
      height: rendererRef.current?.domElement?.height,
    });

    const amb = new THREE.AmbientLight(0xffffff, 0.75);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(0.8, 1.6, 1.0);
    scene.add(amb, dir);

    let lastTime = 0;
    const tick = (time: DOMHighResTimeStamp) => {
      if (cancelled || !rendererRef.current || !sceneRef.current || !cameraRef.current) {
        return;
      }
      const dt = lastTime > 0 ? Math.min((time - lastTime) / 1000, 0.1) : 0.016;
      lastTime = time;

      const vrm = vrmRef.current;
      if (vrm) {
        const mouth = isSpeakingRef.current
          ? Math.max(0, Math.sin((time / 1000) * 8) * 0.6)
          : 0;
        vrm.expressionManager?.setValue("aa", mouth);
        vrm.update(dt);
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    console.log("[CompanionFace] loading VRM from:", vrmUrl);
    const modelUrl = resolveModelUrl(vrmUrl);
    console.log('[CompanionFace] attempting VRM load:', modelUrl);
    void loadCompanionVrm(modelUrl, { webgpu: false })
      .then((vrm) => {
        if (cancelled) {
          vrm.scene.removeFromParent();
          return;
        }
        vrmRef.current = vrm;
        scene.add(vrm.scene);
        applyCompanionVrmExpression(vrm, expressionRef.current);
        console.log('[CompanionFace] VRM loaded successfully');
        // TODO: play idle.fbx animation — requires exporting retargetMixamoClipToVrm
        // from CompanionMotor.ts (currently file-scoped). T-pose is acceptable fallback.
      })
      .catch((e: unknown) => {
        console.error("[CompanionFace] VRM load failed:", e);
        console.error('[CompanionFace] VRM load error:', e);
      });

    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const vrm = vrmRef.current;
      vrmRef.current = null;
      if (vrm) {
        vrm.scene.removeFromParent();
      }
      const r = rendererRef.current;
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      if (r) {
        const canvas = r.domElement;
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
        r.dispose();
      }
      scene.clear();
    };
  }, [
    vrmUrl,
    size,
    faceCamera.position[0],
    faceCamera.position[1],
    faceCamera.position[2],
    faceCamera.target[0],
    faceCamera.target[1],
    faceCamera.target[2],
  ]);

  useEffect(() => {
    expressionRef.current = expression;
    const vrm = vrmRef.current;
    if (!vrm) return;
    applyCompanionVrmExpression(vrm, expression);
  }, [expression]);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "rgba(0,0,0,0.25)",
      }}
    >
      <div ref={mountRef} style={{ width: size, height: size }} />
      {muted ? (
        <div
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.65)",
            border: "1px solid rgba(255,255,255,0.5)",
            fontSize: 9,
            lineHeight: "12px",
            textAlign: "center",
            color: "#fff",
          }}
          title="Muted"
        >
          M
        </div>
      ) : null}
    </div>
  );
}
