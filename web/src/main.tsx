import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { CompanionDiag } from "./components/CompanionDiag";
import { DiagReadingScreen } from "./components/DiagReadingScreen";
import { TransitionProvider } from "./context/TransitionContext";

const diagReadingEnabled = import.meta.env.VITE_DIAG_READING === "true";
const companionDiagEnabled = import.meta.env.VITE_COMPANION_DIAG === "true";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TransitionProvider>
      {diagReadingEnabled ? (
        <DiagReadingScreen />
      ) : companionDiagEnabled ? (
        <CompanionDiag />
      ) : (
        <App />
      )}
    </TransitionProvider>
  </StrictMode>
);
