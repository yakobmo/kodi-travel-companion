import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

function syncKodiViewportHeight() {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  if (Number.isFinite(viewportHeight) && viewportHeight > 0) {
    document.documentElement.style.setProperty("--kodi-app-height", `${Math.round(viewportHeight)}px`);
  }
}

function resyncKodiViewportHeight() {
  syncKodiViewportHeight();
  window.requestAnimationFrame(syncKodiViewportHeight);
  window.setTimeout(syncKodiViewportHeight, 250);
}

syncKodiViewportHeight();
window.visualViewport?.addEventListener("resize", syncKodiViewportHeight);
window.addEventListener("resize", syncKodiViewportHeight);
window.addEventListener("orientationchange", resyncKodiViewportHeight);
window.addEventListener("pageshow", resyncKodiViewportHeight);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => {
          // Kodi stays usable if the browser blocks service worker updates.
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) {
            return;
          }

          refreshing = true;
          window.location.reload();
        });
      })
      .catch(() => {
        // Kodi stays usable if the browser blocks service workers.
      });
  });
}
