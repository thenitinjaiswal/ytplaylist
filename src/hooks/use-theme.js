import { useCallback, useEffect, useState } from "react";
const STORAGE_KEY = "codestudy.theme";
function apply(theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}
export function useTheme() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = stored === "light" ? "light" : "dark";
    setTheme(next);
    apply(next);
  }, []);
  const update = useCallback((next) => {
    setTheme(next);
    apply(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);
  const toggle = useCallback(() => {
    update(theme === "dark" ? "light" : "dark");
  }, [theme, update]);
  return { theme, setTheme: update, toggle };
}
