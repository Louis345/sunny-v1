import { useRef } from "react";
import { useMapSession } from "../hooks/useMapSession";
import "./AdventureMap.css";

export function AdventureMap(props: { childId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resolved =
    props.childId ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("childId") ?? ""
      : "");
  const { mapState, onNodeClick } = useMapSession(resolved);
  return (
    <div className="adventure-map-root" data-ready={mapState ? "1" : "0"}>
      <canvas ref={canvasRef} className="adventure-map-canvas" onClick={() => onNodeClick("")} />
    </div>
  );
}
