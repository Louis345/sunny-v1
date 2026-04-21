/**
 * Six-tool host implementations — `session` is SessionManager.
 * Extracted from SessionManager for line-count / cohesion (D6d).
 */
// @ts-nocheck
import { generateStoryImage } from "../utils/generateStoryImage";
import { appendDeferredActivity } from "../utils/appendToContext";
import { auditLog } from "./audit-log";
import { childIdFromName, recordAttempt } from "../engine/learningEngine";
import { computeQualityFromAttempt } from "../algorithms/spacedRepetition";
import type { AttemptInput, ScaffoldLevel } from "../algorithms/types";
import { appendAttemptLine } from "../utils/attempts";
import { getReward } from "./games/registry";
import * as gev from "./game-event-handler";

export async function hostCanvasShow(
  session: any,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    if (session.storyImagePending) {
      return {
        dispatched: false,
        canvasShowing: "idle",
        message:
          "Story image is rendering. Wait for the image to appear before calling canvasShow again.",
      };
    }
    const type = String(args.type ?? "");
    if (type === "karaoke" && session.shouldBlockKaraokeCanvasRefresh()) {
      return {
        ok: false,
        dispatched: false,
        canvasShowing: "karaoke",
        message:
          "Reading in progress. Do not call canvasShow during active reading. Wait for reading_progress event=complete.",
      };
    }
    if (type === "worksheet" && session.worksheetSession) {
      const pid = String(args.problemId ?? "");
      const res = session.worksheetSession.showProblemById(pid);
      return {
        dispatched: res.ok === true,
        canvasShowing: "worksheet",
        ...res,
      };
    }
    if (type === "text") {
      return { dispatched: true, canvasShowing: "text" };
    }
    if (type === "svg") {
      return { dispatched: true, canvasShowing: "svg" };
    }
    if (type === "game") {
      return { dispatched: true, canvasShowing: "game", name: args.name };
    }
    if (type === "place_value") {
      return { dispatched: true, canvasShowing: "place_value" };
    }
    if (type === "spelling") {
      const w = String(args.spellingWord ?? args.word ?? "").trim();
      if (!w) {
        return {
          dispatched: false,
          canvasShowing: "idle",
          reason: "empty_word",
        };
      }
      if (!session.spellingHomeworkGate.allows(w)) {
        return {
          dispatched: false,
          canvasShowing: "idle",
          reason: "not_on_homework_list",
          message: session.spellingHomeworkGate.explainReject(w),
        };
      }
      return { dispatched: true, canvasShowing: "spelling" };
    }
    if (type === "riddle") {
      return { dispatched: true, canvasShowing: "riddle" };
    }
    if (type === "math_inline") {
      return { dispatched: true, canvasShowing: "text" };
    }
    if (type === "svg_raw") {
      return { dispatched: true, canvasShowing: "svg" };
    }
    if (type === "reward") {
      return { dispatched: true, canvasShowing: "reward" };
    }
    if (type === "championship") {
      return { dispatched: true, canvasShowing: "championship" };
    }
    if (type === "blackboard") {
      return { dispatched: true, canvasShowing: "blackboard" };
    }
    if (type === "karaoke") {
      return { dispatched: true, canvasShowing: "karaoke" };
    }
    if (type === "sound_box") {
      return { dispatched: true, canvasShowing: "sound_box" };
    }
    if (type === "clock") {
      return { dispatched: true, canvasShowing: "clock" };
    }
    if (type === "score_meter") {
      return { dispatched: true, canvasShowing: "score_meter" };
    }
    return { dispatched: false, canvasShowing: "idle" };
  }

export async function hostCanvasClear(session: any): Promise<{
    canvasShowing: "idle";
    ok?: boolean;
  }> {
    session.turnSM.clearPendingTranscript("canvasClear");
    if (session.worksheetSession) {
      return session.worksheetSession.clearCanvas();
    }
    return { canvasShowing: "idle", ok: true };
  }

export async function hostCanvasStatus(session: any): Promise<Record<string, unknown>> {
    return {
      mode: session.ctx?.canvas.current.mode ?? "idle",
      revision: session.ctx?.canvas.revision ?? 0,
      browserVisible: session.ctx?.canvas.browserVisible ?? false,
    };
  }

export async function hostSessionLog(
  session: any,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const action = String(args.action ?? "").trim();
    if (action === "generate_image") {
      const scene = String(
        args.observation ?? args.scene ?? args.childSaid ?? "",
      ).trim();
      if (!scene) {
        return { logged: false, error: "generate_image_requires_observation" };
      }
      console.log(
        `  🎮 [story-image] explicit request via sessionLog scene="${scene.slice(0, 120)}${scene.length > 120 ? "…" : ""}"`,
      );
      session.storyImagePending = true;
      session.send("story_image_loading", {});
      void generateStoryImage(scene, { useDirectScene: true })
        .then((url) => {
          session.send("story_image", { url: url ?? null });
        })
        .catch(() => {
          session.send("story_image", { url: null });
        })
        .finally(() => {
          session.storyImagePending = false;
        });
      return { logged: true, imageGeneration: "queued" };
    }

    if (args.skipped === true) {
      const reason = String(args.reason ?? "").trim();
      if (!reason) {
        return { logged: false, error: "reason_required_when_skipped" };
      }
      const activityRaw =
        (args.activity as string | undefined)?.trim() ||
        (args.observation as string | undefined)?.trim() ||
        (args.word as string | undefined)?.trim() ||
        "";
      const activity = activityRaw || "Activity";
      await appendDeferredActivity(session.childName, activity, reason);
      return { logged: true, deferred: true };
    }

    if (session.worksheetSession) {
      const wp = session.worksheetProblems[session.worksheetProblemIndex];
      if (!wp) {
        auditLog("worksheet", {
          action: "sessionLog_reject",
          error: "no_active_problem",
          childName: session.childName,
          round: session.roundNumber,
        });
        return { logged: false, error: "no_active_problem" };
      }
      const res = session.worksheetSession.submitAnswer({
        problemId: String(wp.id),
        correct: args.correct === true,
        childSaid: String(args.childSaid ?? ""),
      });
      return { logged: res.ok === true, ...res };
    }
    session.emitRewardAttempt(args.correct === true);

    const loggedWordKey =
      (args.word as string | undefined)?.toLowerCase().trim() ?? "";
    if (loggedWordKey) {
      const domain =
        session.ctx?.sessionType === "reading" ? "reading" : "spelling";
      const scaffoldLevel = (
        typeof args.scaffoldLevel === "number" ? args.scaffoldLevel : 0
      ) as ScaffoldLevel;
      const attempt: AttemptInput = {
        word: loggedWordKey,
        domain,
        correct: args.correct === true,
        quality: computeQualityFromAttempt({
          word: loggedWordKey,
          domain,
          correct: args.correct === true,
          quality: 0,
          scaffoldLevel,
        }),
        scaffoldLevel,
      };
      try {
        recordAttempt(childIdFromName(session.childName), attempt);
        console.log(
          `  🎮 [engine] recordAttempt: "${loggedWordKey}" ${args.correct ? "correct" : "incorrect"} (${domain})`,
        );
      } catch (err) {
        console.error("  [engine] recordAttempt failed:", err);
      }
      appendAttemptLine(session.childName, {
        word: loggedWordKey,
        correct: args.correct === true,
      });

      const scaffoldState =
        session.wordScaffoldState.get(loggedWordKey) ?? {
          word: loggedWordKey,
          domain,
          lastCorrect: null,
          lastScaffoldLevel: 0 as ScaffoldLevel,
          attemptCount: 0,
        };
      scaffoldState.lastCorrect = args.correct === true;
      scaffoldState.lastScaffoldLevel = scaffoldLevel;
      scaffoldState.attemptCount++;
      session.wordScaffoldState.set(loggedWordKey, scaffoldState);

      const count = (session.wordAttemptCounts.get(loggedWordKey) ?? 0) + 1;
      session.wordAttemptCounts.set(loggedWordKey, count);
      const correct = args.correct === true;
      const lastAttempt =
        session.lastTranscript?.trim() ||
        String(args.childSaid ?? "").trim() ||
        "unknown";
      session.activeWordContext =
        `[Active word: "${loggedWordKey}". ` +
        `Attempts this word: ${count}. ` +
        `Last attempt: "${lastAttempt}" — ` +
        `${correct ? "correct" : "incorrect"}.]`;
      console.log(`  📌 activeWordContext: ${session.activeWordContext}`);

      if (session.companion.tracksActiveWord && session.activeWord) {
        const active = session.activeWord.toLowerCase().trim();
        if (loggedWordKey !== active) {
          console.warn(
            `  ⚠️  activeWord mismatch: canvas="${active}" sessionLog.word="${loggedWordKey}"`,
          );
        }
      }

      if (
        session.spellingHomeworkWordsByNorm.length > 0 &&
        !session.spaceInvadersRewardLaunched
      ) {
        if (session.spellingHomeworkWordsByNorm.includes(loggedWordKey)) {
          session.spellingWordsWithAttempt.add(loggedWordKey);
        }
        if (
          session.spellingWordsWithAttempt.size >=
          session.spellingHomeworkWordsByNorm.length
        ) {
          session.spaceInvadersRewardLaunched = true;
          session.spaceInvadersRewardActive = true;
          const inv = getReward("space-invaders");
          if (inv) {
            session.send("canvas_draw", {
              mode: "space-invaders",
              gameUrl: inv.url,
              gamePlayerName: session.childName,
              rewardGameConfig: { ...inv.defaultConfig },
            });
          }
          session.gameBridge.launchByName(
            "space-invaders",
            "reward",
            session.childName,
          );
          session.currentCanvasState = {
            mode: "space-invaders",
            gameUrl: inv?.url,
            gamePlayerName: session.childName,
          };
          session.setActiveCanvasActivity("reward-game");
          session.gameBridge.onComplete = () => {
            session.clearActiveCanvasActivity();
            session.send("canvas_draw", { mode: "idle" });
            session.send("session_ended", {
              summary: "Session complete.",
              duration_ms: Date.now() - session.sessionStartTime,
            });
          };
        }
      }

      const wbNorm = session.wbWord.toLowerCase().trim();
      if (session.wbAwaitingSpell && loggedWordKey === wbNorm) {
        session.wbAwaitingSpell = false;
        gev.wbEndCleanup(session);
      }
    }

    return { logged: true };
  }

export async function hostSessionStatus(session: any): Promise<Record<string, unknown>> {
    if (session.worksheetSession) {
      return {
        ...(session.worksheetSession.getSessionStatus() as object),
      } as Record<string, unknown>;
    }
    const base = { ...(session.ctx?.serialize() ?? { ok: true }) } as Record<
      string,
      unknown
    >;
    return {
      ...base,
      turnState: session.turnSM.getState(),
      activeWord: session.activeWord,
      wordBuilderRound: session.wbActive && session.wbRound > 0 ? session.wbRound : null,
      lastChildUtterance: session.lastTranscript || null,
    };
  }

export async function hostSessionEnd(
  session: any,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    return { ended: true, childName: args.childName };
  }
