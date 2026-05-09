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
  const reveal = revealAmount(progress);
  if (reveal <= 0) return "0 0 1600 900";
  const target =
    brief.world === "bloodstream"
      ? { x: 430, y: 112, w: 900, h: 506 }
      : { x: 290, y: 170, w: 980, h: 551 };
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
      <ellipse cx="0" cy="0" rx="72" ry="46" fill={fill} />
      <ellipse cx="2" cy="3" rx="38" ry="24" fill="#7f1534" opacity="0.34" />
      <ellipse cx="-24" cy="-23" rx="28" ry="12" fill="#fff" opacity="0.24" />
      <g opacity={cargoOpacity}>
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
  const rainOpacity = clamp01((progress - 0.12) / 0.22);
  const waterOpacity = clamp01((progress - 0.28) / 0.2);
  const sedimentOpacity = clamp01((progress - 0.4) / 0.2);
  const transport = clamp01((progress - 0.36) / 0.48);
  const deltaOpacity = clamp01((progress - 0.58) / 0.22);
  const reveal = revealAmount(progress);
  const channelDrop = lerp(0, 72, reveal);

  const sediment = Array.from({ length: 18 }, (_, index) => ({
    x: lerp(444 + index * 18, 955 + index * 16, transport),
    y: lerp(432 + (index % 4) * 18, 536 + (index % 5) * 14, transport),
  }));

  return (
    <>
      <defs>
        <linearGradient id="erosion-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={palette.sceneBgTop} />
          <stop offset="72%" stopColor={palette.sceneBgBottom} />
          <stop offset="100%" stopColor="#f7ba79" />
        </linearGradient>
        <linearGradient id="erosion-hill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7fb96e" />
          <stop offset="100%" stopColor={palette.landDark} />
        </linearGradient>
        <linearGradient id="erosion-soil" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#9a642f" />
          <stop offset="100%" stopColor="#70431f" />
        </linearGradient>
        <filter id="erosion-soft">
          <feDropShadow dx="0" dy="22" stdDeviation="20" floodOpacity="0.22" />
        </filter>
      </defs>

      <g data-layer="bgFar">
        <rect width="1600" height="900" rx="48" fill="url(#erosion-sky)" />
        <circle cx="245" cy="160" r="66" fill="#ffe074" opacity="0.9" />
        <circle cx="245" cy="160" r="150" fill="#ffe074" opacity="0.14" />
      </g>

      <g data-layer="bgMid" opacity="0.9">
        <path d="M410 140 C488 96 572 104 617 133 C670 168 548 184 454 174 C365 164 350 166 410 140Z" fill="#fff8e6" />
        <path d="M1090 204 C1176 156 1280 168 1331 205 C1395 252 1260 272 1144 252 C1057 238 1030 236 1090 204Z" fill="#fff8e6" opacity="0.9" />
      </g>

      <g data-layer="terrain">
        <path d="M0 574 C190 532 350 502 515 508 C640 512 746 548 874 544 C1038 538 1190 492 1600 468 L1600 596 C1230 558 1035 586 858 604 C642 626 424 574 240 598 C142 610 65 638 0 658 Z" fill="#f0c77c" opacity="0.22" />
        <path
          d="M0 640 C250 558 412 456 628 404 C842 352 1010 378 1182 475 C1320 552 1464 586 1600 612 L1600 900 L0 900 Z"
          fill="url(#erosion-soil)"
        />
        <path
          d={`M0 594 C224 528 404 430 626 382 C840 336 1008 372 1182 ${475 + channelDrop * 0.22} C1320 552 1464 586 1600 612 L1600 674 C1358 630 1220 590 1112 520 C980 438 794 410 622 442 C410 482 232 588 0 652 Z`}
          fill="url(#erosion-hill)"
          filter="url(#erosion-soft)"
        />
        <path
          d={`M360 430 C520 458 602 466 704 ${514 + channelDrop} C818 ${566 + channelDrop * 0.45} 940 562 1042 542`}
          fill="none"
          stroke="#426b38"
          strokeWidth={14 + reveal * 24}
          strokeLinecap="round"
          opacity={0.28 + reveal * 0.18}
        />
        <g opacity="0.95">
          <rect x="600" y="330" width="16" height="58" rx="4" fill="#5c3b20" />
          <circle cx="584" cy="318" r="42" fill="#2f7c54" />
          <circle cx="622" cy="304" r="40" fill="#3b8c5f" />
          <rect x="838" y="364" width="14" height="46" rx="4" fill="#5c3b20" />
          <circle cx="842" cy="346" r="35" fill="#34754e" />
        </g>
      </g>

      <g data-layer="medium" opacity={waterOpacity}>
        <path
          d="M360 430 C520 458 602 466 704 514 C818 566 940 562 1042 542"
          fill="none"
          stroke={palette.carrier}
          strokeWidth="36"
          strokeLinecap="round"
        />
        <path
          d="M360 430 C520 458 602 466 704 514 C818 566 940 562 1042 542"
          fill="none"
          stroke={palette.carrierLight}
          strokeWidth="9"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>

      <g data-layer="actors" opacity={rainOpacity}>
        {Array.from({ length: 22 }, (_, index) => (
          <Carrier
            key={index}
            shape="droplet"
            x={420 + (index % 8) * 74}
            y={150 + Math.floor(index / 8) * 72}
            size={42}
            fill={palette.carrier}
            isPlaying={isPlaying}
            motionDelay={index * 0.04}
          />
        ))}
      </g>

      <g data-layer="terrainNear">
        <path
          d="M0 646 C190 626 340 608 456 604 C600 600 692 620 874 618 C1088 616 1332 606 1600 646 L1600 900 L0 900 Z"
          fill="#7f4d24"
          opacity="0.5"
        />
        <path d="M0 700 C220 666 414 662 610 688 C832 718 1060 698 1600 720" fill="none" stroke="#956432" strokeWidth="7" opacity="0.32" />
        <path d="M0 764 C212 730 420 728 645 752 C890 778 1110 762 1600 788" fill="none" stroke="#5f3418" strokeWidth="8" opacity="0.28" />
      </g>

      <g data-layer="result-deposit" opacity={deltaOpacity}>
        <path
          d="M1000 566 C1092 594 1172 606 1254 590 C1220 648 1138 696 1012 710 C928 678 910 620 1000 566Z"
          fill={palette.payload}
          opacity="0.72"
        />
        <path
          d="M1044 592 C1114 612 1168 616 1224 604"
          fill="none"
          stroke={palette.payloadGlow}
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>

      <g data-layer="actors-payload" opacity={sedimentOpacity}>
        {sediment.map((point, index) => (
          <Carrier
            key={index}
            shape="grain"
            x={point.x}
            y={point.y}
            size={30 + (index % 3) * 5}
            fill={index % 2 === 0 ? palette.payload : palette.payloadGlow}
            isPlaying={isPlaying}
            motionDelay={index * 0.06}
            label={brief.actors.payload.label}
          />
        ))}
      </g>

      <g data-testid="carrier-flow-region-labels" data-layer="regionLabels" fontFamily="Inter, system-ui, sans-serif" fontWeight="900">
        <text x="118" y="565" fill={palette.ink} fontSize="28">before</text>
        <text x="1110" y="594" fill={palette.payload} fontSize="26" opacity={reveal}>sediment fan</text>
      </g>

      <g data-layer="accents" opacity={reveal}>
        <circle cx="760" cy="512" r="116" fill="rgba(255,255,255,0.2)" stroke="#fff" strokeWidth="7" />
        <path d="M832 600 L910 688" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
        <text x="704" y="526" fill={palette.payload} fontSize="34" fontWeight="900" fontFamily="Inter, system-ui, sans-serif">
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

      <g data-layer="actorTrail" opacity="0.46">
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
