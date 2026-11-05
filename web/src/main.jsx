import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/mascot.css";
import "./styles/scene.css";
import "./styles/app.css";
import { App } from "./App.jsx";
import { followSystemTheme } from "./theme.js";

followSystemTheme();

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
