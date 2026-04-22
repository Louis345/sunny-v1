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
  buildSessionPrompt,
  extractWordsFromHomework,
  normalizeSessionSubject,
} from "../agents/prompts";
import { loadHomeworkPayload } from "../utils/loadHomeworkFolder";
import { getReadingCanvasPreferencesForChild } from "../utils/learningProfileIO";
import { classifyAndRoute } from "../agents/classifier/classifier";
import {
  extractHomeworkProblems,
  type HomeworkExtractionResult,
} from "../agents/psychologist/psychologist";
import { childIdFromName } from "../engine/learningEngine";
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
  isHomeworkMode,
} from "../utils/runtimeMode";
import {
  applyDebugClaudeOpeningLineForSession,
  prependDebugClaudeDeveloperBlock,
} from "./debug-helpers";
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

export async function runSessionStart(
  session: any,
  hooks: SessionStartHooks = {},
): Promise<void> {
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

    const envSubject = normalizeSessionSubject(process.env.SUNNY_SUBJECT);
    const subject =
      (session.diagKioskFast || getSunnyMode() === "diag") ? "diag" : envSubject;

    const detectedChild = session.childName;
    const homeworkChild = session.diagKioskFast
      ? session.childName
      : (parseSunnyChildEnv() ?? detectedChild ?? "Ila");
    console.log(`  👤 Child override: ${homeworkChild}`);

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

      // Folder-based homework — load in demo too when a folder exists (worksheet + vision)
      homeworkPayload = await loadHomeworkPayload(homeworkChild);
    } else {
      console.log(
        "  ⚡ [diag-kiosk] fast path — no classifier, no homework folder, no extraction",
      );
    }

    if (isHomeworkMode() && homeworkPayload) {
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

      session.companion = {
        ...session.companion,
        systemPrompt: prependDebugClaudeDeveloperBlock(
          HOMEWORK_MODE_PROMPT(
            session.childName,
            session.companion.name,
            extraction.subject,
          ),
        ),
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
            "",
            [],
            "diag",
            { carePlan: null },
          );
      session.companion = {
        ...session.companion,
        systemPrompt: isDebugClaude()
          ? sessionPrompt
          : prependDebugClaudeDeveloperBlock(sessionPrompt),
      };
      session.isSpellingSession = false;
      console.log(`  ✅ Session prompt ready (${sessionPrompt.length} chars)`);
      console.log(`  📚 Subject mode: ${subject}`);
    } else if (isDemoMode() && !homeworkPayload) {
      session.companion = {
        ...session.companion,
        systemPrompt: prependDebugClaudeDeveloperBlock(
          DEMO_MODE_PROMPT(session.childName, session.companion.name),
        ),
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

      let extraction: HomeworkExtractionResult = {
        subject: "",
        problems: [],
      };

      // Try loading from cache first
      let loadedFromCache = false;
      if (fs.existsSync(cacheFile)) {
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

      if (!loadedFromCache) {
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

      console.log("  🧠 Psychologist building session prompt...");
      const extractSpellingWords =
        !session.worksheetMode &&
        (subject === "spelling" || subject === "homework");
      const wordList =
        session.worksheetMode || !extractSpellingWords
          ? []
          : extractWordsFromHomework(homeworkPayload.rawContent);
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

      let sessionPrompt: string;
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
      session.companion = {
        ...session.companion,
        systemPrompt: isDebugClaude()
          ? sessionPrompt
          : prependDebugClaudeDeveloperBlock(sessionPrompt),
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
      subject === "spelling" &&
      !session.worksheetMode &&
      sessionType === "spelling"
    ) {
      const childId = session.childName.toLowerCase();
      let enginePlan = planSession(childId, "spelling");
      const selected =
        enginePlan.reviewWords.length + enginePlan.newWords.length;
      if (selected === 0 && session.spellingHomeworkWordsByNorm.length > 0) {
        enginePlan = planSession(childId, "spelling", {
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
          `Hi — reviewing ${getTtsNameForChildId(String(homeworkChild))}'s homework session. ` +
          "Click any node to preview. Nothing will be recorded.",
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
        systemPrompt: parentPrefix + session.companion.systemPrompt,
        openingLine:
          `Hi — parent review mode active. ` +
          `I'm fully operational so you can experience ` +
          `exactly what ${childDisplay} ` +
          `will see. Nothing is recorded. ` +
          `Ask me anything or just play through the nodes.`,
      };
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
      session.end();
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

    if (subject === "diag") {
      if (!session.options?.sttOnly) {
        const sessionTime = formatDateTimeEastern();
        await session.handleEndOfTurn(
          `[Session started at: ${sessionTime}]\n\n` +
            "[Session start — diagnostics] The current time is above. " +
            "dateTime has already been resolved for this session — do not call the dateTime tool unless Jamal explicitly asks for the time or date again.\n\n" +
            "At most two short sentences: (1) greet Jamal as your creator using the time of day naturally, (2) ask who is with him. " +
            "Stop — do not list capabilities or canvas modes unless he asks.",
          true,
        );
      }
    } else {
      await session.handleCompanionTurn(session.companion.openingLine);
    }

    if (session.diagKioskFast && session.childName === "creator") {
      hooks.registerCreatorDiagReadingSession?.(session);
      console.log(
        "  📖 [diag] creator voice session registered for test-reading-mode",
      );
    }
}
