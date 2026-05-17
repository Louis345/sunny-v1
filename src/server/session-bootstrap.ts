/** Session cold-start — extracted from SessionManager.start(). */
// @ts-nocheck
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { getTtsNameForChildId } from "../profiles/childrenConfig";
import {
  DEMO_MODE_PROMPT,
  HOMEWORK_MODE_PROMPT,
  buildDebugPrompt,
  buildDiagPrompt,
  buildSessionPrompt,
  extractWordsFromHomework,
  normalizeSessionSubject,
} from "../agents/prompts";
import { loadHomeworkPayload } from "../utils/loadHomeworkFolder";
import {
  getReadingCanvasPreferencesForChild,
  readLearningProfile,
} from "../utils/learningProfileIO";
import { classifyAndRoute } from "../agents/classifier/classifier";
import {
  extractHomeworkProblems,
  type HomeworkExtractionResult,
} from "../agents/psychologist/psychologist";
import { childIdFromName, planSession } from "../engine/learningEngine";
import { buildAdventureMapFromSessionPlan } from "../engine/sessionPlanFromChart";
import { getChildChart } from "../profiles/childChart";
import { computeProgression } from "../engine/progression";
import {
  CANONICAL_AGENT_TOOL_KEYS,
  getSessionTypeConfig,
  resolveSessionType,
  sessionTypeFromSubject,
} from "./session-type-registry";
import {
  buildAssignmentManifestFromWorksheetProblems,
  buildWorksheetPlayerState,
  detectWorksheetInteractionMode,
} from "./assignment-player";
import { createWorksheetSession as createWSSession } from "./worksheet-tools";
import { readRasterDimensionsFromFile } from "../utils/rasterDimensions";
import {
  getSunnyMode,
  isDebugClaude,
  isDemoMode,
  isDiagMapMode,
  isHomeworkMode,
} from "../utils/runtimeMode";
import {
  buildMapSummaryFromPendingNodes,
  MAP_SUMMARY_NATURAL_USE_INSTRUCTION,
} from "../shared/mapSummary";
import { ensureFreshPendingHomework } from "../scripts/homeworkSelector";
import { resolveSunnyRuntimeConfig } from "../shared/runtimeConfig";
import {
  applyDebugClaudeOpeningLineForSession,
  prependDebugClaudeDeveloperBlock,
} from "./debug-helpers";
import { getLatestMapStateForChild } from "./map-coordinator";
import { generateCanvasCapabilitiesManifest } from "./canvas/registry";
import { CHARLOTTE_DIAG_DEFAULT_VOICE_ID } from "../diag-voices";
import { generateToolDocs } from "../agents/elli/tools/generateToolDocs";
import { startMaxDurationTimer } from "./session-triggers";
import { WsTtsBridge } from "./ws-tts-bridge";
import { mathProblem, resetMathProbeSession } from "../agents/elli/tools/mathProblem";
import { resetSessionStart } from "../agents/elli/tools/startSession";
import { resetTransitionToWork } from "../agents/elli/tools/transitionToWork";
import { formatDateTimeEastern } from "../agents/elli/tools/dateTime";
import { buildWorksheetToolPrompt } from "../agents/prompts/worksheetSessionPrompt";
import {
  createSessionContext,
} from "./session-context";
import type { ChildName } from "../companions/loader";

function parseSunnyChildEnv(): ChildName | null {
  const v = process.env.SUNNY_CHILD?.trim().toLowerCase();
  if (v === "ila") return "Ila";
  if (v === "reina") return "Reina";
  if (v === "creator") return "creator";
  return null;
}

export type SessionStartHooks = {
  registerCreatorDiagReadingSession?: (session: unknown) => void;
};

/** Spelling word list for homework/spelling sessions — pending ingest list wins over OCR folder text. */
export function resolveSpellingWordListForHomework(opts: {
  worksheetMode: boolean;
  extractSpellingWords: boolean;
  pendingWordList?: string[] | null;
  pendingNodes?: Array<{ type?: string; words?: string[] }> | null;
  rawContent: string;
}): string[] {
  if (opts.worksheetMode || !opts.extractSpellingWords) return [];
  const firstSpellingNodeWords = (opts.pendingNodes ?? [])
    .find((node) => node.type === "letter-rush" || node.type === "spell-check")
    ?.words?.map((x) => String(x).trim())
    .filter(Boolean) ?? [];
  if (firstSpellingNodeWords.length > 0) return firstSpellingNodeWords;
  const pending = (opts.pendingWordList ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (pending.length > 0) return pending;
  return extractWordsFromHomework(opts.rawContent);
}

export function shouldLoadLegacyHomeworkFolder(opts: {
  diagKioskFast: boolean;
  homeworkMode: boolean;
  subject: string;
  pendingHomework?: {
    homeworkId?: string | null;
    wordList?: string[] | null;
    nodes?: Array<{ type?: string; words?: string[] }> | null;
  } | null;
}): boolean {
  if (opts.diagKioskFast) return false;
  if (opts.homeworkMode) return true;
  const hasPendingHomework =
    Boolean(String(opts.pendingHomework?.homeworkId ?? "").trim()) ||
    Boolean(opts.pendingHomework?.wordList?.length) ||
    Boolean(opts.pendingHomework?.nodes?.length);
  if ((opts.subject === "homework" || opts.subject === "spelling") && hasPendingHomework) {
    return false;
  }
  return true;
}

function pendingHomeworkHasContent(pendingHomework?: {
  homeworkId?: string | null;
  wordList?: string[] | null;
  nodes?: Array<{ type?: string; words?: string[] }> | null;
} | null): boolean {
  return (
    Boolean(String(pendingHomework?.homeworkId ?? "").trim()) ||
    Boolean(pendingHomework?.wordList?.length) ||
    Boolean(pendingHomework?.nodes?.length)
  );
}

export function shouldUsePendingHomeworkChildPrompt(opts: {
  subject: string;
  homeworkPayloadPresent: boolean;
  pendingHomework?: {
    homeworkId?: string | null;
    wordList?: string[] | null;
    nodes?: Array<{ type?: string; words?: string[] }> | null;
  } | null;
}): boolean {
  if (opts.homeworkPayloadPresent) return false;
  if (!(opts.subject === "homework" || opts.subject === "spelling")) return false;
  return pendingHomeworkHasContent(opts.pendingHomework);
}

function compactList(items?: unknown[] | null, max = 30): string {
  const list = (items ?? [])
    .map((item) => String(item).trim())
    .filter(Boolean);
  if (list.length <= max) return list.join(", ");
  return `${list.slice(0, max).join(", ")} (+${list.length - max} more)`;
}

function firstPromptNodeFromPendingHomework(pendingHomework: {
  contentProfile?: {
    practiceDomain?: string | null;
    primarySkill?: string | null;
  } | null;
  nodes?: Array<{ type?: string | null; words?: string[] | null }> | null;
} | null): { type?: string | null; words?: string[] | null } | null {
  const nodes = pendingHomework?.nodes ?? [];
  if (nodes.length === 0) return null;
  const practiceDomain = String(pendingHomework?.contentProfile?.practiceDomain ?? "").toLowerCase();
  const primarySkill = String(pendingHomework?.contentProfile?.primarySkill ?? "").toLowerCase();
  const spellingRecall =
    practiceDomain === "spelling" || primarySkill.includes("spell");
  if (spellingRecall) {
    const recallNode = nodes.find((node) =>
      node.type === "spell-check" || node.type === "letter-rush",
    );
    if (recallNode) return recallNode;
  }
  return nodes[0] ?? null;
}

export function buildPendingHomeworkPromptContent(pendingHomework: {
  homeworkId?: string | null;
  weekOf?: string | null;
  testDate?: string | null;
  testDateSource?: string | null;
  testDateConfirmed?: boolean | null;
  returnTag?: string | null;
  wordList?: string[] | null;
  contentProfile?: {
    topic?: string | null;
    primarySkill?: string | null;
    practiceDomain?: string | null;
    assignmentFormat?: string | null;
    concepts?: string[] | null;
  } | null;
  capturedContent?: {
    title?: string | null;
    type?: string | null;
    words?: string[] | null;
    wordGroups?: Array<{
      label?: string | null;
      purpose?: string | null;
      words?: string[] | null;
      confidence?: number | null;
    }> | null;
    assignmentInterpretation?: {
      wordGroups?: Array<{
        label?: string | null;
        purpose?: string | null;
        words?: string[] | null;
        confidence?: number | null;
      }> | null;
    } | null;
  } | null;
  nodes?: Array<{ type?: string; words?: string[] | null }> | null;
}): string {
  const contentProfile = pendingHomework.contentProfile ?? null;
  const capturedContent = pendingHomework.capturedContent ?? null;
  const interpretedGroups =
    capturedContent?.assignmentInterpretation?.wordGroups ??
    capturedContent?.wordGroups ??
    [];
  const lines: string[] = [
    "## Active homework cycle",
    `homeworkId: ${pendingHomework.homeworkId ?? "unknown"}`,
  ];

  if (pendingHomework.weekOf) lines.push(`weekOf: ${pendingHomework.weekOf}`);
  if (pendingHomework.testDate) lines.push(`testDate: ${pendingHomework.testDate}`);
  if (pendingHomework.testDateSource) {
    lines.push(`testDateSource: ${pendingHomework.testDateSource}`);
  }
  if (pendingHomework.testDateConfirmed !== undefined) {
    lines.push(`testDateConfirmed: ${Boolean(pendingHomework.testDateConfirmed)}`);
  }
  if (pendingHomework.returnTag) lines.push(`returnTag: ${pendingHomework.returnTag}`);
  if (capturedContent?.title) lines.push(`title: ${capturedContent.title}`);
  if (capturedContent?.type) lines.push(`assignmentType: ${capturedContent.type}`);
  if (contentProfile?.practiceDomain) {
    lines.push(`practiceDomain: ${contentProfile.practiceDomain}`);
  }
  if (contentProfile?.topic) lines.push(`topic: ${contentProfile.topic}`);
  if (contentProfile?.primarySkill) {
    lines.push(`primarySkill: ${contentProfile.primarySkill}`);
  }
  if (contentProfile?.assignmentFormat) {
    lines.push(`assignmentFormat: ${contentProfile.assignmentFormat}`);
  }
  if (contentProfile?.concepts?.length) {
    lines.push(`concepts: ${compactList(contentProfile.concepts)}`);
  }
  if (pendingHomework.wordList?.length) {
    lines.push(`words: ${compactList(pendingHomework.wordList)}`);
  }

  if (interpretedGroups.length > 0) {
    lines.push("", "## Assignment interpretation");
    for (const group of interpretedGroups) {
      const groupMeta = [
        group.purpose ?? "unknown",
        typeof group.confidence === "number"
          ? `confidence=${group.confidence.toFixed(2)}`
          : null,
      ].filter(Boolean).join("; ");
      lines.push(
        `- ${group.label ?? "word group"} (${groupMeta}): ${compactList(group.words)}`,
      );
    }
  }

  if (pendingHomework.nodes?.length) {
    lines.push("", "## Planned adventure nodes");
    for (const node of pendingHomework.nodes) {
      lines.push(`- ${node.type ?? "unknown"}: ${compactList(node.words)}`);
    }
  }

  return lines.join("\n");
}

export function buildHomeworkSessionStartPrompt(opts: {
  childName: string;
  pendingHomework?: {
    homeworkId?: string | null;
    testDate?: string | null;
    contentProfile?: {
      topic?: string | null;
      primarySkill?: string | null;
      practiceDomain?: string | null;
      assignmentFormat?: string | null;
      concepts?: string[] | null;
    } | null;
    capturedContent?: {
      title?: string | null;
      type?: string | null;
    } | null;
    nodes?: Array<{ type?: string | null; words?: string[] | null }> | null;
  } | null;
  activeMapFirstNode?: {
    type?: string | null;
    words?: string[] | null;
    wordRadarItems?: Array<{ display?: string | null }> | null;
  } | null;
}): string {
  const pendingHomework = opts.pendingHomework ?? null;
  const contentProfile = pendingHomework?.contentProfile ?? null;
  const capturedContent = pendingHomework?.capturedContent ?? null;
  const firstNode =
    opts.activeMapFirstNode ??
    firstPromptNodeFromPendingHomework(pendingHomework) ??
    null;
  const firstNodeWords = compactList(
    firstNode?.words ??
      firstNode?.wordRadarItems?.map((item) => item.display ?? "").filter(Boolean),
    6,
  );
  const lines = [
    "[Session start — homework map mounted]",
    `Speak to ${opts.childName} as the child, not the parent.`,
    "Do not address the parent or caregiver.",
    "Generate exactly one short sentence.",
    "No random greeting, standard opener, capability list, or demo language.",
    "Use this active homework context naturally:",
    `homeworkId: ${pendingHomework?.homeworkId ?? "unknown"}`,
  ];
  if (pendingHomework?.testDate) lines.push(`testDate: ${pendingHomework.testDate}`);
  if (capturedContent?.title) lines.push(`title: ${capturedContent.title}`);
  if (capturedContent?.type) lines.push(`assignmentType: ${capturedContent.type}`);
  if (contentProfile?.practiceDomain) {
    lines.push(`practiceDomain: ${contentProfile.practiceDomain}`);
  }
  if (contentProfile?.topic) lines.push(`topic: ${contentProfile.topic}`);
  if (contentProfile?.primarySkill) {
    lines.push(`primarySkill: ${contentProfile.primarySkill}`);
  }
  if (contentProfile?.assignmentFormat) {
    lines.push(`assignmentFormat: ${contentProfile.assignmentFormat}`);
  }
  if (contentProfile?.concepts?.length) {
    lines.push(`concepts: ${compactList(contentProfile.concepts, 8)}`);
  }
  if (firstNode?.type) {
    lines.push(`First map node: ${firstNode.type}`);
  }
  if (firstNodeWords) {
    lines.push(`First node words: ${firstNodeWords}`);
  }
  lines.push("Invite the child to start the first map node when ready.");
  return lines.join("\n");
}

export function resolveHomeworkOpenerFirstNode(opts: {
  childId: string;
  activeMapFirstNode?: {
    type?: string | null;
    words?: string[] | null;
    wordRadarItems?: Array<{ display?: string | null }> | null;
  } | null;
}): {
  type?: string | null;
  words?: string[] | null;
  wordRadarItems?: Array<{ display?: string | null }> | null;
} | null {
  if (opts.activeMapFirstNode?.type) return opts.activeMapFirstNode;
  try {
    const chart = getChildChart(opts.childId);
    if (!chart.activeSessionPlan || !chart.homework.pending) return null;
    const nodes = buildAdventureMapFromSessionPlan(chart, chart.activeSessionPlan);
    return nodes[0] ?? null;
  } catch (err) {
    console.warn(
      `  🎮 [session-bootstrap] [opener-node-fallback] child=${opts.childId} reason=${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export function resolveBootstrapSubject(opts: {
  diagKioskFast: boolean;
  envSubject?: string;
}): ReturnType<typeof normalizeSessionSubject> {
  const envSubject = normalizeSessionSubject(opts.envSubject);
  return opts.diagKioskFast ? "diag" : envSubject;
}

export async function runSessionStart(
  session: any,
  hooks: SessionStartHooks = {},
): Promise<void> {
    if (process.env.SUNNY_STATELESS === "true") {
      console.warn(
        "🚨 STATELESS MODE — NO DATA WILL BE SAVED\n🚨 If this is a real child session run: npm run sunny",
      );
    }
    session.spellingHomeworkWordsByNorm = [];
    session.refreshSpellingHomeworkGate();
    session.spellingWordsWithAttempt.clear();
    session.spaceInvadersRewardLaunched = false;
    session.spaceInvadersRewardActive = false;

    const ts = new Date().toISOString();
    session.sessionStartTime = Date.now();
    console.log(
      `  🌟 [${ts}] Starting session: ${session.childName} with ${session.companion.name}`,
    );

    const subject = resolveBootstrapSubject({
      diagKioskFast: session.diagKioskFast,
      envSubject: process.env.SUNNY_SUBJECT,
    });
    const runtime = resolveSunnyRuntimeConfig(process.env);

    const detectedChild = session.childName;
    const homeworkChild = session.diagKioskFast
      ? session.childName
      : (parseSunnyChildEnv() ?? detectedChild ?? "Ila");
    console.log(`  👤 Child override: ${homeworkChild}`);

    if (!session.diagKioskFast && subject === "homework") {
      ensureFreshPendingHomework(String(homeworkChild).toLowerCase(), {
        domain: runtime.homeworkDomain ?? undefined,
      });
      session.bustPromptCache?.();
    }

    const sessionLearningProfile = !session.diagKioskFast
      ? readLearningProfile(String(homeworkChild).toLowerCase())
      : null;
    const activeMapState = !session.diagKioskFast
      ? getLatestMapStateForChild(String(homeworkChild).toLowerCase())
      : null;

    let homeworkPayload: Awaited<ReturnType<typeof loadHomeworkPayload>> | null =
      null;

    if (!session.diagKioskFast) {
      // Check drop/ for new files and route them before loading homework
      session.send("loading_status", {
        message: "Checking for new assignments...",
      });
      try {
        if (isDemoMode() || isHomeworkMode()) {
          console.log("  🎭 Demo/homework mode — skipping classifier");
        } else {
          const { hasNewFiles, routed } = await classifyAndRoute(homeworkChild);
          if (hasNewFiles) {
            console.log("  📥 New files processed:");
            routed.forEach((r) => console.log(`    ${r}`));
            session.send("loading_status", {
              message: `Loading ${homeworkChild}'s assignments...`,
            });
            session.bustPromptCache();
          }
        }
      } catch (err) {
        console.warn(
          "  ⚠️  Classifier failed:",
          err instanceof Error ? err.message : String(err),
        );
      }

      // Folder-based homework — load in demo too when a folder exists (worksheet + vision).
      if (
        shouldLoadLegacyHomeworkFolder({
          diagKioskFast: session.diagKioskFast,
          homeworkMode: isHomeworkMode(),
          subject,
          pendingHomework: sessionLearningProfile?.pendingHomework,
        })
      ) {
        homeworkPayload = await loadHomeworkPayload(homeworkChild);
      } else {
        console.log(
          "  📚 Active pending homework found — skipping legacy homework folder",
        );
      }
    } else {
      console.log(
        "  ⚡ [diag-kiosk] fast path — no classifier, no homework folder, no extraction",
      );
    }

    /** Snapshot of final companion systemPrompt (parent review prepends prefix to this). */
    let sessionSystemPromptSnapshot = "";

    if (
      isHomeworkMode() &&
      homeworkPayload &&
      !(isDiagMapMode() || subject === "diag")
    ) {
      // HOMEWORK MODE: loads real homework but uses parent-facing prompt (no progression loop)
      console.log(
        `  📚 Homework loaded for ${homeworkChild}: ${homeworkPayload.fileCount} pages`,
      );
      session.send("loading_status", { message: "Preparing homework review..." });

      let extraction: HomeworkExtractionResult = { subject: "", problems: [] };
      try {
        console.log("  🧠 Psychologist extracting worksheet problems...");
        session.send("loading_status", {
          message: "Reading worksheet questions...",
        });
        extraction = await extractHomeworkProblems({
          rawText: homeworkPayload.rawContent,
          pageAssets: homeworkPayload.pageAssets,
        });
        console.log(
          `  🎮 [worksheet] extraction — subject: "${extraction.subject}", ` +
            `problems: ${extraction.problems.length}`,
        );
      } catch (err) {
        console.warn(
          "  ⚠️  Extraction failed:",
          err instanceof Error ? err.message : String(err),
        );
      }

      // Load worksheet PDF as canvas + pin image for vision — same as normal mode
      const pdfFilename = homeworkPayload.assetFilenames.find((n) =>
        n.toLowerCase().endsWith(".pdf"),
      );
      if (pdfFilename) {
        const pdfAssetUrl = `/api/homework/${homeworkPayload.childName}/${homeworkPayload.date}/${encodeURIComponent(pdfFilename)}`;
        // Show PDF on canvas
        session.currentCanvasState = {
          mode: "worksheet_pdf",
          pdfAssetUrl,
          pdfPage: 1,
          overlayFields: [],
        };
        session.send("canvas_draw", session.currentCanvasState);
        // Convert PDF → PNG for companion vision
        try {
          const pdfPath = path.join(homeworkPayload.folderPath, pdfFilename);
          const tmpDir = os.tmpdir();
          const pdfBase = path.basename(pdfPath);
          execSync(`/usr/bin/qlmanage -t -s 2000 -o "${tmpDir}" "${pdfPath}"`, {
            stdio: "pipe",
          });
          const pngPath = path.join(tmpDir, `${pdfBase}.png`);
          session.worksheetPageFile = {
            data: fs.readFileSync(pngPath),
            mimeType: "image/png",
          };
          try {
            fs.unlinkSync(pngPath);
          } catch {
            /* cleanup best-effort */
          }
          console.log(
            `  👁️  [worksheet] loaded PDF PNG for homework review (${(session.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`,
          );
        } catch (e) {
          // Fall back to page asset
          if (
            !session.worksheetPageFile &&
            homeworkPayload.pageAssets.length > 0
          ) {
            const asset = homeworkPayload.pageAssets[0];
            session.worksheetPageFile = {
              data: Buffer.from(asset.data, "base64"),
              mimeType: asset.mediaType,
            };
          }
          console.warn(
            "  ⚠️  PDF→PNG conversion failed:",
            e instanceof Error ? e.message : String(e),
          );
        }
      } else if (homeworkPayload.pageAssets.length > 0) {
        const asset = homeworkPayload.pageAssets[0];
        session.worksheetPageFile = {
          data: Buffer.from(asset.data, "base64"),
          mimeType: asset.mediaType,
        };
      }

      session.worksheetSubjectLabel = extraction.subject.trim() || "worksheet";

      const homeworkReviewSystemPrompt = prependDebugClaudeDeveloperBlock(
        HOMEWORK_MODE_PROMPT(
          session.childName,
          session.companion.name,
          extraction.subject,
        ),
      );
      sessionSystemPromptSnapshot = homeworkReviewSystemPrompt;
      session.companion = {
        ...session.companion,
        systemPrompt: homeworkReviewSystemPrompt,
        openingLine:
          `Hello — I'm ${session.companion.name} in homework review mode. ` +
          `I've loaded ${getTtsNameForChildId(String(homeworkChild))}'s worksheet on ${extraction.subject || "homework"}. ` +
          "What would you like to review?",
      };
      console.log(`  📋 Homework mode — parent/developer review prompt active`);
      console.log(`  📚 Subject: ${extraction.subject || subject}`);
      session.send("loading_status", { message: "Ready for review..." });
    } else if (subject === "diag" && !homeworkPayload) {
      session.send("loading_status", { message: "Preparing diagnostic session..." });
      console.log(
        `  🎮 [diag] no homework folder — diagnostic prompt (${homeworkChild})`,
      );
      const diagSessionPrompt = isDebugClaude()
        ? buildDebugPrompt(
            homeworkChild,
            session.companion.name,
            generateCanvasCapabilitiesManifest(),
            generateToolDocs(),
          )
        : buildDiagPrompt(homeworkChild, session.companion.markdownPath, {
            carePlan: null,
          });
      const diagCompanionSystemPrompt = isDebugClaude()
        ? diagSessionPrompt
        : prependDebugClaudeDeveloperBlock(diagSessionPrompt);
      sessionSystemPromptSnapshot = diagCompanionSystemPrompt;
      session.companion = {
        ...session.companion,
        systemPrompt: diagCompanionSystemPrompt,
      };
      session.isSpellingSession = false;
      console.log(`  ✅ Session prompt ready (${diagSessionPrompt.length} chars)`);
      console.log(`  📚 Subject mode: ${subject}`);
    } else if (isDemoMode() && !homeworkPayload) {
      const demoCompanionSystemPrompt = prependDebugClaudeDeveloperBlock(
        DEMO_MODE_PROMPT(session.childName, session.companion.name),
      );
      sessionSystemPromptSnapshot = demoCompanionSystemPrompt;
      session.companion = {
        ...session.companion,
        systemPrompt: demoCompanionSystemPrompt,
        openingLine:
          `Hello — I'm ${session.companion.name} in demo mode. ` +
          "I'm ready to demonstrate my capabilities. " +
          "What would you like to see?",
      };
      console.log(
        `  🎭 Demo mode — parent/developer prompt (no homework folder for ${homeworkChild})`,
      );
      console.log(`  📚 Subject mode: ${subject}`);
      session.send("loading_status", { message: "Starting demo session..." });
    } else if (
      shouldUsePendingHomeworkChildPrompt({
        subject,
        homeworkPayloadPresent: Boolean(homeworkPayload),
        pendingHomework: sessionLearningProfile?.pendingHomework,
      })
    ) {
      const pendingHomework = sessionLearningProfile.pendingHomework;
      session.send("loading_status", {
        message: "Preparing homework adventure...",
      });
      const homeworkForPrompt = buildPendingHomeworkPromptContent(pendingHomework);
      const extractSpellingWords = subject === "spelling" || subject === "homework";
      const wordList = resolveSpellingWordListForHomework({
        worksheetMode: false,
        extractSpellingWords,
        pendingWordList: pendingHomework.wordList,
        pendingNodes: pendingHomework.nodes,
        rawContent: homeworkForPrompt,
      });

      if (extractSpellingWords && wordList.length > 0) {
        console.log(`  📋 Spelling words extracted: ${wordList.join(", ")}`);
        session.spellingHomeworkWordsByNorm = [
          ...new Set(
            wordList.map((w) => String(w).toLowerCase().trim()).filter(Boolean),
          ),
        ];
      } else {
        session.spellingHomeworkWordsByNorm = [];
      }
      session.refreshSpellingHomeworkGate();

      const sessionPrompt = isDebugClaude()
        ? buildDebugPrompt(
            homeworkChild,
            session.companion.name,
            generateCanvasCapabilitiesManifest(),
            generateToolDocs(),
          )
        : await buildSessionPrompt(
            homeworkChild,
            session.companion.markdownPath,
            homeworkForPrompt,
            wordList,
            subject,
          );
      const homeworkCompanionSystemPrompt = isDebugClaude()
        ? sessionPrompt
        : prependDebugClaudeDeveloperBlock(sessionPrompt);
      sessionSystemPromptSnapshot = homeworkCompanionSystemPrompt;
      session.companion = {
        ...session.companion,
        systemPrompt: homeworkCompanionSystemPrompt,
      };
      session.isSpellingSession = extractSpellingWords;
      console.log(
        `  🎮 [homework-pending] child prompt active homework=${pendingHomework.homeworkId ?? "unknown"} words=${wordList.length}`,
      );
      console.log(`  ✅ Session prompt ready (${sessionPrompt.length} chars)`);
      if (session.isSpellingSession) {
        console.log("  📝 Spelling session mode active");
      }
      console.log(`  📚 Subject mode: ${subject}`);
    } else if (homeworkPayload) {
      console.log(
        `  📚 Homework loaded for ${homeworkChild}: ` +
          `${homeworkPayload.fileCount} pages`,
      );
      session.send("loading_status", { message: "Preparing session prompt..." });

      // ── Extraction cache ────────────────────────────────────────────────────
      // extraction.json lives alongside the PDF. Once written, all future
      // sessions load instantly with zero tokens and no overload risk.
      const cacheFile = path.join(
        homeworkPayload.folderPath,
        "extraction.json",
      );
      /** Creator / true diag map: kiosk prompt, no worksheet extraction pipeline. */
      const useDiagHomeworkPrompt = isDiagMapMode() || subject === "diag";
      /** Impersonate child: same buildSessionPrompt as production, but no psychologist API and no extraction.json writes (cache read-only if present). */
      const playtestAsChild = getSunnyMode() === "as-child";

      let extraction: HomeworkExtractionResult = {
        subject: "",
        problems: [],
      };

      // Try loading from cache first
      let loadedFromCache = false;
      if (!useDiagHomeworkPrompt && fs.existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(
            fs.readFileSync(cacheFile, "utf-8"),
          ) as HomeworkExtractionResult;
          if (cached.subject && cached.problems.length > 0) {
            extraction = cached;
            loadedFromCache = true;
            console.log(
              `  ⚡ [worksheet] loaded extraction from cache — subject: "${extraction.subject}", ` +
                `problems: ${extraction.problems.length}`,
            );
          }
        } catch (e) {
          console.warn(
            "  ⚠️  extraction.json corrupt — re-extracting:",
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      if (!loadedFromCache && !useDiagHomeworkPrompt && !playtestAsChild) {
        try {
          console.log("  🧠 Psychologist extracting worksheet problems...");
          session.send("loading_status", {
            message: "Reading worksheet questions...",
          });
          extraction = await extractHomeworkProblems({
            rawText: homeworkPayload.rawContent,
            pageAssets: homeworkPayload.pageAssets,
          });
          console.log(
            `  🎮 [worksheet] extraction — subject: "${extraction.subject}", ` +
              `problems: ${extraction.problems.length}`,
          );
          // Persist to cache so next session is instant
          if (extraction.subject && extraction.problems.length > 0) {
            try {
              fs.writeFileSync(
                cacheFile,
                JSON.stringify(extraction, null, 2),
                "utf-8",
              );
              console.log(
                `  💾 [worksheet] extraction cached → extraction.json`,
              );
            } catch (e) {
              console.warn(
                "  ⚠️  Could not write extraction.json:",
                e instanceof Error ? e.message : String(e),
              );
            }
          }
        } catch (err) {
          console.warn(
            "  ⚠️  Worksheet extraction failed:",
            err instanceof Error ? err.message : String(err),
          );
          // Stale cache is better than nothing — check once more
          if (fs.existsSync(cacheFile)) {
            try {
              const stale = JSON.parse(
                fs.readFileSync(cacheFile, "utf-8"),
              ) as HomeworkExtractionResult;
              if (stale.subject) {
                extraction = stale;
                console.warn("  ⚠️  Using stale extraction.json as fallback");
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      session.worksheetProblems = session.selectWorksheetProblems(extraction);
      session.worksheetProblemIndex = 0;
      session.worksheetRewardAfterN =
        extraction.session_directives?.reward_after ?? 5;
      session.worksheetSubjectLabel = extraction.subject.trim() || "worksheet";
      session.worksheetMode = session.worksheetProblems.length > 0;
      session.worksheetInteractionMode = session.worksheetMode
        ? (extraction.session_directives?.interaction_mode ??
          detectWorksheetInteractionMode({
            rawContent: homeworkPayload.rawContent,
            extractionProblems: extraction.problems,
          }))
        : "answer_entry";
      if (session.worksheetMode) {
        session.worksheetInteractionMode = session.maybeRelaxMisdetectedReviewMode(
          extraction,
          session.worksheetInteractionMode,
        );
      }
      session.assignmentManifest = null;
      session.worksheetPlayerState = null;

      // ── PDF + vision loading ─────────────────────────────────────────────────
      // Always load the PDF and convert to PNG regardless of whether extraction
      // succeeded — the child should always be able to see their worksheet, and
      // the companion needs vision even in visual-only fallback mode.
      const pdfFilename = homeworkPayload.assetFilenames.find((name) =>
        name.toLowerCase().endsWith(".pdf"),
      );
      if (pdfFilename) {
        const pdfAssetUrl = `/api/homework/${homeworkPayload.childName}/${homeworkPayload.date}/${encodeURIComponent(pdfFilename)}`;
        const pdfPath = path.join(homeworkPayload.folderPath, pdfFilename);

        // Convert PDF → PNG for companion vision (always — not gated on worksheetMode)
        try {
          const tmpDir = os.tmpdir();
          const pdfBase = path.basename(pdfPath);
          execSync(`/usr/bin/qlmanage -t -s 2000 -o "${tmpDir}" "${pdfPath}"`, {
            stdio: "pipe",
          });
          const pngPath = path.join(tmpDir, `${pdfBase}.png`);
          session.worksheetPageFile = {
            data: fs.readFileSync(pngPath),
            mimeType: "image/png",
          };
          try {
            fs.unlinkSync(pngPath);
          } catch {
            /* cleanup best-effort */
          }
          console.log(
            `  👁️  [worksheet] converted PDF → PNG for companion vision (${(session.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`,
          );
        } catch (e) {
          console.warn(
            "  ⚠️  Could not convert worksheet PDF for companion vision:",
            e instanceof Error ? e.message : String(e),
          );
        }

        if (session.worksheetMode) {
          try {
            session.assignmentManifest =
              buildAssignmentManifestFromWorksheetProblems({
                assignmentId: `${homeworkPayload.childName.toLowerCase()}-${homeworkPayload.date}`,
                childName: homeworkPayload.childName,
                title: `${session.companion.name} worksheet`,
                createdAt: new Date().toISOString(),
                pdfAssetUrl,
                problems: session.worksheetProblems,
              });
            session.worksheetPlayerState = buildWorksheetPlayerState(
              session.assignmentManifest,
              session.worksheetInteractionMode,
            );
            console.log(
              `  📄 [worksheet] worksheet_pdf enabled — using asset ${pdfAssetUrl} (${session.worksheetInteractionMode})`,
            );
          } catch (err) {
            console.warn(
              "  ⚠️  Worksheet player manifest build failed:",
              err instanceof Error ? err.message : String(err),
            );
          }
        } else {
          // Extraction failed or produced no usable problems — show the PDF on canvas
          // anyway so the child can see it and the companion can tutor from vision.
          session.currentCanvasState = {
            mode: "worksheet_pdf" as const,
            pdfAssetUrl,
            pdfPage: 1,
            overlayFields: [],
          };
          session.send("canvas_draw", session.currentCanvasState);
          console.log(
            `  📄 [worksheet] visual-only fallback — PDF visible, no structured problem queue`,
          );
        }
      } else {
        const imageFilename = homeworkPayload.assetFilenames.find((name) => {
          const lower = name.toLowerCase();
          return (
            lower.endsWith(".png") ||
            lower.endsWith(".jpg") ||
            lower.endsWith(".jpeg") ||
            lower.endsWith(".gif") ||
            lower.endsWith(".webp")
          );
        });

        if (imageFilename) {
          const imageAssetUrl = `/api/homework/${homeworkPayload.childName}/${homeworkPayload.date}/${encodeURIComponent(imageFilename)}`;
          console.log(`  📄 [worksheet] using image asset: ${imageAssetUrl}`);
          const imagePath = path.join(
            homeworkPayload.folderPath,
            imageFilename,
          );
          let rasterPageW = 800;
          let rasterPageH = 1000;
          const rasterDims = readRasterDimensionsFromFile(imagePath);
          if (rasterDims) {
            rasterPageW = rasterDims.width;
            rasterPageH = rasterDims.height;
            console.log(
              `  📐 [worksheet] raster page size ${rasterPageW}×${rasterPageH} (from file)`,
            );
          } else {
            console.log(
              `  📐 [worksheet] raster page size ${rasterPageW}×${rasterPageH} (default — could not read headers)`,
            );
          }

          if (session.worksheetMode) {
            try {
              session.assignmentManifest =
                buildAssignmentManifestFromWorksheetProblems({
                  assignmentId: `${homeworkPayload.childName.toLowerCase()}-${homeworkPayload.date}`,
                  childName: homeworkPayload.childName,
                  title: `${session.companion.name} worksheet`,
                  createdAt: new Date().toISOString(),
                  pdfAssetUrl: imageAssetUrl,
                  problems: session.worksheetProblems,
                  pageWidth: rasterPageW,
                  pageHeight: rasterPageH,
                });
              session.worksheetPlayerState = buildWorksheetPlayerState(
                session.assignmentManifest,
                session.worksheetInteractionMode,
              );
              console.log(
                `  📄 [worksheet] worksheet_pdf enabled via image — ${imageAssetUrl} (${session.worksheetInteractionMode})`,
              );
            } catch (err) {
              console.warn(
                "  ⚠️  Worksheet player manifest build failed:",
                err instanceof Error ? err.message : String(err),
              );
            }
          } else {
            session.currentCanvasState = {
              mode: "worksheet_pdf" as const,
              pdfAssetUrl: imageAssetUrl,
              pdfPage: 1,
              overlayFields: [],
            };
            session.send("canvas_draw", session.currentCanvasState);
            console.log(
              `  📄 [worksheet] visual-only fallback — image visible, no structured problem queue`,
            );
          }

          if (!session.worksheetPageFile) {
            if (fs.existsSync(imagePath)) {
              const lower = imageFilename.toLowerCase();
              const mimeType = lower.endsWith(".png")
                ? "image/png"
                : lower.endsWith(".webp")
                  ? "image/webp"
                  : lower.endsWith(".gif")
                    ? "image/gif"
                    : "image/jpeg";
              session.worksheetPageFile = {
                data: fs.readFileSync(imagePath),
                mimeType,
              };
              console.log(
                `  👁️  [worksheet] loaded image for companion vision (${(session.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`,
              );
            }
          }
        } else {
          console.warn(
            `  ⚠️  [worksheet] no PDF or image found in homework/${homeworkPayload.childName.toLowerCase()}/${homeworkPayload.date}/`,
          );
        }
      }

      if (!session.worksheetPageFile && homeworkPayload.pageAssets.length > 0) {
        const asset = homeworkPayload.pageAssets[0];
        session.worksheetPageFile = {
          data: Buffer.from(asset.data, "base64"),
          mimeType: asset.mediaType,
        };
        console.log(
          `  👁️  [worksheet] loaded worksheet image for companion vision (${(session.worksheetPageFile.data.length / 1024).toFixed(0)} KB)`,
        );
      }
      // ────────────────────────────────────────────────────────────────────────

      let sessionPrompt: string;
      if (useDiagHomeworkPrompt) {
        console.log(
          "  🎮 [diag] skipping psychologist session prompt pipeline (homework folder present)",
        );
        session.spellingHomeworkWordsByNorm = [];
        session.refreshSpellingHomeworkGate();
        if (isDebugClaude()) {
          sessionPrompt = buildDebugPrompt(
            homeworkChild,
            session.companion.name,
            generateCanvasCapabilitiesManifest(),
            generateToolDocs(),
          );
        } else {
          sessionPrompt = buildDiagPrompt(
            homeworkChild,
            session.companion.markdownPath,
            { carePlan: null },
          );
        }
      } else {
        if (playtestAsChild) {
          console.log(
            "  🧪 [playtest as-child] child session prompt — psychologist API skipped, extraction.json read-only",
          );
        } else {
          console.log("  🧠 Psychologist building session prompt...");
        }
        const extractSpellingWords =
          !session.worksheetMode &&
          (subject === "spelling" || subject === "homework");
        const wordList = resolveSpellingWordListForHomework({
          worksheetMode: session.worksheetMode,
          extractSpellingWords,
          pendingWordList: sessionLearningProfile?.pendingHomework?.wordList,
          pendingNodes: sessionLearningProfile?.pendingHomework?.nodes,
          rawContent: homeworkPayload.rawContent,
        });
        if (!session.worksheetMode && extractSpellingWords && wordList.length > 0) {
          console.log(`  📋 Spelling words extracted: ${wordList.join(", ")}`);
          session.spellingHomeworkWordsByNorm = [
            ...new Set(
              wordList.map((w) => String(w).toLowerCase().trim()).filter(Boolean),
            ),
          ];
          session.refreshSpellingHomeworkGate();
        } else if (session.worksheetMode) {
          session.spellingHomeworkWordsByNorm = [];
          session.refreshSpellingHomeworkGate();
          console.log(
            `  🎮 [worksheet] ${session.worksheetProblems.length} problem(s) queued; ` +
              `reward_after=${session.worksheetRewardAfterN}`,
          );
        } else {
          session.spellingHomeworkWordsByNorm = [];
          session.refreshSpellingHomeworkGate();
        }

        const homeworkForPrompt =
          session.worksheetMode && session.worksheetProblems.length > 0
            ? `## Worksheet extraction (validated; server presents only canonical supported problems)\n${JSON.stringify(
                {
                  subject: extraction.subject,
                  problems: session.worksheetProblems.map((p) => ({
                    id: p.id,
                    question: p.question,
                    hint: p.hint,
                    page: p.page,
                  })),
                  session_directives: extraction.session_directives,
                },
                null,
                2,
              )}\n\n--- ORIGINAL HOMEWORK ---\n${homeworkPayload.rawContent}`
            : homeworkPayload.rawContent;

        if (isDebugClaude()) {
          sessionPrompt = buildDebugPrompt(
            homeworkChild,
            session.companion.name,
            generateCanvasCapabilitiesManifest(),
            generateToolDocs(),
          );
        } else {
          sessionPrompt = await buildSessionPrompt(
            homeworkChild,
            session.companion.markdownPath,
            homeworkForPrompt,
            wordList,
            subject,
          );
        }
      }
      // Option C worksheet session + tool instructions — same for debug and normal (debug only swaps base prompt above).
      if (session.worksheetMode && subject !== "diag") {
        if (session.worksheetProblems.length > 0) {
          session.worksheetSession = createWSSession({
            childName: homeworkChild,
            companionName: session.companion.name,
            problems: session.worksheetProblems.map((p) => ({
              id: String(p.id),
              question: p.question,
              hint: p.hint,
              page: p.page ?? 1,
              linkedGames: p.linkedGames ?? [],
            })),
            rewardThreshold: session.worksheetRewardAfterN,
            rewardGame: "space-invaders",
          });
          const wsStatus = session.worksheetSession.getSessionStatus();
          if (wsStatus.pendingRewardFromLastSession) {
            console.log(
              `  🎁 Pending reward from last session: ${wsStatus.pendingRewardFromLastSession}`,
            );
          }
          sessionPrompt +=
            "\n\n" +
            buildWorksheetToolPrompt({
              childName: homeworkChild,
              companionName: session.companion.name,
              subjectLabel: session.worksheetSubjectLabel,
              problemCount: session.worksheetProblems.length,
              rewardThreshold: session.worksheetRewardAfterN,
              rewardGame: "space-invaders",
              pendingRewardFromLastSession:
                wsStatus.pendingRewardFromLastSession,
              interactionMode: session.worksheetInteractionMode,
            });
          sessionPrompt +=
            "\n\n## Worksheet session (canvas)\n" +
            `Subject label (informational): ${session.worksheetSubjectLabel}.\n` +
            `Use **canvasShow** with type "worksheet" and the correct problemId to show each page. ` +
            `Use **sessionLog** to record graded answers (correct + what the child said). ` +
            `Use **canvasClear** when switching away from the worksheet. ` +
            `Use **sessionStatus** / **canvasStatus** when you need state.\n`;
          console.log(
            `  📋 Worksheet tool prompt appended (Option C — ${session.worksheetProblems.length} problems)`,
          );
        } else {
          sessionPrompt +=
            "\n\n## Worksheet session (visual-only)\n" +
            `The worksheet image is available for discussion. There is no structured problem queue this session. ` +
            `Help ${homeworkChild} using the image. Subject: ${session.worksheetSubjectLabel}.\n`;
        }
      }
      const homeworkCompanionSystemPrompt = isDebugClaude()
        ? sessionPrompt
        : prependDebugClaudeDeveloperBlock(sessionPrompt);
      sessionSystemPromptSnapshot = homeworkCompanionSystemPrompt;
      session.companion = {
        ...session.companion,
        systemPrompt: homeworkCompanionSystemPrompt,
      };
      console.log(`  ✅ Session prompt ready (${sessionPrompt.length} chars)`);
      session.isSpellingSession =
        !session.worksheetMode &&
        (subject === "spelling" || subject === "homework");
      if (session.isSpellingSession) {
        console.log("  📝 Spelling session mode active");
      }
      console.log(`  📚 Subject mode: ${subject}`);
    } else {
      session.send("loading_status", { message: "Starting free session..." });
      const freeSessionPrompt = isDebugClaude()
        ? buildDebugPrompt(
            homeworkChild,
            session.companion.name,
            generateCanvasCapabilitiesManifest(),
            generateToolDocs(),
          )
        : buildDiagPrompt(homeworkChild, session.companion.markdownPath, {
            carePlan: null,
          });
      const freeCompanionSystemPrompt = isDebugClaude()
        ? freeSessionPrompt
        : prependDebugClaudeDeveloperBlock(freeSessionPrompt);
      sessionSystemPromptSnapshot = freeCompanionSystemPrompt;
      session.companion = {
        ...session.companion,
        systemPrompt: freeCompanionSystemPrompt,
      };
      console.log(`  ✅ Session prompt ready (${freeSessionPrompt.length} chars)`);
      console.log(`  📚 Subject mode: ${subject}`);
    }

    // ── Resolve session type and create canonical SessionContext ──
    const hasHomeworkManifest = session.worksheetMode;
    const hasSpellingWords = session.spellingHomeworkWordsByNorm.length > 0;
    const sessionType = resolveSessionType({
      childName: session.childName,
      hasHomeworkManifest,
      hasSpellingWords,
      explicitType: sessionTypeFromSubject(subject),
    });
    session.ctx = createSessionContext({
      childName: session.childName,
      sessionType,
      companionName: session.companion.name,
      assignment: session.assignmentManifest
        ? {
            childName: session.childName,
            title: session.assignmentManifest.title,
            source: session.assignmentManifest.source,
            createdAt: session.assignmentManifest.createdAt,
            questions: session.assignmentManifest.problems.map(
              (problem, index) => ({
                index,
                text: problem.prompt,
                answerType:
                  problem.gradingMode === "choice"
                    ? "multiple_choice"
                    : "numeric",
                correctAnswer: "",
                options:
                  problem.gradingMode === "choice"
                    ? problem.overlayFields[0]?.options
                    : undefined,
              }),
            ),
          }
        : undefined,
    });
    if (session.ctx && isDebugClaude() && sessionType === "worksheet") {
      session.ctx.canvas.owner = "claude" as CanvasOwner;
      session.ctx.canvas.locked = false;
    }
    if (session.worksheetSession && session.ctx) {
      session.ctx.availableToolNames = [...CANONICAL_AGENT_TOOL_KEYS];
    }
    console.log(
      `  📋 Session type: ${sessionType}, canvas owner: ${session.ctx.canvas.owner}`,
    );

    if (
      session.isSpellingSession &&
      (subject === "spelling" || subject === "homework") &&
      !session.worksheetMode &&
      (sessionType === "spelling" || sessionType === "homework")
    ) {
      const childId = session.childName.toLowerCase();
      const engineMode = subject === "homework" ? "homework" : "spelling";
      let enginePlan = planSession(childId, engineMode);
      const selected =
        enginePlan.reviewWords.length + enginePlan.newWords.length;
      if (selected === 0 && session.spellingHomeworkWordsByNorm.length > 0) {
        enginePlan = planSession(childId, engineMode, {
          homeworkFallbackWords: session.spellingHomeworkWordsByNorm,
        });
      }
      session.ctx.enginePlan = enginePlan;
    }

    if (sessionType === "reading" && subject === "reading" && session.ctx) {
      const childId = session.childName.toLowerCase();
      const enginePlan = planSession(childId, "reading");
      session.ctx.enginePlan = enginePlan;
      console.log(
        `  🎮 [engine] reading session plan — focusWords: ${enginePlan.focusWords.length ? enginePlan.focusWords.join(", ") : "none"}`,
      );
    }

    if (subject === "diag") {
      const diagVoice = process.env.ELEVENLABS_VOICE_ID_DIAG?.trim();
      session.companion = {
        ...session.companion,
        voiceId:
          diagVoice ||
          CHARLOTTE_DIAG_DEFAULT_VOICE_ID ||
          session.companion.voiceId,
        openingLine: "",
      };
      console.log(
        "  🎮 [diag] voice: ELEVENLABS_VOICE_ID_DIAG → Charlotte premade (diag-only) → companion default",
      );
    }

    applyDebugClaudeOpeningLineForSession(session);

    if (
      process.env.SUNNY_STATELESS === "true" &&
      normalizeSessionSubject(process.env.SUNNY_SUBJECT) === "homework"
    ) {
      session.companion = {
        ...session.companion,
        openingLine:
          `Hi! I'm here with ${getTtsNameForChildId(String(homeworkChild))} on the homework map — ` +
          "I'll chat and cheer them on as we try things. Progress won't be saved to their profile in this preview run.",
      };
    }

    if (process.env.SUNNY_PREVIEW_MODE?.trim() === "go-live") {
      const childDisplay =
        typeof session.sessionTtsLabel === "string" && session.sessionTtsLabel.trim().length > 0
          ? session.sessionTtsLabel
          : "the child";
      const parentPrefix = `
PARENT REVIEW MODE — CRITICAL:
You are speaking with the PARENT or DEVELOPER.
NOT the child. The child is not present.

Adjust your behavior:
- Speak as a professional, not as a child's companion
- When asked "what would you say to the child?"
  → demonstrate what you would say, don't just explain
- When asked "show me the wink" → do the emote
- When asked about a word → explain your pedagogical
  reasoning, not just the answer
- You can break character to explain your logic
- If asked "why did you choose that?" → tell them
- Full transparency mode — no secrets from parents

You still have all your tools and capabilities.
TTS is on. STT is on. Games are fully functional.
Nothing is recorded to the child's profile.
This is a safe space to test everything.
`;
      session.companion = {
        ...session.companion,
        systemPrompt: parentPrefix + sessionSystemPromptSnapshot,
        openingLine:
          `Hi — parent review mode active. ` +
          `I'm fully operational so you can experience ` +
          `exactly what ${childDisplay} ` +
          `will see. Nothing is recorded. ` +
          `Ask me anything or just play through the nodes.`,
      };
    }

    if (
      sessionLearningProfile?.pendingHomework?.nodes?.length &&
      (subject === "homework" || subject === "spelling")
    ) {
      const mapBlock = buildMapSummaryFromPendingNodes(
        activeMapState?.nodes ?? sessionLearningProfile.pendingHomework.nodes,
      );
      if (mapBlock) {
        session.companion.systemPrompt +=
          `\n\n## Today's map\n${mapBlock}\n\n${MAP_SUMMARY_NATURAL_USE_INSTRUCTION}`;
      }
    }

    session.send("session_started", {
      child: session.childName,
      childName: session.childName,
      companion: session.companion.name,
      companionName: session.companion.name,
      emoji: session.companion.emoji,
      voiceId: session.companion.voiceId,
      openingLine: session.companion.openingLine,
      goodbye: session.companion.goodbye,
      debugBrowserTts: process.env.DEBUG_BROWSER_TTS === "true",
      debugMode: isDebugClaude(),
      diagKiosk: session.diagKioskFast,
    });
    try {
      const progression = computeProgression(childIdFromName(session.childName));
      session.send("progression", { ...progression } as Record<string, unknown>);
      console.log(
        `  🎮 [engine] progression: level ${progression.level}, ` +
          `${progression.totalXP} XP, ${progression.wordsMastered} words mastered`,
      );
    } catch (err) {
      console.error("[engine] progression failed:", err);
    }
    session.broadcastContext();

    // Explicit blank-canvas signal at session start — the server owns canvas
    // state, so we always declare the initial state rather than relying on
    // the frontend's initial value.
    session.currentCanvasState = null;
    session.clearActiveCanvasActivity();
    session.send("canvas_draw", { mode: "idle" });

    session.clearSessionTimer = startMaxDurationTimer(session.childName, () => {
      console.log(
        `  ⏰ Session timeout reached (${Math.round((Date.now() - session.sessionStartTime) / 60000)} min wall)`,
      );
      void session.end().catch((err) => {
        console.error("  🔴 [session-end] timeout finalizer failed:", err);
      });
    });

    resetMathProbeSession(session.childName);
    resetSessionStart();
    resetTransitionToWork();
    if (session.worksheetMode) {
      session.isSpellingSession = false;
    }
    session.sessionStartedToolCalled = false;
    session.transitionedToWork = false;

    if (!session.options?.silentTts && !session.options?.sttOnly) {
      session.ttsBridge = new WsTtsBridge(session.ws, session.companion.voiceId);
      await session.ttsBridge.prime();
    }

    await session.connectDeepgram();
    session.send("session_boot_ready", {
      ttsPrimed: !session.options?.silentTts && !session.options?.sttOnly,
      deepgramConnected: true,
    });

    if (subject === "diag") {
      if (!session.options?.sttOnly) {
        const sessionTime = formatDateTimeEastern();
        await session.handleEndOfTurn(
          `[Session started at: ${sessionTime}]\n\n` +
            "[Session start — diagnostics] The current time is above. " +
            "dateTime has already been resolved for this session — do not call the dateTime tool unless the creator/developer explicitly asks for the time or date again.\n\n" +
            "At most two short sentences: (1) greet the creator/developer using the time of day naturally, (2) ask who is with them. " +
            "Stop — do not list capabilities or adventure map modes unless he asks.",
          true,
        );
      }
    } else {
      const openingLine = session.companion.openingLine.trim();
      if (openingLine) {
        await session.handleCompanionTurn(openingLine);
      } else if (
        (subject === "homework" || subject === "spelling") &&
        sessionLearningProfile?.pendingHomework
      ) {
        console.log(
          "  🎮 [session-bootstrap] [context-start] homework opener requested",
        );
        await session.handleEndOfTurn(
          buildHomeworkSessionStartPrompt({
            childName: String(homeworkChild),
            pendingHomework: sessionLearningProfile.pendingHomework,
            activeMapFirstNode: resolveHomeworkOpenerFirstNode({
              childId: String(homeworkChild).toLowerCase(),
              activeMapFirstNode: activeMapState?.nodes?.[0] ?? null,
            }),
          }),
          true,
        );
      } else {
        console.log("  🎮 [session-bootstrap] [opening-line] skipped");
      }
    }

    if (session.diagKioskFast && session.childName === "creator") {
      hooks.registerCreatorDiagReadingSession?.(session);
      session.send("diag_game_session_ready", { childId: "creator" });
      console.log(
        "  📖 [diag] creator voice session registered for test-reading-mode",
      );
    }
}
