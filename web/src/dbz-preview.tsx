import React from "react";
import { createRoot } from "react-dom/client";
import { CompanionShowroom } from "./components/CompanionShowroom";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CompanionShowroom
      onSelect={(id) => console.log("[DBZ preview] selected", id)}
      enableBackgroundMusic={false}
      useGeneratedBackground={false}
    />
  </React.StrictMode>,
);
