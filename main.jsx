import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// TEMP: catches any startup crash and shows it on-screen, since there's no
// console access on mobile. Remove this block once the blank-screen issue
// is resolved.
window.addEventListener("error", (e) => showCrash(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showCrash(e.reason));

function showCrash(err) {
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;inset:0;background:#1a0000;color:#ffb4b4;font-family:monospace;" +
    "font-size:13px;padding:16px;z-index:99999;overflow:auto;white-space:pre-wrap;";
  box.textContent = "CRASH:\n\n" + (err?.stack || err?.message || String(err));
  document.body.appendChild(box);
}

try {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  showCrash(err);
}
