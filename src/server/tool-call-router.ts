/** Tool routing — `session` is SessionManager. */
// @ts-nocheck — extracted from SessionManager; structural typing via `any`.
import { unwrapToolResult } from "./unwrapToolResult";
import * as gev from "./game-event-handler";
import { auditLog } from "./audit-log";
import { resolveLaunchGameRequest } from "./games/resolveLaunchGameRequest";
import { getReward, getTool, type GameDefinition } from "./games/registry";
import { WB_ALREADY_ACTIVE, SC_ALREADY_ACTIVE } from "../agents/elli/tools/launchGame";
import { clearEarnedReward, saveEarnedReward } from "./worksheet-tools";
import { resumeAssignmentProblem } from "./assignment-player";
import { shouldPersistSessionData } from "../utils/runtimeMode";
import { appendWorksheetAttemptLine } from "../utils/attempts";
import type { CanvasState } from "./session-context";

export function runHandleToolCall(
  session: any,
  tool: string,
  args: Record<string, unknown>,
  result: unknown,
): void {
    tool = session.normalizeToolName(tool);

    let launchGameResolvedEntry: GameDefinition | null = null;
    let launchGameCanonicalName: string | null = null;
    let canvasRevision: number | undefined;

    const bbGesture =
      tool === "blackboard"
        ? String(args.gesture ?? "")
        : tool === "canvasShow" && String(args.type) === "blackboard"
          ? String(args.gesture ?? "")
          : null;
    if (
      bbGesture &&
      session.turnSM.getState() === "WORD_BUILDER" &&
      bbGesture !== "clear" &&
      bbGesture !== "reveal"
    ) {
      console.warn(
        "  ⚠️  blackboard blocked during Word Builder — only clear and reveal allowed",
      );
      return;
    }

    if (tool === "launchGame") {
      const sessionLaunch = unwrapToolResult(result) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (
        session.worksheetSession &&
        sessionLaunch &&
        sessionLaunch.ok === false
      ) {
        console.warn(
          `  ⚠️  launchGame: worksheet session rejected — ${sessionLaunch.error ?? "unknown"}`,
        );
        return;
      }
      const rawName = String(args.name ?? "").trim();
      const gt = args.type;
      if (gt !== "tool" && gt !== "reward") {
        console.warn('  ⚠️  launchGame: type must be "tool" or "reward"');
        return;
      }
      const resolved = resolveLaunchGameRequest({
        name: rawName,
        type: gt,
      });
      if (!resolved.ok || !resolved.canonicalName) {
        console.warn(`  ⚠️  launchGame: unknown ${gt} game "${rawName}"`);
        session.sendLaunchGameRegistryError(tool, args, rawName);
        return;
      }
      const entry =
        gt === "tool"
          ? getTool(resolved.canonicalName)
          : getReward(resolved.canonicalName);
      if (!entry) {
        console.warn(
          `  ⚠️  launchGame: missing live registry entry "${resolved.canonicalName}"`,
        );
        session.sendLaunchGameRegistryError(tool, args, rawName);
        return;
      }
      launchGameResolvedEntry = entry;
      launchGameCanonicalName = resolved.canonicalName;
    }

    let wireToolResult: unknown = result;
    if (tool === "launchGame" && launchGameCanonicalName === "word-builder") {
      const out = unwrapToolResult(wireToolResult) as { ok?: boolean } | undefined;
      if (session.wordBuilderSessionActive && out?.ok === true) {
        auditLog("word_builder", {
          action: "wire_corrected",
          reason: "session_already_active",
          childName: session.childName,
        });
        wireToolResult = {
          ok: false,
          error: WB_ALREADY_ACTIVE,
          launched: false,
        };
      }
    }
    if (tool === "launchGame" && launchGameCanonicalName === "spell-check") {
      const out = unwrapToolResult(wireToolResult) as { ok?: boolean } | undefined;
      if (session.spellCheckSessionActive && out?.ok === true) {
        auditLog("spell_check", {
          action: "wire_corrected",
          reason: "session_already_active",
          childName: session.childName,
        });
        wireToolResult = {
          ok: false,
          error: SC_ALREADY_ACTIVE,
          launched: false,
        };
      }
    }

    session.toolCallsMadeThisTurn++;
    session.send("tool_call", {
      tool,
      args,
      result: wireToolResult,
      ...(canvasRevision ? { canvasRevision } : {}),
    });

    if (tool === "endSession" || tool === "sessionEnd") {
      session.send("session_ended", {});
      setTimeout(() => process.exit(0), 500);
    }

    if (tool === "startSession") {
      if (session.sessionStartedToolCalled) {
        console.warn("  ⚠️  Duplicate startSession tool call ignored");
        return;
      }
      session.sessionStartedToolCalled = true;
    }

    if (tool === "transitionToWork") {
      if (session.transitionedToWork) {
        console.warn("  ⚠️  Duplicate transitionToWork tool call ignored");
        return;
      }
      session.transitionedToWork = true;
    }

    if (tool === "launchGame" && launchGameCanonicalName === "word-builder") {
      session.wbToolExecuteClaimed = false;
      const wbRes = unwrapToolResult(wireToolResult) as {
        ok?: boolean;
        error?: string;
        word?: string;
      } | null;
      if (wbRes?.ok !== true) {
        auditLog("word_builder", {
          action: "rejected",
          error: String(wbRes?.error ?? "not_launched"),
          childName: session.childName,
        });
        console.warn(
          `  ⚠️  launchGame(word-builder) rejected — ${String(wbRes?.error ?? "not_launched")}`,
        );
        return;
      }
      session.pendingGameStart = null;
      const word = String(wbRes.word ?? args.word ?? "")
        .toLowerCase()
        .trim();
      if (word.length < 3) {
        console.warn("  ⚠️  launchGame(word-builder): word must be at least 3 letters");
        return;
      }
      if (!session.spellingHomeworkGate.allows(word)) {
        auditLog("word_builder", {
          action: "rejected",
          error: "not_on_homework_list",
          childName: session.childName,
        });
        console.warn(
          `  ⚠️  launchGame(word-builder) blocked — not on homework list: "${word}"`,
        );
        return;
      }
      // Server owns all round state from here
      session.wbWord = word;
      session.wbRound = 1;
      session.wbActive = true;
      session.wbLastProcessedRound = 0;
      session.pendingRoundComplete = null;
      session.activeWordBuilderWord = word;
      session.wordBuilderSessionActive = true;
      session.turnSM.onWordBuilderStart();
      console.log(`  🎮 Word-builder started — word: ${word}`);
      // Canvas onLoad posts round 1 "start" to the iframe — do not wbSendRound here.
      const wordBuilderCanvas = {
        mode: "word-builder",
        gameUrl: "/games/wordd-builder.html",
        gameWord: word,
        gamePlayerName: session.childName,
        wordBuilderRound: 1,
        wordBuilderMode: "fill_blanks",
      };
      const wordBuilderDraw = session.withCanvasRevision(wordBuilderCanvas);
      session.currentCanvasState = { ...wordBuilderDraw };
      if (session.ctx) {
        session.ctx.updateCanvas({
          mode: "word-builder",
          gameUrl: wordBuilderCanvas.gameUrl,
          gameWord: wordBuilderCanvas.gameWord,
          gamePlayerName: wordBuilderCanvas.gamePlayerName,
          content: undefined,
          label: undefined,
          svg: undefined,
          sceneDescription: undefined,
          problemAnswer: undefined,
          problemHint: undefined,
        });
        session.broadcastContext();
      }
      session.setActiveCanvasActivity("word-builder");
      session.send("canvas_draw", wordBuilderDraw);
      gev.armGameTtsGate(session, wordBuilderDraw.canvasRevision);
      return;
    }

    if (tool === "launchGame" && launchGameCanonicalName === "spell-check") {
      session.spellCheckToolExecuteClaimed = false;
      const scRes = unwrapToolResult(wireToolResult) as {
        ok?: boolean;
        error?: string;
        word?: string;
      } | null;
      if (scRes?.ok !== true) {
        auditLog("spell_check", {
          action: "rejected",
          error: String(scRes?.error ?? "not_launched"),
          childName: session.childName,
        });
        console.warn(
          `  ⚠️  launchGame(spell-check) rejected — ${String(scRes?.error ?? "not_launched")}`,
        );
        return;
      }
      session.pendingGameStart = null;
      const word = String(scRes.word ?? args.word ?? "")
        .toLowerCase()
        .trim();
      if (word.length < 2) {
        console.warn("  ⚠️  launchGame(spell-check): word must be at least 2 letters");
        return;
      }
      if (!session.spellingHomeworkGate.allows(word)) {
        auditLog("spell_check", {
          action: "rejected",
          error: "not_on_homework_list",
          childName: session.childName,
        });
        console.warn(
          `  ⚠️  launchGame(spell-check) blocked — not on homework list: "${word}"`,
        );
        return;
      }
      session.activeSpellCheckWord = word;
      session.spellCheckSessionActive = true;
      console.log(`  ⌨️  Spell-check typing game started — word: ${word}`);
      const spellCheckCanvas = {
        mode: "spell-check",
        gameUrl: "/games/spell-check.html",
        gameWord: word,
        gamePlayerName: session.childName,
      };
      const spellCheckDraw = session.withCanvasRevision(spellCheckCanvas);
      session.currentCanvasState = { ...spellCheckDraw };
      if (session.ctx) {
        session.ctx.updateCanvas({
          mode: "spell-check",
          gameUrl: spellCheckCanvas.gameUrl,
          gameWord: spellCheckCanvas.gameWord,
          gamePlayerName: spellCheckCanvas.gamePlayerName,
          content: undefined,
          label: undefined,
          svg: undefined,
          sceneDescription: undefined,
          problemAnswer: undefined,
          problemHint: undefined,
        });
        session.broadcastContext();
      }
      session.setActiveCanvasActivity("spell-check");
      session.send("canvas_draw", spellCheckDraw);
      gev.armGameTtsGate(session, spellCheckDraw.canvasRevision);
      return;
    }

    if (tool === "launchGame") {
      const gameName =
        launchGameCanonicalName ??
        String(args.name ?? "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-");
      const gt = args.type as "tool" | "reward";
      const worksheetResumeSnapshot =
        gt === "tool" && session.activeCanvasActivity.mode === "worksheet"
          ? session.captureActiveCanvasSnapshot()
          : null;

      if (session.turnSM.getState() === "WORD_BUILDER") {
        gev.wbEndCleanup(session);
        session.turnSM.onWordBuilderEnd();
      }

      const gameEntry = launchGameResolvedEntry;
      if (!gameEntry) {
        console.error(
          "  ❌ launchGame: invariant — missing resolved entry after validate",
        );
        return;
      }

      const canvasDraw: Record<string, unknown> = {
        mode: gameName,
        gameUrl: gameEntry.url,
        gamePlayerName: session.childName,
        gameCompanionName: session.companion.name,
      };
      if (gt === "reward") {
        canvasDraw.rewardGameConfig = { ...gameEntry.defaultConfig };
        session.spaceInvadersRewardActive = true;
      }
      const revisedCanvasDraw = session.withCanvasRevision(canvasDraw);
      session.send("canvas_draw", revisedCanvasDraw);

      const launchConfig: Record<string, unknown> = {
        ...gameEntry.defaultConfig,
      };
      if (typeof args.hour === "number" && Number.isFinite(args.hour)) {
        launchConfig.hour = args.hour;
      }
      if (typeof args.minute === "number" && Number.isFinite(args.minute)) {
        launchConfig.minute = args.minute;
      }

      if (gameName === "store-game") {
        console.log(
          `  🎮 [store-game] using built-in item pool from game config (no worksheet-derived amounts)`,
        );
      }

      session.pendingGameStart = {
        gameUrl: gameEntry.url,
        childName: session.childName,
        companionName: session.companion.name,
        config: launchConfig,
      };
      session.gameBridge.launchByName(
        gameName,
        gt,
        session.childName,
        launchConfig,
        session.companion.name,
      );
      if (session.worksheetSession && gt === "reward") {
        clearEarnedReward(session.childName);
      }
      console.log(`  🎮 launchGame — ${gameName} (${gt})`);
      session.currentCanvasState = { ...revisedCanvasDraw };
      if (session.ctx) {
        session.ctx.updateCanvas({
          mode: gameName as any,
          gameUrl: gameEntry.url,
          gamePlayerName: session.childName,
          rewardGameConfig:
            gt === "reward" ? { ...gameEntry.defaultConfig } : undefined,
          content: undefined,
          label: undefined,
          svg: undefined,
          sceneDescription: undefined,
          problemAnswer: undefined,
          problemHint: undefined,
        });
        session.broadcastContext();
      }
      session.setActiveCanvasActivity("reward-game", {
        resumable: worksheetResumeSnapshot != null,
        reason:
          worksheetResumeSnapshot != null
            ? "worksheet_instructional_game"
            : undefined,
        snapshot: worksheetResumeSnapshot,
      });
      gev.armGameTtsGate(session, revisedCanvasDraw.canvasRevision);
      return;
    }

    if (
      tool === "getNextProblem" ||
      (tool === "canvasShow" && String(args.type) === "worksheet")
    ) {
      const res = unwrapToolResult(result) as {
        ok?: boolean;
        canvasRendered?: boolean;
        problemId?: string;
      };
      if (
        res?.ok &&
        res?.canvasRendered &&
        res.problemId &&
        session.assignmentManifest &&
        session.worksheetPlayerState
      ) {
        const problemId = res.problemId;
        const problem = session.worksheetProblems.find(
          (p) => String(p.id) === problemId,
        );
        const idx = session.worksheetProblems.findIndex(
          (p) => String(p.id) === problemId,
        );
        if (idx >= 0) {
          session.worksheetProblemIndex = idx;
          if (session.ctx?.assignment) {
            session.ctx.assignment.currentIndex = idx;
          }
        }
        const assignmentProblem = session.assignmentManifest.problems.find(
          (entry) => entry.problemId === problemId,
        );
        if (problem && assignmentProblem) {
          session.turnSM.clearPendingTranscript("new worksheet problem");
          session.worksheetPlayerState = resumeAssignmentProblem(
            session.assignmentManifest,
            {
              activeProblemId: problemId,
              currentPage: session.worksheetPlayerState.currentPage ?? 1,
              activeFieldId: session.worksheetPlayerState.activeFieldId,
              interactionMode:
                session.worksheetPlayerState.interactionMode ??
                session.worksheetInteractionMode,
            },
          );
          const worksheetPdfDraw = session.withCanvasRevision({
            mode: "worksheet_pdf",
            content: problem.question,
            pdfAssetUrl: session.assignmentManifest.pdfAssetUrl,
            pdfPage: assignmentProblem.page,
            pdfPageWidth:
              session.assignmentManifest.pages.find(
                (pg) => pg.page === assignmentProblem.page,
              )?.width ?? 1000,
            pdfPageHeight:
              session.assignmentManifest.pages.find(
                (pg) => pg.page === assignmentProblem.page,
              )?.height ?? 1400,
            activeProblemId: session.worksheetPlayerState.activeProblemId,
            activeFieldId: session.worksheetPlayerState.activeFieldId,
            overlayFields: session.worksheetPlayerState.overlayFields,
            interactionMode: session.worksheetPlayerState.interactionMode,
            problemHint: problem.hint.trim() || undefined,
          });
          session.currentCanvasState = { ...worksheetPdfDraw };
          session.setActiveCanvasActivity("worksheet");
          if (session.ctx) {
            session.ctx.updateCanvas({
              mode: "worksheet_pdf",
              content: problem.question,
              pdfAssetUrl: session.assignmentManifest.pdfAssetUrl,
              pdfPage: assignmentProblem.page,
              pdfPageWidth:
                session.assignmentManifest.pages.find(
                  (page) => page.page === assignmentProblem.page,
                )?.width ?? 1000,
              pdfPageHeight:
                session.assignmentManifest.pages.find(
                  (page) => page.page === assignmentProblem.page,
                )?.height ?? 1400,
              activeProblemId: session.worksheetPlayerState.activeProblemId,
              activeFieldId: session.worksheetPlayerState.activeFieldId,
              overlayFields: session.worksheetPlayerState.overlayFields,
              interactionMode: session.worksheetPlayerState.interactionMode,
              problemHint: problem.hint.trim() || undefined,
              sceneDescription:
                "The child sees the exact worksheet page with a server-owned answer box overlay.",
            });
            session.broadcastContext();
          }
          session.send("canvas_draw", worksheetPdfDraw);
          console.log(
            `  🖼️  [worksheet] Canvas rendered for problem ${problemId} (Option C)`,
          );
        }
      }
      return;
    }

    if (
      tool === "submitAnswer" ||
      (tool === "sessionLog" && session.worksheetSession)
    ) {
      if (tool === "sessionLog" && session.worksheetSession) {
        const wp = session.worksheetProblems[session.worksheetProblemIndex];
        if (wp) {
          args = {
            ...args,
            problemId: String(wp.id),
            childSaid: String(args.childSaid ?? ""),
            correct: args.correct === true,
          };
        }
      }
      const res = unwrapToolResult(result) as {
        ok?: boolean;
        rewardEarned?: boolean;
        rewardGame?: string;
      };
      if (res?.ok) {
        const problemId = String(args.problemId ?? "");
        const idx = session.worksheetProblems.findIndex(
          (p) => String(p.id) === problemId,
        );
        const correct = args.correct === true;
        if (idx >= 0) {
          session.worksheetProblemIndex = idx;
          if (session.ctx?.assignment) {
            session.ctx.assignment.currentIndex = idx;
          }
          session.emitRewardAttempt(correct);
          session.recordWorksheetAttempt(String(args.childSaid ?? ""), correct);
          if (shouldPersistSessionData()) {
            void appendWorksheetAttemptLine({
              childName: session.childName,
              problemId,
              correct,
            }).catch((e) =>
              console.warn(
                "  ⚠️  appendWorksheetAttemptLine failed:",
                e instanceof Error ? e.message : String(e),
              ),
            );
          }
          if (correct) {
            session.worksheetProblemIndex =
              idx + 1 < session.worksheetProblems.length ? idx + 1 : idx;
            if (session.ctx?.assignment) {
              session.ctx.assignment.currentIndex = session.worksheetProblemIndex;
            }
          }
        }
        if (res.rewardEarned && res.rewardGame) {
          saveEarnedReward(session.childName, res.rewardGame);
          console.log(`  🎁 Reward earned and saved: ${res.rewardGame}`);
        }
      }
      return;
    }

    if (tool === "clearCanvas" || tool === "canvasClear") {
      const res = unwrapToolResult(result) as { ok?: boolean };
      if (res && typeof res === "object" && res.ok === false) {
        return;
      }
      session.turnSM.clearPendingTranscript("canvas cleared");
      if (session.wbActive) {
        gev.wbEndCleanup(session);
        session.turnSM.onWordBuilderEnd();
        console.log("  🎮 canvasClear ended active Word Builder session");
      }
      session.currentCanvasState = null;
      if (session.ctx) {
        session.ctx.updateCanvas({ mode: "idle" });
        session.broadcastContext();
      }
      session.send("canvas_draw", { mode: "idle" });
      session.clearActiveCanvasActivity();
      console.log(`  🖼️  [worksheet] Canvas cleared by companion (Option C)`);
      return;
    }

    if (tool === "requestPauseForCheckIn") {
      void session.pauseActiveCanvasForCheckIn(
        String(args.reason ?? "checkin_request"),
      ).catch(console.error);
      return;
    }

    if (tool === "requestResumeActivity") {
      if (args.childConfirmedReady === true) {
        void session.resumeActiveCanvasActivity(false).catch(console.error);
      }
      return;
    }

    if (tool === "mathProblem" && args.childAnswer != null) {
      try {
        const raw = unwrapToolResult(result) as
          | Record<string, unknown>
          | string
          | undefined;
        const output =
          typeof raw === "string"
            ? raw
            : ((raw?.output as string | undefined) ?? raw);
        const parsed = typeof output === "string" ? JSON.parse(output) : output;
        const correct = (parsed as Record<string, unknown>)?.correct === true;
        session.emitRewardAttempt(correct);
      } catch {
        console.error("  ⚠️  Could not parse mathProblem result for reward");
      }
    }

    if (tool === "canvasShow") {
      if (session.storyImagePending) {
        console.log(
          "  🖼️  [canvas] canvasShow skipped in handleToolCall — story image pending",
        );
        return;
      }
      args = session.normalizeCanvasShowArgs(args);
      const ct = String(args.type ?? "");
      if (ct === "karaoke" && session.shouldBlockKaraokeCanvasRefresh()) {
        console.log(
          "  📖 [canvas] canvasShow karaoke skipped — reading in progress",
        );
        return;
      }
      const isWbGame =
        ct === "game" && String(args.name ?? "").trim() === "word-builder";
      if (!isWbGame && (session.wbActive || session.turnSM.getState() === "WORD_BUILDER")) {
        session.pendingGameStart = null;
        gev.wbEndCleanup(session);
        if (session.turnSM.getState() === "WORD_BUILDER") {
          session.turnSM.onWordBuilderEnd();
        }
        console.log("  🎮 Word Builder cleared by canvasShow switch");
      }
      if (ct === "text" || ct === "svg" || ct === "svg_raw") {
        session.pendingGameStart = null;
        const phonemeBoxes = args.phonemeBoxes as
          | CanvasState["phonemeBoxes"]
          | undefined;
        session.currentCanvasState = {
          mode: "teaching",
          content: args.content as string | undefined,
          svg: args.svg as string | undefined,
          label: args.label as string | undefined,
          phonemeBoxes,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "teaching",
            content: args.content as string | undefined,
            svg: args.svg as string | undefined,
            label: args.label as string | undefined,
            phonemeBoxes,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=${ct}`);
      } else if (ct === "place_value") {
        session.pendingGameStart = null;
        const placeValueData: Record<string, unknown> = {
          operandA: Number(args.operandA),
          operandB: Number(args.operandB),
          operation: args.operation,
          layout: args.layout ?? "column",
        };
        if (args.activeColumn != null) {
          placeValueData.activeColumn = args.activeColumn;
        }
        if (args.scaffoldLevel != null) {
          placeValueData.scaffoldLevel = args.scaffoldLevel;
        }
        if (args.revealedColumns != null) {
          placeValueData.revealedColumns = args.revealedColumns;
        }
        session.currentCanvasState = {
          mode: "place_value",
          placeValueData,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "place_value" as CanvasState["mode"],
            content: undefined,
            svg: undefined,
            label: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(
          `  🖼️  [canvas] canvasShow type=place_value a=${placeValueData.operandA} b=${placeValueData.operandB}`,
        );
      } else if (ct === "spelling") {
        session.pendingGameStart = null;
        const spellingWord = String(
          args.spellingWord ?? args.word ?? "",
        ).trim();
        if (!session.spellingHomeworkGate.allows(spellingWord)) {
          auditLog("canvas_show", {
            action: "spelling_rejected",
            word: spellingWord,
            childName: session.childName,
          });
          console.warn(
            `  🖼️  [canvas] canvasShow type=spelling rejected — not on list: ${spellingWord || "(empty)"}`,
          );
        } else {
        const nextState: Record<string, unknown> = {
          mode: "spelling",
          spellingWord,
        };
        if (args.spellingRevealed != null) {
          nextState.spellingRevealed = Array.isArray(args.spellingRevealed)
            ? [...(args.spellingRevealed as string[])]
            : args.spellingRevealed;
        }
        if (args.compoundBreak != null) {
          nextState.compoundBreak = args.compoundBreak;
        }
        if (args.showWord != null) {
          nextState.showWord = args.showWord;
        }
        if (args.streakCount != null) {
          nextState.streakCount = args.streakCount;
        }
        if (args.personalBest != null) {
          nextState.personalBest = args.personalBest;
        }
        session.currentCanvasState = nextState;
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "spelling" as CanvasState["mode"],
            content: spellingWord || undefined,
            svg: undefined,
            label: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(
          `  🖼️  [canvas] canvasShow type=spelling word=${spellingWord || "(empty)"}`,
        );
        }
      } else if (ct === "riddle") {
        session.pendingGameStart = null;
        session.currentCanvasState = {
          mode: "riddle",
          content: args.text as string | undefined,
          label: (args.label as string | undefined) ?? "Riddle",
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "riddle" as CanvasState["mode"],
            content: args.text as string | undefined,
            label: (args.label as string | undefined) ?? "Riddle",
            svg: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=riddle`);
      } else if (ct === "math_inline") {
        session.pendingGameStart = null;
        session.currentCanvasState = {
          mode: "teaching",
          content: args.expression as string | undefined,
          label: args.label as string | undefined,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "teaching",
            content: args.expression as string | undefined,
            label: args.label as string | undefined,
            svg: undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=math_inline`);
      } else if (ct === "reward") {
        session.pendingGameStart = null;
        session.currentCanvasState = {
          mode: "reward",
          content: "",
          label: args.label as string | undefined,
          svg: args.svg as string | undefined,
          lottieData: args.lottieData as Record<string, unknown> | undefined,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "reward" as CanvasState["mode"],
            content: "",
            label: args.label as string | undefined,
            svg: args.svg as string | undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=reward`);
      } else if (ct === "championship") {
        session.pendingGameStart = null;
        session.currentCanvasState = {
          mode: "championship",
          content: (args.content as string | undefined) ?? "",
          label: args.label as string | undefined,
          svg: args.svg as string | undefined,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "championship" as CanvasState["mode"],
            content: (args.content as string | undefined) ?? "",
            label: args.label as string | undefined,
            svg: args.svg as string | undefined,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=championship`);
      } else if (ct === "game") {
        session.pendingGameStart = null;
        const rawName = String(args.name ?? "").trim();
        const entry = getTool(rawName);
        if (entry) {
          const gameCanvas = {
            mode: rawName,
            gameUrl: entry.url,
            gameWord: args.gameWord,
            gamePlayerName: args.gamePlayerName,
          };
          const draw = session.withCanvasRevision(
            gameCanvas as Record<string, unknown>,
          );
          session.currentCanvasState = { ...draw };
          if (session.ctx) {
            session.ctx.updateCanvas({
              mode: rawName as CanvasState["mode"],
              gameUrl: entry.url,
              gameWord: args.gameWord as string | undefined,
              gamePlayerName: args.gamePlayerName as string | undefined,
              content: undefined,
              svg: undefined,
              label: undefined,
              sceneDescription: undefined,
              problemAnswer: undefined,
              problemHint: undefined,
            });
            session.broadcastContext();
          }
          session.clearActiveCanvasActivity();
          session.send("canvas_draw", draw);
          gev.armGameTtsGate(session, draw.canvasRevision);
          console.log(`  🖼️  [canvas] canvasShow type=game name=${rawName}`);
        } else {
          console.warn(
            `  ⚠️  canvasShow game: unknown teaching tool "${rawName}"`,
          );
        }
      } else if (ct === "blackboard") {
        session.send("blackboard", {
          gesture: String(args.gesture ?? "clear"),
          word: args.word as string | undefined,
          maskedWord: args.maskedWord as string | undefined,
          duration: args.duration as number | undefined,
        });
        console.log(`  🖼️  [canvas] canvasShow type=blackboard`);
      } else if (ct === "karaoke") {
        session.karaokeReadingComplete = false;
        session.readingProgressCompleteConsumed = false;
        session.pendingGameStart = null;
        const words = (args.words as string[]) ?? [];
        const st = args.storyText;
        if (typeof st === "string" && st.trim()) {
          const trimmed = st.trim();
          if (trimmed !== session.lastKaraokeStoryText) {
            session.storyImageGeneratedThisStory = false;
          }
          session.lastKaraokeStoryText = trimmed;
        }
        session.currentCanvasState = {
          mode: "karaoke",
          content: args.storyText as string,
          label: words.join(" "),
          karaokeWords: words,
          storyTitle:
            typeof args.storyTitle === "string" ? args.storyTitle : undefined,
          backgroundImageUrl:
            typeof args.backgroundImageUrl === "string"
              ? args.backgroundImageUrl
              : undefined,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "karaoke",
            content: args.storyText as string,
            label: words.join(" "),
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=karaoke`);
      } else if (ct === "pronunciation") {
        session.karaokeReadingComplete = false;
        session.readingProgressCompleteConsumed = false;
        session.pendingGameStart = null;
        const wlist = Array.isArray(args.pronunciationWords)
          ? (args.pronunciationWords as string[])
          : [];
        session.currentCanvasState = {
          mode: "pronunciation",
          pronunciationWords: wlist,
          backgroundImageUrl:
            typeof args.backgroundImageUrl === "string"
              ? args.backgroundImageUrl
              : undefined,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "pronunciation",
            content: wlist.join(" "),
            label: wlist.join(" "),
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=pronunciation`);
      } else if (ct === "sound_box") {
        session.pendingGameStart = null;
        const tw = String(args.targetWord ?? "");
        session.currentCanvasState = {
          mode: "sound_box",
          content: tw,
          label: JSON.stringify(args.phonemes ?? []),
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "sound_box",
            content: tw,
            label: JSON.stringify(args.phonemes ?? []),
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=sound_box`);
      } else if (ct === "clock") {
        session.pendingGameStart = null;
        const label = `${args.hour}:${String(args.minute).padStart(2, "0")} (${args.display})`;
        session.currentCanvasState = {
          mode: "clock",
          content: label,
          label,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "clock",
            content: label,
            label,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=clock`);
      } else if (ct === "score_meter") {
        session.pendingGameStart = null;
        const label = String(args.label ?? "");
        const content = `${args.score}/${args.max}`;
        session.currentCanvasState = {
          mode: "score_meter",
          content,
          label,
        };
        if (session.ctx) {
          session.ctx.updateCanvas({
            mode: "score_meter",
            content,
            label,
            sceneDescription: undefined,
            problemAnswer: undefined,
            problemHint: undefined,
          });
          session.broadcastContext();
        }
        session.clearActiveCanvasActivity();
        console.log(`  🖼️  [canvas] canvasShow type=score_meter`);
      }

      const legacy = session.showCanvasShapeFromCanvasShowArgs(args);
      if (legacy) {
        session.applyCompanionCanvasSurfaceSync(legacy);
      }
    }
}
