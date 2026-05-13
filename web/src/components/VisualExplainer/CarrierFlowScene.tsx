import { motion } from "framer-motion";
import type { VisualBrief } from "./visualBriefSchema";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function revealAmount(progress: number): number {
  return clamp01((progress - 0.55) / 0.28);
}

function buildViewBox(brief: VisualBrief, progress: number): string {
  if (brief.world === "earth-hill") return "-40 -22 1680 945";
  const reveal = revealAmount(progress);
  if (reveal <= 0) return "0 0 1600 900";
  const target = { x: 80, y: 80, w: 1440, h: 810 };
  return [
    Math.round(lerp(0, target.x, reveal)),
    Math.round(lerp(0, target.y, reveal)),
    Math.round(lerp(1600, target.w, reveal)),
    Math.round(lerp(900, target.h, reveal)),
  ].join(" ");
}

function Carrier(props: {
  shape: "cell" | "droplet" | "grain";
  x: number;
  y: number;
  size: number;
  fill: string;
  cargoFill?: string;
  cargoOpacity?: number;
  label?: string;
  motionDelay?: number;
  isPlaying: boolean;
}): React.ReactElement {
  const {
    shape,
    x,
    y,
    size,
    fill,
    cargoFill,
    cargoOpacity = 1,
    label,
    motionDelay = 0,
    isPlaying,
  } = props;
  const animate = isPlaying ? { y: [0, -10, 0] } : undefined;

  if (shape === "droplet") {
    return (
      <motion.g
        data-testid="carrier-flow-carrier"
        transform={`translate(${x} ${y}) scale(${size / 64})`}
        animate={animate}
        transition={{ duration: 1.2, repeat: Infinity, delay: motionDelay }}
        aria-label={label}
      >
        <path d="M0 -34 C22 -8 30 10 18 28 C8 43 -15 43 -25 28 C-38 8 -24 -10 0 -34Z" fill={fill} />
        <ellipse cx="-8" cy="-2" rx="8" ry="16" fill="#fff" opacity="0.28" transform="rotate(24)" />
      </motion.g>
    );
  }

  if (shape === "grain") {
    return (
      <motion.g
        data-testid="carrier-flow-carrier"
        data-payload-grain="sediment"
        transform={`translate(${x} ${y}) scale(${size / 24})`}
        animate={isPlaying ? { x: [0, 12, 0], y: [0, 5, 0] } : undefined}
        transition={{ duration: 2.1, repeat: Infinity, delay: motionDelay }}
        aria-label={label}
      >
        <circle cx="0" cy="0" r="11" fill={fill} stroke="#fff1c8" strokeWidth="2" />
        <circle cx="5" cy="5" r="5" fill="#794519" opacity="0.2" />
        <circle cx="-3" cy="-4" r="3" fill="#fff" opacity="0.26" />
      </motion.g>
    );
  }

  return (
    <motion.g
      data-testid="carrier-flow-carrier"
      transform={`translate(${x} ${y}) scale(${size / 130})`}
      animate={animate}
      transition={{ duration: 3.2, repeat: Infinity, delay: motionDelay }}
      aria-label={label}
    >
      <ellipse data-carrier-body="cell" cx="0" cy="0" rx="72" ry="46" fill={fill} stroke="#fff5f8" strokeWidth="6" />
      <ellipse cx="2" cy="3" rx="38" ry="24" fill="#7f1534" opacity="0.34" />
      <ellipse cx="-24" cy="-23" rx="28" ry="12" fill="#fff" opacity="0.24" />
      <g data-testid="carrier-flow-cargo" opacity={cargoOpacity}>
        <circle cx="-25" cy="-18" r="10" fill={cargoFill} />
        <circle cx="-3" cy="-23" r="9" fill={cargoFill} />
      </g>
    </motion.g>
  );
}

function ErosionWorld(props: {
  brief: VisualBrief;
  progress: number;
  isPlaying: boolean;
}): React.ReactElement {
  const { brief, progress, isPlaying } = props;
  const palette = brief.palette;
  const rainOpacity = clamp01((progress - 0.16) / 0.2);
  const waterOpacity = clamp01((progress - 0.26) / 0.22);
  const sedimentOpacity = clamp01((progress - 0.42) / 0.18);
  const transport = clamp01((progress - 0.42) / 0.48);
  const deltaOpacity = clamp01((progress - 0.68) / 0.2);
  const reveal = revealAmount(progress);
  const waterPath =
    "M690 380 C772 442 872 512 1010 560 C1160 612 1318 618 1484 574";

  const sediment = Array.from({ length: 18 }, (_, index) => ({
    x: lerp(742 + index * 12, 1028 + index * 24, transport),
    y: lerp(
      416 + Math.sin(index * 0.9) * 16,
      536 + Math.sin(index * 0.8) * 22 + (index % 3) * 10,
      transport,
    ),
  }));
  const rain = Array.from({ length: 30 }, (_, index) => ({
    x: 118 + (index % 10) * 114 + Math.floor(index / 10) * 34,
    y: 145 + ((index * 37) % 250),
  }));

  return (
    <>
      <defs>
        <linearGradient id="erosion-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={palette.sceneBgTop} />
          <stop offset="60%" stopColor={palette.sceneBgBottom} />
          <stop offset="100%" stopColor="#ffc177" />
        </linearGradient>
        <linearGradient id="erosion-hill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7fb96e" />
          <stop offset="58%" stopColor="#4f8e55" />
          <stop offset="100%" stopColor={palette.landDark} />
        </linearGradient>
        <linearGradient id="erosion-soil" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#9a642f" />
          <stop offset="100%" stopColor="#6b4422" />
        </linearGradient>
        <linearGradient id="erosion-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#9dd8f0" />
          <stop offset="100%" stopColor={palette.carrier} />
        </linearGradient>
        <filter id="erosion-soft">
          <feDropShadow dx="0" dy="16" stdDeviation="14" floodOpacity="0.18" />
        </filter>
        <pattern id="erosion-grass-texture" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 Q2 4 4 8 Q6 4 8 8" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="0.8" />
        </pattern>
      </defs>

      <g data-layer="bgFar">
        <rect x="-80" y="-60" width="1760" height="1040" fill="url(#erosion-sky)" />
        <circle cx="0" cy="112" r="210" fill="#ffd46a" opacity="0.16" />
        <circle cx="0" cy="112" r="70" fill="#ffe074" opacity="0.9" />
      </g>

      <g data-layer="bgMid" opacity="0.9">
        <path d="M0 590 L212 450 L400 535 L612 420 L852 506 L1092 408 L1334 492 L1600 450 L1600 700 L0 700 Z" fill="#e5a974" opacity="0.48" />
        <path d="M0 646 L266 535 L560 604 L852 520 L1172 590 L1466 535 L1600 576 L1600 730 L0 730 Z" fill="#d38845" opacity="0.38" />
        <path d="M142 166 C202 124 272 132 306 160 C348 194 258 208 182 196 C112 186 94 190 142 166Z" fill="#fff8e6" />
        <path d="M1116 216 C1190 174 1284 180 1332 214 C1388 254 1268 274 1170 258 C1088 244 1064 244 1116 216Z" fill="#fff8e6" opacity="0.95" />
      </g>

      <g data-layer="terrain">
        <path
          d="M0 562 C213 450 373 380 586 344 C826 302 1026 323 1212 433 C1333 504 1480 538 1600 562 L1600 900 L0 900 Z"
          fill="url(#erosion-soil)"
        />
        <path
          d="M0 535 C213 450 373 380 586 344 C826 302 1026 323 1212 433 C1333 504 1480 538 1600 562 L1600 640 C1344 614 1206 574 1092 502 C954 414 760 392 586 438 C386 490 220 592 0 650 Z"
          fill="url(#erosion-hill)"
          filter="url(#erosion-soft)"
        />
        <path
          d="M0 535 C213 450 373 380 586 344 C826 302 1026 323 1212 433 C1333 504 1480 538 1600 562 L1600 640 C1344 614 1206 574 1092 502 C954 414 760 392 586 438 C386 490 220 592 0 650 Z"
          fill="url(#erosion-grass-texture)"
          opacity="0.34"
        />
        <path
          d={waterPath}
          fill="none"
          stroke="#4a2e13"
          strokeWidth={18 + reveal * 28}
          strokeLinecap="round"
          opacity={0.06 + reveal * 0.16}
        />
        <g opacity="0.95">
          <rect x="386" y="338" width="8" height="26" fill="#5a3818" />
          <circle cx="374" cy="320" r="30" fill="#2e6b43" />
          <circle cx="405" cy="308" r="24" fill="#3c8253" />
          <rect x="556" y="354" width="8" height="22" fill="#5a3818" />
          <circle cx="560" cy="337" r="22" fill="#2e6b43" />
        </g>
      </g>

      <g data-layer="medium" opacity={waterOpacity}>
        <path
          d={waterPath}
          fill="none"
          stroke="#70431f"
          strokeWidth="42"
          strokeLinecap="round"
          opacity="0.22"
        />
        <path
          d={waterPath}
          fill="none"
          stroke="url(#erosion-water)"
          strokeWidth="24"
          strokeLinecap="round"
          data-testid="carrier-flow-water-path"
          strokeDasharray="34 20"
        />
        <motion.path
          d={waterPath}
          fill="none"
          stroke={palette.carrierLight}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.8"
          strokeDasharray="44 26"
          animate={isPlaying ? { strokeDashoffset: [0, -140] } : undefined}
          transition={{ duration: 1.15, repeat: Infinity, ease: "linear" }}
        />
      </g>

      <g data-layer="actors" opacity={rainOpacity}>
        {rain.map((drop, index) => (
          <motion.line
            key={index}
            x1={drop.x}
            y1={drop.y}
            x2={drop.x - 8}
            y2={drop.y + 30}
            stroke={palette.carrier}
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.74"
            animate={isPlaying ? { y1: [drop.y, drop.y + 18, drop.y], y2: [drop.y + 30, drop.y + 48, drop.y + 30] } : undefined}
            transition={{ duration: 1.4, repeat: Infinity, delay: index * 0.03 }}
          />
        ))}
      </g>

      <g data-layer="terrainNear">
        <path
          d="M0 652 C252 620 454 606 642 616 C848 628 1038 636 1240 610 C1380 592 1492 578 1600 588 L1600 900 L0 900 Z"
          fill="#7f4d24"
          opacity="0.36"
        />
        <path d="M0 708 C230 684 430 678 632 696 C850 716 1110 708 1600 728" fill="none" stroke="#956432" strokeWidth="5" opacity="0.3" />
        <path d="M0 778 C230 746 430 742 646 764 C910 790 1140 776 1600 798" fill="none" stroke="#5f3418" strokeWidth="7" opacity="0.24" />
      </g>

      <g data-layer="payload">
        <g opacity={deltaOpacity}>
          <path
            d="M1314 586 C1400 600 1478 598 1530 574 C1510 630 1438 674 1328 692 C1266 660 1254 614 1314 586Z"
            fill={palette.payload}
            opacity="0.72"
          />
          <path
            d="M1360 608 C1418 622 1466 618 1510 604"
            fill="none"
            stroke={palette.payloadGlow}
            strokeWidth="9"
            strokeLinecap="round"
            opacity="0.48"
          />
        </g>
        <g data-testid="carrier-flow-payload" opacity={sedimentOpacity}>
          {sediment.map((point, index) => (
            <Carrier
              key={index}
              shape="grain"
              x={point.x}
              y={point.y}
              size={18 + (index % 3) * 4}
              fill={index % 2 === 0 ? palette.payload : palette.payloadGlow}
              isPlaying={isPlaying}
              motionDelay={index * 0.06}
              label={brief.actors.payload.label}
            />
          ))}
        </g>
      </g>

      <g data-testid="carrier-flow-region-labels" data-layer="regionLabels" fontFamily="Inter, system-ui, sans-serif" fontWeight="900">
        <rect x="80" y="380" width="116" height="40" rx="20" fill="#fff" stroke="rgba(0,0,0,0.12)" />
        <text x="138" y="406" fill={palette.ink} fontSize="18" textAnchor="middle">BEFORE</text>
        <g opacity={reveal}>
          <rect x="1360" y="254" width="102" height="40" rx="20" fill={palette.accent} />
          <text x="1411" y="280" fill="#fff" fontSize="18" textAnchor="middle">AFTER</text>
        </g>
      </g>

      <g data-layer="accents" opacity={reveal}>
        <g data-testid="carrier-flow-reveal-lens" opacity={reveal}>
          <circle
            cx="1074"
            cy="544"
            r="126"
            fill="rgba(255,255,255,0.16)"
            stroke="#fff"
            strokeWidth="8"
          />
          <path
            d="M1162 632 L1240 716"
            stroke="#fff"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <circle
            cx="1074"
            cy="544"
            r="92"
            fill="none"
            stroke={palette.payloadGlow}
            strokeWidth="3"
            strokeDasharray="10 12"
            opacity="0.72"
          />
        </g>
        <rect x="980" y="514" width="162" height="48" rx="24" fill="rgba(255,255,255,0.72)" />
        <text x="1061" y="546" fill={palette.payload} fontSize="22" fontWeight="900" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif">
          {brief.actors.payload.label}
        </text>
      </g>
    </>
  );
}

function BloodstreamWorld(props: {
  brief: VisualBrief;
  progress: number;
  isPlaying: boolean;
}): React.ReactElement {
  const { brief, progress, isPlaying } = props;
  const palette = brief.palette;
  const cargoOpacity = clamp01((progress - 0.22) / 0.2);
  const reveal = revealAmount(progress);
  const shift = lerp(0, 420, progress);
  const cells = [
    { x: 190, y: 565, s: 1.05 },
    { x: 430, y: 385, s: 0.78 },
    { x: 720, y: 565, s: 0.86 },
    { x: 1040, y: 395, s: 0.78 },
    { x: 1300, y: 575, s: 0.92 },
  ];

  return (
    <>
      <defs>
        <linearGradient id="rbc-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd6cf" />
          <stop offset="100%" stopColor="#ff9d98" />
        </linearGradient>
        <linearGradient id="rbc-plasma" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd9d2" />
          <stop offset="100%" stopColor="#f28d98" />
        </linearGradient>
        <filter id="rbc-cell-shadow">
          <feDropShadow dx="0" dy="12" stdDeviation="12" floodOpacity="0.22" />
        </filter>
        <filter id="rbc-cargo-glow">
          <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor={palette.payloadGlow} floodOpacity="0.7" />
        </filter>
      </defs>

      <g data-layer="bgFar">
        <rect width="1600" height="900" rx="48" fill="url(#rbc-bg)" />
      </g>

      <g data-layer="bgMid" opacity="0.75">
        <path d="M0 268 C260 235 480 246 705 270 C930 294 1180 244 1600 288" fill="none" stroke="#c26771" strokeWidth="5" />
        <path d="M0 304 C260 275 488 288 705 306 C930 326 1180 286 1600 322" fill="none" stroke="#fff" strokeWidth="4" opacity="0.55" />
        {Array.from({ length: 38 }, (_, index) => (
          <circle
            key={index}
            cx={(index * 97) % 1600}
            cy={142 + ((index * 61) % 650)}
            r={index % 5 === 0 ? 6 : 3}
            fill="#ef7c82"
            opacity="0.28"
          />
        ))}
      </g>

      <g data-layer="terrain">
        <path
          d="M0 706 C226 636 420 620 624 655 C858 696 1038 716 1218 664 C1368 622 1486 552 1600 484 L1600 900 L0 900 Z"
          fill="url(#rbc-plasma)"
        />
      </g>

      <g data-layer="medium" opacity="0.55">
        <path d="M-40 650 C250 594 496 620 754 662 C1032 706 1288 682 1640 570" fill="none" stroke="#bf5266" strokeWidth="5" />
        <path d="M-40 290 C242 220 512 222 772 332 C1010 434 1260 392 1640 172" fill="none" stroke="#8f3f79" strokeWidth="46" opacity="0.34" />
      </g>

      <g data-layer="actors">
        {cells.map((cell, index) => {
          const x = ((cell.x + shift + index * 24) % 1500) + 50;
          return (
            <g key={index} filter="url(#rbc-cell-shadow)">
              <Carrier
                shape="cell"
                x={x}
                y={cell.y}
                size={130 * cell.s}
                fill={palette.carrier}
                cargoFill={palette.payload}
                cargoOpacity={cargoOpacity}
                isPlaying={isPlaying}
                motionDelay={index * 0.18}
                label={brief.actors.carrier.label}
              />
            </g>
          );
        })}
      </g>

      <g data-layer="terrainNear">
        <path
          d="M0 748 C230 696 436 690 660 718 C902 748 1105 770 1288 720 C1415 685 1505 632 1600 574 L1600 900 L0 900 Z"
          fill="#d86171"
          opacity="0.68"
        />
      </g>

      <g data-layer="payload">
        <g opacity="0.46">
          {Array.from({ length: 44 }, (_, index) => (
            <circle
              key={index}
              cx={(index * 71 + shift * 0.45) % 1600}
              cy={290 + ((index * 47) % 430)}
              r={index % 4 === 0 ? 4 : 2.5}
              fill="#fff"
            />
          ))}
        </g>
      </g>

      <g data-testid="carrier-flow-region-labels" data-layer="regionLabels" fontFamily="Inter, system-ui, sans-serif" fontWeight="900">
        <text x="126" y="286" fill="#fff" fontSize="26">lungs</text>
        <text x="1300" y="286" fill="#fff" fontSize="24" textAnchor="middle">tissue · deliver</text>
      </g>

      <g data-layer="accents" opacity={reveal}>
        <circle cx="770" cy="510" r="138" fill="rgba(255,255,255,0.18)" stroke="#fff" strokeWidth="8" />
        <text x="720" y="524" fill={palette.payloadGlow} filter="url(#rbc-cargo-glow)" fontSize="56" fontWeight="900" fontFamily="Inter, system-ui, sans-serif">
          O₂
        </text>
        <text x="696" y="578" fill="#fff" fontSize="28" fontWeight="900" fontFamily="Inter, system-ui, sans-serif">
          oxygen
        </text>
        <path d="M872 610 L956 708" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
      </g>
    </>
  );
}

export function CarrierFlowScene(props: {
  brief: VisualBrief;
  progress: number;
  isPlaying: boolean;
}): React.ReactElement {
  const { brief, progress } = props;

  return (
    <motion.svg
      aria-label={`${brief.topic} carrier-flow visual model`}
      data-testid="visual-explainer-scene"
      role="img"
      viewBox={buildViewBox(brief, progress)}
      className="h-full w-full rounded-[1.5rem]"
      style={{ display: "block", width: "100%", height: "100%" }}
      initial={false}
      animate={{ viewBox: buildViewBox(brief, progress) }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      preserveAspectRatio="xMidYMid slice"
    >
      {brief.world === "bloodstream" ? (
        <BloodstreamWorld {...props} />
      ) : (
        <ErosionWorld {...props} />
      )}
    </motion.svg>
  );
}
