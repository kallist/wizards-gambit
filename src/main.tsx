import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SaveBoundary } from "./platform/SaveBoundary";
import "./styles.css";
import "./pixel-ui.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SaveBoundary>
      <App />
    </SaveBoundary>
  </StrictMode>,
);
