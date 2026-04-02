import type { CanvasHTMLAttributes, FC } from "react";
import { useRive } from "@rive-app/react-canvas";

const ARTEMIS_SRC = "/characters/artemis.riv";

/**
 * Demo spike: Rive overlay on the canvas. Place artemis.riv in
 * web/public/characters/ (served as /characters/artemis.riv).
 */
export function CreatureLayer() {
  const { RiveComponent, setContainerRef } = useRive(
    {
      src: ARTEMIS_SRC,
      autoplay: false,
      onRiveReady: (r) => {
        const anims = r.animationNames;
        const sms = r.stateMachineNames;
        if (anims.length > 0) {
          r.play(anims[0]);
        } else if (sms.length > 0) {
          r.play(sms[0]);
        }
      },
    },
    {
      useDevicePixelRatio: true,
      shouldResizeCanvasToContainer: true,
    },
  );

  const RiveCanvas = RiveComponent as unknown as FC<
    CanvasHTMLAttributes<HTMLCanvasElement>
  >;

  return (
    <div
      ref={setContainerRef}
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        width: 180,
        height: 180,
        zIndex: 50,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <RiveCanvas style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
