import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { CompanionDiag } from "./components/CompanionDiag";

const companionDiagEnabled = import.meta.env.VITE_COMPANION_DIAG === "true";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {companionDiagEnabled ? <CompanionDiag /> : <App />}
  </StrictMode>
);
