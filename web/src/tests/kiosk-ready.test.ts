import { describe, expect, it, vi } from "vitest";
import { announceKioskReady } from "../kioskReady";

describe("kiosk readiness announcement", () => {
  it("announces the launch token once the visible app has loaded", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(announceKioskReady("http://localhost:4432/?sunnyKioskToken=launch-1", fetcher))
      .resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith("/api/kiosk/ready", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "launch-1" }),
    });
  });

  it("does nothing outside a managed kiosk launch", async () => {
    const fetcher = vi.fn();

    await expect(announceKioskReady("http://localhost:4432/", fetcher)).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a rejected runtime identity instead of silently claiming ready", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 409 }));

    await expect(announceKioskReady("http://localhost:4432/?sunnyKioskToken=stale", fetcher))
      .rejects.toThrow("kiosk_ready_rejected:409");
  });
});
