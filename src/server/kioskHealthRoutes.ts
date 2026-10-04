import type { Express, Request, Response } from "express";
export function setupKioskHealthRoutes(app: Express) {
    const expectedKioskToken = process.env.SUNNY_KIOSK_TOKEN?.trim() || null;
    let visibleKioskToken: string | null = null;
    app.get("/api/health", (_req: Request, res: Response) => {
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            ...(process.env.SUNNY_CERTIFICATION_RUN_ID
                ? { certificationRunId: process.env.SUNNY_CERTIFICATION_RUN_ID }
                : {}),
            ...(process.env.SUNNY_BUILD_ID ? { buildId: process.env.SUNNY_BUILD_ID } : {}),
            ...(expectedKioskToken ? { kioskReady: visibleKioskToken === expectedKioskToken } : {}),
        });
    });
    app.get("/api/kiosk/ready", (req: Request, res: Response) => {
        const token = String(req.query.token ?? "");
        return res.json({
            ready: Boolean(expectedKioskToken && token === expectedKioskToken && visibleKioskToken === expectedKioskToken),
            token,
        });
    });
    app.post("/api/kiosk/ready", (req: Request, res: Response) => {
        const token = typeof req.body?.token === "string" ? req.body.token : "";
        if (!expectedKioskToken || token !== expectedKioskToken) {
            console.warn(" 🎮 [kiosk] [visible-identity] [rejected]");
            return res.status(409).json({ ok: false, error: "kiosk_runtime_identity_mismatch" });
        }
        visibleKioskToken = token;
        console.log(" 🎮 [kiosk] [visible-identity] [confirmed]");
        return res.json({ ok: true });
    });
}
