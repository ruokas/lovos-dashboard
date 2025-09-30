import { texts, t } from "./texts.js";

const STORAGE_KEY = "theme";
const root = document.documentElement;
const btn = document.getElementById("themeToggle");

function applyTheme(mode) {
  root.classList.toggle("dark", mode === "dark");
  if (btn) {
    // Update icon based on theme
    const icon = btn.querySelector('svg path');
    if (icon) {
      if (mode === "dark") {
        // Light mode icon (sun)
        icon.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z');
        btn.title = 'Šviesi tema';
      } else {
        // Dark mode icon (moon)
        icon.setAttribute('d', 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z');
        btn.title = 'Tamsi tema';
      }
    }
  }
}

const stored =
  localStorage.getItem(STORAGE_KEY) ||
  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

applyTheme(stored);

if (btn) {
  btn.addEventListener("click", () => {
    const next = root.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  });
}
