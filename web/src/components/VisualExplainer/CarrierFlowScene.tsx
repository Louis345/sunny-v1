import { motion } from "framer-motion";
import type { VisualBrief } from "./visualBriefSchema";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function payloadPoints(progress: number) {
  return Array.from({ length: 12 }, (_, index) => ({
    id: index,
    x: lerp(306 + index * 8, 472 + index * 14, clamp01((progress - 0.32) / 0.55)),
    y: lerp(200 + (index % 4) * 12, 252 + (index % 5) * 8, clamp01((progress - 0.32) / 0.55)),
  }));
}

function ErosionWorld(props: {
  brief: VisualBrief;
  progress: number;
  isPlaying: boolean;
}): React.ReactElement {
  const { brief, progress, isPlaying } = props;
  const palette = brief.palette;
  const rainOpacity = clamp01((progress - 0.08) / 0.2);
  const flowOpacity = clamp01((progress - 0.22) / 0.16);
  const payloadOpacity = clamp01((progress - 0.38) / 0.18);
  const revealOpacity = clamp01((progress - 0.62) / 0.2);
  const notch = lerp(0, 42, progress);

  return (
    <svg
      aria-label={`${brief.topic} carrier-flow visual model`}
      data-testid="visual-explainer-scene"
      role="img"
      viewBox="0 0 900 520"
      className="h-full w-full"
    >
      <defs>
        <linearGradient id={`${brief.id}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={palette.sceneBgTop} />
          <stop offset="100%" stopColor={palette.sceneBgBottom} />
        </linearGradient>
        <linearGradient id={`${brief.id}-hill`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={palette.land} />
          <stop offset="100%" stopColor={palette.landDark} />
        </linearGradient>
        <filter id={`${brief.id}-scene-shadow`}>
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodOpacity="0.2" />
        </filter>
      </defs>

      <rect width="900" height="520" rx="34" fill={`url(#${brief.id}-sky)`} />
      <circle cx="112" cy="86" r="42" fill="#ffe482" opacity="0.92" />
      <path
        d="M58 150 C140 94 208 108 252 152 C308 214 162 224 72 194 C12 174 4 186 58 150Z"
        fill="#fff7d5"
        opacity="0.7"
      />
      <path
        d="M610 118 C684 74 764 88 812 132 C872 186 716 202 626 166 C572 144 562 148 610 118Z"
        fill="#fff3c8"
        opacity="0.62"
      />

      <g opacity={rainOpacity}>
        {Array.from({ length: 22 }, (_, index) => (
          <motion.line
            key={index}
            x1={240 + (index % 8) * 44}
            x2={226 + (index % 8) * 44}
            y1={76 + Math.floor(index / 8) * 34}
            y2={114 + Math.floor(index / 8) * 34}
            stroke={palette.carrier}
            strokeWidth="4"
            strokeLinecap="round"
            animate={isPlaying ? { y1: [76, 92, 76], y2: [114, 130, 114] } : undefined}
            transition={{ duration: 0.95, repeat: Infinity, delay: index * 0.025 }}
          />
        ))}
      </g>

      <path
        d={`M40 386 C158 274 286 218 400 ${222 + notch * 0.25} C516 ${232 + notch * 0.35} 596 ${314 + notch} 844 280 L844 475 L40 475 Z`}
        fill={`url(#${brief.id}-hill)`}
        filter={`url(#${brief.id}-scene-shadow)`}
      />
      <path
        d={`M286 238 C330 ${270 + notch} 404 ${260 + notch} 468 ${290 + notch * 0.55} C550 ${326 + notch * 0.4} 628 324 728 322`}
        fill="none"
        stroke={palette.landDark}
        strokeWidth={12 + notch * 0.14}
        strokeLinecap="round"
        opacity={0.35 + revealOpacity * 0.25}
      />
      <path
        d="M284 240 C332 272 394 266 466 292 C554 322 646 316 728 324"
        fill="none"
        stroke={palette.carrier}
        strokeWidth="24"
        strokeLinecap="round"
        opacity={flowOpacity}
      />
      <path
        d="M284 240 C332 272 394 266 466 292 C554 322 646 316 728 324"
        fill="none"
        stroke={palette.carrierLight}
        strokeWidth="7"
        strokeLinecap="round"
        opacity={flowOpacity * 0.85}
      />

      <g opacity={payloadOpacity}>
        {payloadPoints(progress).map((point) => (
          <motion.circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r={point.id % 3 === 0 ? 6 : 4.5}
            fill={point.id % 2 === 0 ? palette.payload : palette.payloadGlow}
            animate={
              isPlaying
                ? { cx: [point.x - 14, point.x + 16, point.x - 14], cy: [point.y, point.y + 5, point.y] }
                : undefined
            }
            transition={{ duration: 2.2, repeat: Infinity, delay: point.id * 0.07 }}
          />
        ))}
      </g>

      <path
        d="M648 332 C710 314 768 332 816 362 C750 374 698 372 636 354 Z"
        fill={palette.payloadGlow}
        opacity={revealOpacity * 0.75}
      />
      <g opacity={revealOpacity}>
        <circle cx="458" cy="270" r="74" fill="rgba(255,255,255,0.2)" stroke="#fff" strokeWidth="5" />
        <circle cx="438" cy="254" r="8" fill={palette.payload} />
        <circle cx="462" cy="276" r="7" fill={palette.payloadGlow} />
        <circle cx="486" cy="260" r="6" fill={palette.payload} />
        <path d="M505 320 L552 372" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      </g>

      <g fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fill={palette.ink}>
        <text x="72" y="446" fontSize="24">{brief.actors.source.label}</text>
        <text x="568" y="356" fontSize="22" fill={palette.carrier} opacity={flowOpacity}>{brief.actors.carrier.label}</text>
        <text x="386" y="196" fontSize="22" fill={palette.payload} opacity={payloadOpacity}>{brief.actors.payload.label}</text>
        <text x="654" y="404" fontSize="20" fill={palette.payload} opacity={revealOpacity}>{brief.actors.destination.label}</text>
      </g>
    </svg>
  );
}

function BloodstreamWorld(props: {
  brief: VisualBrief;
  progress: number;
  isPlaying: boolean;
}): React.ReactElement {
  const { brief, progress, isPlaying } = props;
  const palette = brief.palette;
  const payloadOpacity = clamp01((progress - 0.26) / 0.2);
  const revealOpacity = clamp01((progress - 0.62) / 0.2);
  const carrierShift = lerp(0, 280, progress);
  const cells = [
    { x: 188, y: 260, s: 1.08 },
    { x: 318, y: 218, s: 0.88 },
    { x: 444, y: 292, s: 1 },
    { x: 584, y: 236, s: 0.9 },
  ];

  return (
    <svg
      aria-label={`${brief.topic} carrier-flow visual model`}
      data-testid="visual-explainer-scene"
      role="img"
      viewBox="0 0 900 520"
      className="h-full w-full"
    >
      <defs>
        <radialGradient id={`${brief.id}-vessel`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor={palette.land} />
          <stop offset="100%" stopColor={palette.landDark} />
        </radialGradient>
        <filter id={`${brief.id}-glow`}>
          <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor={palette.payloadGlow} floodOpacity="0.65" />
        </filter>
      </defs>
      <rect width="900" height="520" rx="34" fill={palette.sceneBgTop} />
      <path
        d="M-20 310 C154 188 302 172 460 252 C612 330 734 300 924 184 L924 554 L-20 554 Z"
        fill="url(#red-blood-cells-vessel)"
        opacity="0.95"
      />
      <path
        d="M-20 164 C156 70 308 88 462 168 C616 248 740 218 924 96"
        fill="none"
        stroke={palette.carrierLight}
        strokeWidth="26"
        opacity="0.16"
      />
      <g opacity="0.45">
        {Array.from({ length: 32 }, (_, index) => (
          <circle
            key={index}
            cx={(index * 67) % 900}
            cy={132 + ((index * 43) % 280)}
            r={index % 4 === 0 ? 2.8 : 1.8}
            fill="#fff"
          />
        ))}
      </g>

      <g>
        {cells.map((cell, index) => {
          const x = ((cell.x + carrierShift + index * 18) % 760) + 70;
          return (
            <motion.g
              key={index}
              transform={`translate(${x} ${cell.y}) scale(${cell.s})`}
              animate={isPlaying ? { y: [0, -8, 0] } : undefined}
              transition={{ duration: 2.6, repeat: Infinity, delay: index * 0.2 }}
            >
              <ellipse cx="0" cy="0" rx="58" ry="38" fill={palette.carrier} />
              <ellipse cx="0" cy="0" rx="30" ry="18" fill={palette.landDark} opacity="0.35" />
              <ellipse cx="-16" cy="-14" rx="22" ry="10" fill="#fff" opacity="0.18" />
              <g opacity={payloadOpacity} filter={`url(#${brief.id}-glow)`}>
                <circle cx="-34" cy="-32" r="8" fill={palette.payload} />
                <circle cx="-12" cy="-40" r="7" fill={palette.payloadGlow} />
                <circle cx="20" cy="-34" r="8" fill={palette.payload} />
              </g>
            </motion.g>
          );
        })}
      </g>

      <g opacity={revealOpacity}>
        <circle cx="658" cy="244" r="82" fill="rgba(255,255,255,0.14)" stroke="#fff" strokeWidth="5" />
        <text x="625" y="252" fill={palette.payloadGlow} fontSize="34" fontWeight="900" fontFamily="Inter, system-ui, sans-serif">O₂</text>
        <path d="M712 300 L760 360" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      </g>

      <g fontFamily="Inter, system-ui, sans-serif" fontWeight="850">
        <text x="76" y="128" fontSize="23" fill={palette.payloadGlow}>{brief.actors.source.label}</text>
        <text x="280" y="410" fontSize="22" fill="#fff">{brief.actors.carrier.label}</text>
        <text x="592" y="170" fontSize="22" fill={palette.payloadGlow} opacity={payloadOpacity}>{brief.actors.payload.label}</text>
        <text x="650" y="434" fontSize="21" fill="#fff">{brief.actors.destination.label}</text>
      </g>
    </svg>
  );
}

export function CarrierFlowScene(props: {
  brief: VisualBrief;
  progress: number;
  isPlaying: boolean;
}): React.ReactElement {
  return props.brief.world === "bloodstream" ? (
    <BloodstreamWorld {...props} />
  ) : (
    <ErosionWorld {...props} />
  );
}
