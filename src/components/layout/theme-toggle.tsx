"use client";

import { useSyncExternalStore } from "react";

const KEY = "atomgrid-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.dataset.theme === "dark";

/** Day / Night mode switch; the choice is remembered in this browser. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark;
        if (next) document.documentElement.dataset.theme = "dark";
        else delete document.documentElement.dataset.theme;
        try {
          localStorage.setItem(KEY, next ? "dark" : "light");
        } catch {
          // Storage unavailable (private mode); the switch still works for this page.
        }
      }}
      className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-muted hover:text-ink"
      aria-label={dark ? "Switch to day mode" : "Switch to night mode"}
      title={dark ? "Day mode" : "Night mode"}
    >
      {dark ? "☀️ Day" : "🌙 Night"}
    </button>
  );
}
