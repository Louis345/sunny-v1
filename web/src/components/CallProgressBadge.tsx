/** How close the FaceTime call is, on the map (owner, 2026-11-07). Display only: the server owns when it is earned. */
export function CallProgressBadge({ stopsLeft, companionName }: { stopsLeft: number | undefined; companionName: string }) {
  if (stopsLeft === undefined || stopsLeft <= 0) return null;
  const text = stopsLeft === 1
    ? `1 more stop to your call with ${companionName}!`
    : `${stopsLeft} stops to your call with ${companionName}`;
  return (
    <div
      data-testid="call-progress-badge"
      className="pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-sm font-bold text-white shadow-lg"
    >
      <span aria-hidden="true">📞 </span>{text}
    </div>
  );
}
