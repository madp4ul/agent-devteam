import { useEffect, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";

const preferenceKey = "coordination-theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function storedPreference(): ThemePreference {
  const bootstrapPreference = document.documentElement.dataset.themePreference;
  if (bootstrapPreference === "light" || bootstrapPreference === "dark") {
    return bootstrapPreference;
  }
  try {
    const stored = localStorage.getItem(preferenceKey);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(preference: ThemePreference): void {
  const effectiveTheme = preference === "system"
    ? (systemTheme.matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = effectiveTheme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content",
    effectiveTheme === "dark" ? "#121916" : "#f2f4ef",
  );
}

export function useThemePreference(): [ThemePreference, (choice: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(storedPreference);

  useEffect(() => {
    applyTheme(preference);
    const followSystem = (): void => {
      if (preference === "system") applyTheme("system");
    };
    const followChoice = (event: Event): void => {
      const choice = (event as CustomEvent<ThemePreference>).detail;
      setPreference(choice);
    };
    systemTheme.addEventListener("change", followSystem);
    window.addEventListener("coordination-theme-change", followChoice);
    return () => {
      systemTheme.removeEventListener("change", followSystem);
      window.removeEventListener("coordination-theme-change", followChoice);
    };
  }, [preference]);

  const chooseTheme = (choice: ThemePreference): void => {
    setPreference(choice);
    applyTheme(choice);
    try {
      if (choice === "system") localStorage.removeItem(preferenceKey);
      else localStorage.setItem(preferenceKey, choice);
    } catch {
      // The in-memory preference still applies when device storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent<ThemePreference>("coordination-theme-change", { detail: choice }));
  };
  return [preference, chooseTheme];
}

export function ThemeControl(): ReactNode {
  const [preference, chooseTheme] = useThemePreference();

  return (
    <label className="theme-control">
      <span>Appearance</span>
      <select
        aria-label="Appearance"
        value={preference}
        onChange={(event) => chooseTheme(event.currentTarget.value as ThemePreference)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
