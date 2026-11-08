import type { AdventureBoardTheme } from "../../../src/shared/adventureBoardJson";

/**
 * Where a Spark Orb encounter happens. The picture comes from the board's theme when it has one
 * (so the orb matches the board); otherwise the saved park. Light and weather follow the real
 * clock and calendar, so the same picture still feels different in the morning, at night, at
 * Halloween or in the snow. Generated scenes later plug in as the board theme's picture.
 */
export type SparkOrbTimeOfDay = "morning" | "afternoon" | "evening" | "night";
export type SparkOrbSeason = "spring" | "summer" | "autumn" | "halloween" | "holiday" | "winter";
export type SparkOrbWeather = "snow" | "leaves" | "petals" | "fireflies" | "none";

export interface SparkOrbSceneInput {
  boardTheme?: Pick<AdventureBoardTheme, "background">;
  timeOfDay?: SparkOrbTimeOfDay;
  season?: SparkOrbSeason;
  now?: Date;
}

export interface SparkOrbScene {
  backgroundSrc: string;
  source: "board-theme" | "default";
  timeOfDay: SparkOrbTimeOfDay;
  season: SparkOrbSeason;
  weather: SparkOrbWeather;
}

export const SPARK_ORB_DEFAULT_BACKGROUND = "/encounters/spark-orb/park-background.png";
export const SPARK_ORB_MAX_WEATHER_PARTICLES = 18;

export function sparkOrbTimeOfDay(now: Date): SparkOrbTimeOfDay {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "afternoon";
  if (hour >= 16 && hour < 20) return "evening";
  return "night";
}

export function sparkOrbSeason(now: Date): SparkOrbSeason {
  const month = now.getMonth() + 1;
  const day = now.getDate();
  if (month === 10 && day >= 15) return "halloween";
  if (month === 12 && day <= 26) return "holiday";
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

function weatherFor(season: SparkOrbSeason, timeOfDay: SparkOrbTimeOfDay): SparkOrbWeather {
  switch (season) {
    case "holiday":
    case "winter":
      return "snow";
    case "autumn":
    case "halloween":
      return "leaves";
    case "spring":
      return "petals";
    case "summer":
      return timeOfDay === "evening" || timeOfDay === "night" ? "fireflies" : "none";
    default: {
      const exhaustive: never = season;
      return exhaustive;
    }
  }
}

export function resolveSparkOrbScene(input: SparkOrbSceneInput = {}): SparkOrbScene {
  const now = input.now ?? new Date();
  const themeBackground = input.boardTheme?.background;
  const themePicture =
    themeBackground?.type === "image" && themeBackground.value.trim() ? themeBackground.value.trim() : null;
  const timeOfDay = input.timeOfDay ?? sparkOrbTimeOfDay(now);
  const season = input.season ?? sparkOrbSeason(now);
  return {
    backgroundSrc: themePicture ?? SPARK_ORB_DEFAULT_BACKGROUND,
    source: themePicture ? "board-theme" : "default",
    timeOfDay,
    season,
    weather: weatherFor(season, timeOfDay),
  };
}
