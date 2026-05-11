(function () {
  "use strict";

  function clampProgress(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function mergeArtifactConfig(defaultConfig, config) {
    var merged = Object.assign({}, defaultConfig, config || {});
    merged.mode = Object.assign({}, defaultConfig.mode || {}, merged.mode || {});
    merged.preview = Object.assign({}, defaultConfig.preview || {}, merged.preview || {});
    merged.narration = Object.assign(
      {},
      defaultConfig.narration || {},
      merged.narration || {},
    );
    merged.companionContext = Object.assign(
      {},
      defaultConfig.companionContext || {},
      merged.companionContext || {},
    );
    merged.chrome = Object.assign({}, defaultConfig.chrome || {}, merged.chrome || {});
    merged.questions =
      Array.isArray(merged.questions) && merged.questions.length
        ? merged.questions
        : defaultConfig.questions || [];
    return merged;
  }

  function makeInitialState() {
    return {
      progress: 0,
      playing: false,
      rafId: 0,
      lastTs: 0,
      predictionMade: false,
      selectedChoice: "",
      pausedForPrediction: false,
      revealOpened: false,
      completed: false,
      lastReportedPhase: "",
      targetResults: [],
      activityEvents: [],
      evidence: new Set(["scene-loaded"]),
    };
  }

  function mount(options) {
    if (!options || !options.defaultConfig || !options.elements) {
      throw new Error("SunnyVisualLearnerArtifactShell.mount requires defaultConfig and elements.");
    }

    var defaultConfig = options.defaultConfig;
    var el = options.elements;
    var gameParams = window.GAME_PARAMS || {};
    var state = makeInitialState();
    var artifactConfig = defaultConfig;
    var predictionPoint = 45;
    var sessionStartedAt = Date.now();
    var defaultConfigPath = options.defaultConfigPath || "./artifact.config.json";
    var revealStartProgress = Number(options.revealStartProgress) || 56;
    var api = null;

    function currentQuestion() {
      return (
        (artifactConfig.questions && artifactConfig.questions[0]) ||
        (defaultConfig.questions && defaultConfig.questions[0]) ||
        {
          prompt: "What do you predict?",
          options: [],
          correctOptionId: "",
          targetConcept: artifactConfig.concept || "visual_model",
          scaffoldLevel: 0,
          pauseAtProgress: predictionPoint,
        }
      );
    }

    function requestedFlowMode() {
      var mode = gameParams.visualLearnerFlowMode;
      if (mode === "playthrough" || mode === "pause-for-question") return mode;
      return (artifactConfig.mode && artifactConfig.mode.default) || "pause-for-question";
    }

    function isParentPreview() {
      if (gameParams.chrome === "child") return false;
      if (gameParams.chrome === "parent") return true;
      return Boolean(
        window.parent === window || gameParams.previewDryRun || gameParams.previewGoLive,
      );
    }

    function isPlaythroughMode() {
      return Boolean(el.playthroughToggle && el.playthroughToggle.checked);
    }

    function applyChromeMode() {
      var parentPreview = isParentPreview();
      document.body.classList.toggle("parent-preview", parentPreview);
      document.body.classList.toggle("child-mode", !parentPreview);
      if (el.playthroughToggle) {
        el.playthroughToggle.disabled =
          !parentPreview || artifactConfig.preview.allowPlaythrough !== true;
        el.playthroughToggle.checked =
          parentPreview &&
          artifactConfig.preview.allowPlaythrough === true &&
          requestedFlowMode() === "playthrough";
      }
    }

    function getPhase(progress) {
      if (typeof options.getPhase === "function") return options.getPhase(progress);
      if (progress < 16) return "intro";
      if (progress < predictionPoint) return "watch";
      if (progress < revealStartProgress) return "prediction";
      if (progress < 86) return "reveal";
      if (progress < 100) return "summary";
      return "complete";
    }

    function reportState(action, detail) {
      var q = currentQuestion();
      var phase = getPhase(state.progress);
      var snapshot = {
        phase: phase,
        artifactId: artifactConfig.artifactId,
        concept: artifactConfig.concept,
        learningGoal: artifactConfig.learningGoal,
        currentQuestion: q.prompt,
        selectedAnswer: state.selectedChoice || null,
        targetResults: state.targetResults,
        companionContext: {
          role:
            artifactConfig.companionContext &&
            artifactConfig.companionContext.role,
          maxSentences:
            artifactConfig.companionContext &&
            artifactConfig.companionContext.maxSentences,
          canRevealAnswer:
            artifactConfig.companionContext &&
            artifactConfig.companionContext.canRevealAnswer,
          childId: gameParams.childId,
          companionName: gameParams.companionName,
          artifactId: artifactConfig.artifactId,
          concept: artifactConfig.concept,
          currentPhase: phase,
          currentQuestion: q.prompt,
          selectedAnswer: state.selectedChoice || null,
        },
      };
      if (window.GameBridge && typeof window.GameBridge.reportAction === "function") {
        window.GameBridge.reportAction(action, detail, snapshot);
      } else if (window.GameBridge && typeof window.GameBridge.reportState === "function") {
        window.GameBridge.reportState(detail, snapshot);
      }
    }

    function reportCompanionAnchor(reason, extra) {
      var q = currentQuestion();
      var option = selectedOption();
      var phase = getPhase(state.progress);
      var anchor = Object.assign(
        {
          reason: reason || "state_update",
          artifactId: artifactConfig.artifactId,
          concept: artifactConfig.concept,
          learningGoal: artifactConfig.learningGoal,
          misconception: artifactConfig.misconception,
          phase: phase,
          progress: Math.round(state.progress),
          question: q.prompt,
          selectedAnswer: option ? option.label : state.selectedChoice || null,
          selectedOptionId: state.selectedChoice || null,
          allowedRole:
            (artifactConfig.companionContext &&
              artifactConfig.companionContext.role) ||
            "hint_only",
          canRevealAnswer: Boolean(
            artifactConfig.companionContext &&
              artifactConfig.companionContext.canRevealAnswer,
          ),
          childId: gameParams.childId,
          childName: gameParams.childName,
          companion: gameParams.companion,
          companionName: gameParams.companionName,
          nodeId: gameParams.nodeId,
        },
        extra || {},
      );
      if (
        window.GameBridge &&
        typeof window.GameBridge.reportCompanionAnchor === "function"
      ) {
        window.GameBridge.reportCompanionAnchor(anchor);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "companion_anchor", payload: anchor, version: "1.0" },
          "*",
        );
      }
    }

    function reportPhaseIfChanged() {
      var phase = getPhase(state.progress);
      if (phase === state.lastReportedPhase) return;
      state.lastReportedPhase = phase;
      reportState("phase_change", "Visual explainer phase: " + phase);
      reportCompanionAnchor("phase_change");
    }

    function emitEvidence(id, text, payload) {
      if (state.evidence.has(id)) return;
      state.evidence.add(id);
      state.activityEvents.push({
        type: id,
        text: text,
        payload: payload || null,
        timestamp: Date.now(),
      });
      if (el.evidenceList) {
        var li = document.createElement("li");
        li.setAttribute("data-evidence-event", id);
        var b = document.createElement("b");
        b.textContent = id;
        var span = document.createElement("span");
        span.textContent = text;
        li.appendChild(b);
        li.appendChild(span);
        el.evidenceList.appendChild(li);
        el.evidenceList.scrollTop = el.evidenceList.scrollHeight;
      }
    }

    function applyArtifactConfig(config) {
      artifactConfig = mergeArtifactConfig(defaultConfig, config);
      var q = currentQuestion();
      predictionPoint = Number(q.pauseAtProgress) || predictionPoint;
      revealStartProgress = Math.max(revealStartProgress, predictionPoint + 1);

      if (el.narrationAudio && artifactConfig.narration.enabled && artifactConfig.narration.audioPath) {
        el.narrationAudio.src = artifactConfig.narration.audioPath;
      }
      if (el.narrationMeta && artifactConfig.narration) {
        el.narrationMeta.textContent =
          artifactConfig.narration.provider +
          " voice " +
          artifactConfig.narration.voiceId +
          " via " +
          artifactConfig.narration.modelId +
          ". Provider can be swapped in artifact config.";
      }
      if (el.artifactDebug) {
        el.artifactDebug.textContent =
          artifactConfig.artifactId +
          " • " +
          artifactConfig.concept +
          " • " +
          artifactConfig.learningGoal;
      }
      if (el.predictionPrompt) {
        el.predictionPrompt.textContent = q.prompt;
      }
      if (Array.isArray(el.choices)) {
        el.choices.forEach(function (btn, index) {
          var option = q.options[index];
          if (!option) {
            btn.hidden = true;
            return;
          }
          btn.hidden = false;
          btn.dataset.choice = option.id;
          btn.textContent = option.label;
        });
      }
      applyChromeMode();
      if (typeof options.onConfigApplied === "function") {
        options.onConfigApplied({
          config: artifactConfig,
          question: q,
          state: state,
          shell: api,
        });
      }
      updatePredictionPanel();
      reportCompanionAnchor("config_loaded");
    }

    function loadArtifactConfig() {
      var configPath = gameParams.config || defaultConfigPath;
      return fetch(configPath, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("artifact config " + res.status);
          return res.json();
        })
        .then(function (config) {
          applyArtifactConfig(config);
          emitEvidence("artifact-config-loaded", "Artifact config loaded from " + configPath + ".");
          reportState("artifact_config_loaded", "Visual explainer config loaded.");
          reportCompanionAnchor("artifact_config_loaded");
        })
        .catch(function (err) {
          console.warn("🎮 [visual-learner-shell] [config] fallback", err);
          applyArtifactConfig(defaultConfig);
          emitEvidence("artifact-config-fallback", "Artifact config failed to load; using embedded fallback.");
        });
    }

    function hasNarrationTimeline() {
      return (
        el.narrationAudio &&
        Number.isFinite(el.narrationAudio.duration) &&
        el.narrationAudio.duration > 0
      );
    }

    function progressToNarrationTime(progress) {
      if (!hasNarrationTimeline()) return 0;
      return (clampProgress(progress) / 100) * el.narrationAudio.duration;
    }

    function narrationTimeToProgress() {
      if (!hasNarrationTimeline()) return state.progress;
      return clampProgress((el.narrationAudio.currentTime / el.narrationAudio.duration) * 100);
    }

    function syncNarrationToProgress(progress) {
      if (!hasNarrationTimeline()) return;
      var targetTime = progressToNarrationTime(progress);
      if (Math.abs(el.narrationAudio.currentTime - targetTime) > 0.35) {
        el.narrationAudio.currentTime = targetTime;
      }
    }

    function selectedOption() {
      var q = currentQuestion();
      return (q.options || []).find(function (option) {
        return option.id === state.selectedChoice;
      });
    }

    function predictionFeedbackText() {
      if (typeof options.formatPredictionFeedback === "function") {
        return options.formatPredictionFeedback({
          config: artifactConfig,
          question: currentQuestion(),
          selectedOption: selectedOption(),
          state: state,
          progress: state.progress,
          isPlaythrough: isPlaythroughMode(),
        });
      }
      if (isPlaythroughMode() && !state.predictionMade) {
        return "Playthrough mode skips the prediction pause so you can feel the full flow.";
      }
      if (!state.predictionMade) {
        return state.progress >= predictionPoint - 2
          ? "Make your prediction before the answer opens."
          : "Make your prediction when Sunny pauses.";
      }
      return "Prediction saved.";
    }

    function updatePredictionPanel() {
      var q = currentQuestion();
      document.body.classList.toggle(
        "question-active",
        !state.revealOpened && (state.progress >= predictionPoint - 2 || state.predictionMade),
      );
      if (Array.isArray(el.choices)) {
        el.choices.forEach(function (btn) {
          var selected = btn.dataset.choice === state.selectedChoice;
          btn.classList.toggle("selected", selected);
          btn.setAttribute("aria-pressed", selected ? "true" : "false");
        });
      }
      if (el.revealButton) {
        el.revealButton.disabled = !state.predictionMade && !isPlaythroughMode();
      }
      if (el.predFeedback) {
        el.predFeedback.textContent = predictionFeedbackText(q);
      }
    }

    function updateCheckpoints() {
      if (!Array.isArray(el.checkpoints)) return;
      var activeIndex = 0;
      el.checkpoints.forEach(function (btn, index) {
        if (state.progress >= Number(btn.dataset.progress)) activeIndex = index;
      });
      el.checkpoints.forEach(function (btn, index) {
        btn.classList.toggle("active", index === activeIndex);
      });
    }

    function renderScene() {
      if (typeof options.renderScene === "function") {
        options.renderScene({
          progress: state.progress,
          state: state,
          config: artifactConfig,
          question: currentQuestion(),
          elements: el,
          shell: api,
        });
      }
      if (typeof options.checkEvidence === "function") {
        options.checkEvidence({
          progress: state.progress,
          state: state,
          config: artifactConfig,
          question: currentQuestion(),
          shell: api,
        });
      }
      if (el.scrubber) el.scrubber.value = String(Math.round(state.progress));
      if (el.progressOut) el.progressOut.textContent = Math.round(state.progress) + "%";
      updatePredictionPanel();
      updateCheckpoints();
    }

    function setProgress(value, syncNarration) {
      state.progress = clampProgress(value);
      if (syncNarration !== false) syncNarrationToProgress(state.progress);
      renderScene();
      reportPhaseIfChanged();
    }

    function resetVisualLearnerRun() {
      state.predictionMade = false;
      state.selectedChoice = "";
      state.pausedForPrediction = false;
      state.revealOpened = false;
      state.completed = false;
      state.targetResults = [];
      updatePredictionPanel();
      reportCompanionAnchor("run_reset");
    }

    function pause(optionsArg) {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
      state.playing = false;
      if (!optionsArg || !optionsArg.fromNarration) {
        if (el.narrationAudio && !el.narrationAudio.paused) el.narrationAudio.pause();
      }
      state.lastTs = 0;
      if (el.playPause) {
        el.playPause.textContent = "▶ Play";
        el.playPause.setAttribute("aria-label", "Play visual explainer");
      }
    }

    function play(optionsArg) {
      if (state.progress >= 100) {
        resetVisualLearnerRun();
        setProgress(0, true);
      }
      state.playing = true;
      if (el.playPause) {
        el.playPause.textContent = "Ⅱ Pause";
        el.playPause.setAttribute("aria-label", "Pause visual explainer");
      }
      state.lastTs = 0;
      if (!optionsArg || !optionsArg.fromNarration) {
        if (el.narrationAudio) {
          syncNarrationToProgress(state.progress);
          el.narrationAudio.play().catch(function () {
            emitEvidence(
              "narration-start-blocked",
              "Browser blocked narration autoplay; tap the audio control to start.",
            );
            pause({ fromNarration: true });
          });
        }
      }
      state.rafId = requestAnimationFrame(tick);
    }

    function tick(ts) {
      var next;
      var dt;
      if (!state.playing) return;

      if (hasNarrationTimeline()) {
        next = narrationTimeToProgress();
        if (
          !isPlaythroughMode() &&
          !state.predictionMade &&
          state.progress < predictionPoint &&
          next >= predictionPoint
        ) {
          state.pausedForPrediction = true;
          setProgress(predictionPoint, true);
          pause();
          return;
        }
        if (next >= 99.8 || el.narrationAudio.ended) {
          setProgress(100, false);
          emitEvidence("scene-complete", "Visual explainer completed with evidence ready for recall.");
          pause();
          completeActivity();
          return;
        }
        setProgress(next, false);
        state.rafId = requestAnimationFrame(tick);
        return;
      }

      if (!state.lastTs) state.lastTs = ts;
      dt = ts - state.lastTs;
      state.lastTs = ts;
      next = state.progress + dt * (Number(options.progressPerMs) || 0.0062);

      if (
        !isPlaythroughMode() &&
        !state.predictionMade &&
        state.progress < predictionPoint &&
        next >= predictionPoint
      ) {
        state.pausedForPrediction = true;
        setProgress(predictionPoint, true);
        pause();
        return;
      }

      if (next >= 100) {
        setProgress(100, true);
        emitEvidence("scene-complete", "Visual explainer completed with evidence ready for recall.");
        pause();
        completeActivity();
        return;
      }

      setProgress(next, true);
      state.rafId = requestAnimationFrame(tick);
    }

    function recordPrediction(choiceId) {
      var q = currentQuestion();
      var option = (q.options || []).find(function (item) {
        return item.id === choiceId;
      });
      var correct;
      var targetResult;
      if (!option) return;
      state.predictionMade = true;
      state.selectedChoice = option.id;
      state.pausedForPrediction = false;
      correct = option.id === q.correctOptionId || option.correct === true;
      targetResult = {
        type: "activity_target_result",
        target: q.targetConcept,
        concept: artifactConfig.concept,
        correct: correct,
        attempts: 1,
        attemptedValue: option.label,
        selectedOptionId: option.id,
        responseTime_ms: Date.now() - sessionStartedAt,
        scaffoldLevel: q.scaffoldLevel,
        misconception: correct ? null : option.misconceptionTag || q.misconceptionTag || null,
        mode: "visual-explainer",
        masteryEligible: true,
      };
      state.targetResults = [targetResult];
      emitEvidence("activity_target_result", "Prediction recorded: " + option.label + ".", targetResult);
      reportState("activity_target_result", "Prediction recorded: " + option.label + ".");
      reportCompanionAnchor("prediction_answered", {
        correct: correct,
        selectedAnswer: option.label,
        selectedOptionId: option.id,
        targetConcept: q.targetConcept,
        misconception: targetResult.misconception,
      });
      if (typeof window.fireAttemptEvent === "function") {
        window.fireAttemptEvent(targetResult);
      }
      if (window.GameBridge && typeof window.GameBridge.fireEvent === "function") {
        window.GameBridge.fireEvent(correct ? "correct_answer" : "wrong_answer", {
          artifactId: artifactConfig.artifactId,
          targetConcept: q.targetConcept,
          correct: correct,
          selectedAnswer: option.label,
        });
      }
      updatePredictionPanel();
    }

    function completeActivity() {
      var correctCount;
      var accuracy;
      var completion;
      if (state.completed) return;
      state.completed = true;
      correctCount = state.targetResults.filter(function (row) {
        return row.correct === true;
      }).length;
      accuracy = state.targetResults.length ? correctCount / state.targetResults.length : 1;
      completion = {
        type: "activity_complete",
        activityId: artifactConfig.artifactId,
        purpose: "visual_modeling",
        completed: true,
        accuracy: accuracy,
        xpEarned: Math.round(25 + accuracy * 25),
        timeSpent_ms: Date.now() - sessionStartedAt,
        wordsAttempted: state.targetResults.length,
        flaggedWords: [],
        targetResults: state.targetResults,
        activityEvents: state.activityEvents,
      };
      emitEvidence("activity_complete", "Visual learner artifact complete.", completion);
      reportState("activity_complete", "Visual learner artifact complete.");
      reportCompanionAnchor("activity_complete", {
        correct: accuracy >= 1,
        accuracy: accuracy,
        targetResults: state.targetResults,
      });
      if (typeof window.sendNodeComplete === "function") {
        window.sendNodeComplete(completion);
      }
    }

    function backToMap() {
      reportState("back_to_map", "Child exited visual learner artifact.");
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "map_back", source: "visual-learner" }, "*");
      }
    }

    function bindEvents() {
      if (el.playPause) {
        el.playPause.addEventListener("click", function () {
          if (state.playing) pause();
          else play();
        });
      }
      if (el.scrubber) {
        el.scrubber.addEventListener("input", function () {
          var value;
          pause();
          value = Number(el.scrubber.value);
          if (value < predictionPoint && (state.predictionMade || state.revealOpened)) {
            resetVisualLearnerRun();
          }
          if (!isPlaythroughMode() && !state.predictionMade && value > predictionPoint) {
            value = predictionPoint;
            state.pausedForPrediction = true;
            emitEvidence("prediction-pause", "Prediction pause reached before the reveal.");
          }
          setProgress(value, true);
        });
      }
      if (Array.isArray(el.checkpoints)) {
        el.checkpoints.forEach(function (btn) {
          btn.addEventListener("click", function () {
            var value;
            pause();
            value = Number(btn.dataset.progress);
            if (value < predictionPoint && (state.predictionMade || state.revealOpened)) {
              resetVisualLearnerRun();
            }
            if (!isPlaythroughMode() && !state.predictionMade && value > predictionPoint) {
              value = predictionPoint;
              state.pausedForPrediction = true;
              emitEvidence("prediction-pause", "Prediction pause reached before the reveal.");
            }
            setProgress(value, true);
          });
        });
      }
      if (Array.isArray(el.choices)) {
        el.choices.forEach(function (btn) {
          btn.addEventListener("click", function () {
            recordPrediction(btn.dataset.choice);
          });
        });
      }
      if (el.revealButton) {
        el.revealButton.addEventListener("click", function () {
          if (!state.predictionMade && !isPlaythroughMode()) return;
          state.revealOpened = true;
          updatePredictionPanel();
          reportCompanionAnchor("reveal_opened");
          if (state.progress < revealStartProgress) setProgress(revealStartProgress, true);
          play();
        });
      }
      if (el.playthroughToggle) {
        el.playthroughToggle.addEventListener("change", function () {
          if (el.playthroughToggle.checked) {
            emitEvidence(
              "cinema-preview",
              "Preview mode enabled: narration plays through without stopping for the prediction.",
            );
          }
          updatePredictionPanel();
          renderScene();
        });
      }
      if (el.finishButton) {
        el.finishButton.addEventListener("click", function () {
          pause();
          completeActivity();
        });
      }
      if (el.backButton) {
        el.backButton.addEventListener("click", function () {
          pause();
          backToMap();
        });
      }
      if (el.narrationAudio) {
        el.narrationAudio.addEventListener("play", function () {
          if (!state.playing) play({ fromNarration: true });
        });
        el.narrationAudio.addEventListener("pause", function () {
          if (state.playing) pause({ fromNarration: true });
        });
        el.narrationAudio.addEventListener("seeked", function () {
          if (hasNarrationTimeline()) setProgress(narrationTimeToProgress(), false);
        });
        el.narrationAudio.addEventListener("ended", function () {
          setProgress(100, false);
          emitEvidence("scene-complete", "Visual explainer completed with evidence ready for recall.");
          pause({ fromNarration: true });
          completeActivity();
        });
      }
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) pause();
      });
    }

    function start() {
      bindEvents();
      applyArtifactConfig(defaultConfig);
      setProgress(0, false);
      return loadArtifactConfig();
    }

    api = {
      state: state,
      get config() {
        return artifactConfig;
      },
      get predictionPoint() {
        return predictionPoint;
      },
      emitEvidence: emitEvidence,
      reportState: reportState,
      reportCompanionAnchor: reportCompanionAnchor,
      setProgress: setProgress,
      resetVisualLearnerRun: resetVisualLearnerRun,
      isPlaythroughMode: isPlaythroughMode,
      play: play,
      pause: pause,
      completeActivity: completeActivity,
      start: start,
    };

    return api;
  }

  window.SunnyVisualLearnerArtifactShell = {
    mount: mount,
  };
})();
