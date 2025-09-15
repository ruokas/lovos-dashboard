import { texts, t } from "./texts.js";

const STORAGE_KEY = "theme";
const root = document.documentElement;
const btn = document.getElementById("themeToggle");

function applyTheme(mode) {
  root.classList.toggle("dark", mode === "dark");
  if (btn) {
    const label = mode === "dark" ? t(texts.theme.light) : t(texts.theme.dark);
    btn.textContent = label;
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
