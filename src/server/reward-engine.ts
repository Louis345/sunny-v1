import { getRewardDurations } from "./session-triggers";
import type { ChildName } from "../companions/loader";
import {
  sessionEventBus,
  type SessionEvent,
  type SessionEventType,
} from "./session-event-bus";

export interface RewardEvent {
  timestamp: string;
  rewardStyle: "flash" | "takeover" | "none";
  displayDuration_ms: number;
  timeToNextUtterance_ms: number;
  nextAnswerCorrect: boolean | null;
  childVerbalReaction: string | null;
  sessionPhase: string;
  correctStreakAtTime: number;
}

type SendFn = (type: string, data: Record<string, unknown>) => void;

/**
 * Streak + flash rewards + reward log. Listens to correct_answer / wrong_answer on the global bus (scoped by sessionId).
 */
export class RewardEngine {
  private correctStreak = 0;
  private rewardLog: RewardEvent[] = [];
  private send: SendFn | null = null;
  private childName: ChildName | null = null;
  private childId = "";
  private sessionId = "";
  private unsub: Array<() => void> = [];

  attach(
    send: SendFn,
    childName: ChildName,
    childId: string,
    sessionId: string,
  ): void {
    this.detach();
    this.send = send;
    this.childName = childName;
    this.childId = childId;
    this.sessionId = sessionId;

    const onCorrect = (ev: SessionEvent) => {
      if (ev.sessionId !== this.sessionId || ev.childId !== this.childId)
        return;
      this.onCorrectAnswer();
    };
    const onWrong = (ev: SessionEvent) => {
      if (ev.sessionId !== this.sessionId || ev.childId !== this.childId)
        return;
      this.onWrongAnswer();
    };
    this.unsub.push(
      sessionEventBus.subscribe("correct_answer", onCorrect),
      sessionEventBus.subscribe("wrong_answer", onWrong),
    );
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.send = null;
    this.childName = null;
    this.childId = "";
    this.sessionId = "";
  }

  getRewardLog(): RewardEvent[] {
    return this.rewardLog;
  }

  getCorrectStreak(): number {
    return this.correctStreak;
  }

  /** Direct reward log (e.g. takeover canvas) — not bus-driven. */
  logRewardEvent(style: string, duration_ms: number): void {
    this.rewardLog.push({
      timestamp: new Date().toISOString(),
      rewardStyle: style as "flash" | "takeover" | "none",
      displayDuration_ms: duration_ms,
      timeToNextUtterance_ms: -1,
      nextAnswerCorrect: null,
      childVerbalReaction: null,
      sessionPhase: "learning",
      correctStreakAtTime: this.correctStreak,
    });
  }

  private fireBus(type: SessionEventType): void {
    sessionEventBus.fire({
      type,
      sessionId: this.sessionId,
      childId: this.childId,
      timestamp: Date.now(),
    });
  }

  private onCorrectAnswer(): void {
    const send = this.send;
    const childName = this.childName;
    if (!send || !childName) return;

    this.correctStreak++;
    const { flash_ms } = getRewardDurations(childName);
    send("reward", {
      rewardStyle: "flash",
      displayDuration_ms: flash_ms,
    });
    this.logRewardEvent("flash", flash_ms);

    if (this.correctStreak === 3) {
      this.fireBus("streak_3");
      send("phase", { phase: "riddle" });
    }

    if (this.correctStreak === 5) {
      this.fireBus("streak_5");
      send("phase", { phase: "championship" });
      this.correctStreak = 0;
    }
  }

  private onWrongAnswer(): void {
    this.correctStreak = 0;
  }
}
