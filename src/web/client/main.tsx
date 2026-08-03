import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Browser application root is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
