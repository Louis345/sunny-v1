/**
 * The one sky clock (owner, 2026-11-07): the mood of the sky follows the real sunrise and sunset where
 * the kiosk is. The start screen and the Spark Orb scenes both read it, so they always agree.
 */
export type SkyMood = "sunrise" | "day" | "golden" | "twilight" | "night";

export interface SkyClockInput {
  at: Date;
  utcOffsetMinutes: number;
  standardOffsetMinutes: number;
}

/** No location is stored (public repo): longitude comes from the timezone, latitude is a mid-latitude guess. */
const SKY_LATITUDE_DEGREES = 41;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Sunrise and sunset in local clock minutes, within about fifteen minutes; plenty for a mood. */
export function sunTimes(input: SkyClockInput): { sunrise: number; sunset: number } {
  const start = Date.UTC(input.at.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((input.at.getTime() - start) / 86_400_000);
  const b = rad((360 / 365) * (dayOfYear - 81));
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const declination = rad(23.44 * Math.sin(rad((360 / 365) * (284 + dayOfYear))));
  const latitude = rad(SKY_LATITUDE_DEGREES);
  const cosHourAngle = (Math.sin(rad(-0.833)) - Math.sin(latitude) * Math.sin(declination)) / (Math.cos(latitude) * Math.cos(declination));
  const halfDayMinutes = (Math.acos(Math.min(1, Math.max(-1, cosHourAngle))) * 180 / Math.PI) * 4;
  const solarNoon = 720 - equationOfTime + (input.utcOffsetMinutes - input.standardOffsetMinutes);
  return { sunrise: solarNoon - halfDayMinutes, sunset: solarNoon + halfDayMinutes };
}

export function skyMoodForTime(input: SkyClockInput): SkyMood {
  const local = new Date(input.at.getTime() + input.utcOffsetMinutes * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const { sunrise, sunset } = sunTimes(input);
  if (minutes >= sunrise - 30 && minutes < sunrise + 60) return "sunrise";
  if (minutes >= sunset - 60 && minutes < sunset) return "golden";
  if (minutes >= sunset && minutes < sunset + 40) return "twilight";
  if (minutes >= sunrise + 60 && minutes < sunset - 60) return "day";
  return "night";
}

/** The kiosk's own clock and timezone. */
export function kioskSkyClockInput(at: Date = new Date()): SkyClockInput {
  const year = at.getFullYear();
  const standardOffsetMinutes = -Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
  return { at, utcOffsetMinutes: -at.getTimezoneOffset(), standardOffsetMinutes };
}

export function skyMoodNow(at: Date = new Date()): SkyMood {
  return skyMoodForTime(kioskSkyClockInput(at));
}
