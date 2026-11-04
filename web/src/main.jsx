import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../public/styles.css";
import "../../public/css/mascot.css";
import "../../public/css/scene.css";
import { App } from "./App.jsx";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
