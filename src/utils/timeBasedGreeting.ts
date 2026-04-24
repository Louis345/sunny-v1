/** Randomized greeting for companion opening line (returning sessions). */
export function getTimeBasedGreeting(childName: string): string {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = day === 0 || day === 6;

  const greetings: Record<string, string[]> = {
    morning: [
      `${childName}! Good morning — how'd you sleep?`,
      `Hey ${childName}! Morning! What's going on?`,
      `${childName}! You're up — how's your morning so far?`,
    ],
    afternoon_weekday: [
      `${childName}! How was school today?`,
      `Hey ${childName}! You're back — how'd it go?`,
      `${childName}! Tell me everything — how was your day?`,
    ],
    afternoon_weekend: [
      `${childName}! How's your ${day === 0 ? "Sunday" : "Saturday"} going?`,
      `Hey ${childName}! Having a good weekend?`,
      `${childName}! What have you been up to today?`,
    ],
    evening: [
      `${childName}! How's your night going?`,
      `Hey ${childName}! What's been happening?`,
      `${childName}! Good to see you — what's new?`,
    ],
    night: [
      `${childName}! It's getting late — what's up?`,
      `Hey ${childName}! Still going strong tonight?`,
      `${childName}! Night owl! What's on your mind?`,
    ],
  };

  let bucket: string;
  if (hour < 12) {
    bucket = "morning";
  } else if (hour < 16) {
    bucket = isWeekend ? "afternoon_weekend" : "afternoon_weekday";
  } else if (hour < 21) {
    bucket = "evening";
  } else {
    bucket = "night";
  }

  const options = greetings[bucket];
  return options[Math.floor(Math.random() * options.length)];
}
