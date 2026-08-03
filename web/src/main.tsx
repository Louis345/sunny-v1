import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { CompanionDiag } from "./components/CompanionDiag";
import { DiagReadingScreen } from "./components/DiagReadingScreen";
import { VisualExplainerDemo } from "./components/VisualExplainer/VisualExplainerDemo";
import { VisualExplainerMapDemo } from "./components/VisualExplainer/VisualExplainerMapDemo";
import { VisualExplainerRenderRoute } from "./components/VisualExplainer/VisualExplainerRenderRoute";
import { TransitionProvider } from "./context/TransitionContext";
import { resolveSunnyRuntimeConfig } from "../../src/shared/runtimeConfig";
import { ReturnedWorkPage } from "./components/ReturnedWorkPage";
import { LearningReportPage } from "./components/LearningReportPage";

const runtimeConfig = resolveSunnyRuntimeConfig(import.meta.env);
const diagReadingEnabled = import.meta.env.VITE_DIAG_READING === "true";
const companionDiagEnabled = import.meta.env.VITE_COMPANION_DIAG === "true";
const visualExplainerRenderEnabled = window.location.pathname === "/__render";
const returnedWorkEnabled = window.location.pathname === "/parent/returned-work";
const learningReportEnabled = window.location.pathname === "/parent/learning-report";
const returnedWorkChildId = new URLSearchParams(window.location.search).get("child")?.trim().toLowerCase() || "reina";
const learningReportHomeworkId = new URLSearchParams(window.location.search).get("homework")?.trim() || undefined;
const visualExplainerDemoEnabled =
  runtimeConfig.demoRoute === "visual-explainer" ||
  window.location.pathname === "/visual-explainer" ||
  new URLSearchParams(window.location.search).get("demo") === "visual-explainer";
const visualExplainerMapDemoEnabled =
  runtimeConfig.demoRoute === "visual-explainer-map" ||
  window.location.pathname === "/visual-explainer-map" ||
  new URLSearchParams(window.location.search).get("demo") === "visual-explainer-map";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TransitionProvider>
      {learningReportEnabled ? (
        <LearningReportPage childId={returnedWorkChildId} initialHomeworkId={learningReportHomeworkId} />
      ) : returnedWorkEnabled ? (
        <ReturnedWorkPage childId={returnedWorkChildId} />
      ) : visualExplainerRenderEnabled ? (
        <VisualExplainerRenderRoute />
      ) : visualExplainerMapDemoEnabled ? (
        <VisualExplainerMapDemo />
      ) : visualExplainerDemoEnabled ? (
        <VisualExplainerDemo />
      ) : diagReadingEnabled ? (
        <DiagReadingScreen />
      ) : companionDiagEnabled ? (
        <CompanionDiag />
      ) : (
        <App />
      )}
    </TransitionProvider>
  </StrictMode>
);
