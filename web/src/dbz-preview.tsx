import React from "react";
import { createRoot } from "react-dom/client";
import { CompanionShowroom } from "./components/CompanionShowroom";
import { COMPANION_MANIFEST } from "./companion/companions.generated";

function getText(companionId: string): string {
  const entry = COMPANION_MANIFEST.find((c) => c.id === companionId);
  return entry?.showroom?.scripts.en.intro ?? "Hey! I'm excited to meet you.";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CompanionShowroom
      getText={getText}
      onSelect={(id) => console.log("[DBZ preview] selected", id)}
      enableBackgroundMusic={false}
      useGeneratedBackground={false}
    />
  </React.StrictMode>,
);
