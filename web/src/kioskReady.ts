export type KioskReadyFetcher = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status">>;

export async function announceKioskReady(
  href: string,
  fetcher: KioskReadyFetcher = fetch,
): Promise<boolean> {
  const token = new URL(href).searchParams.get("sunnyKioskToken")?.trim();
  if (!token) return false;
  const response = await fetcher("/api/kiosk/ready", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error(`kiosk_ready_rejected:${response.status}`);
  return true;
}
