"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { LayoutParamCapture } from "@/components/layout/LayoutParamCapture";
import { MiniAppHomeRedirect } from "@/components/layout/MiniAppHomeRedirect";
import { MiniAppReady } from "@/components/layout/MiniAppReady";

// ─── Theme context ────────────────────────────────────────────────────────────
type ThemeMode = "dark" | "light";

interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  // Sync to localStorage and apply class on <html>
  useEffect(() => {
    const saved = (localStorage.getItem("fc_theme") as ThemeMode) ?? "dark";
    setTheme(saved);
    document.documentElement.classList.toggle("light", saved === "light");
  }, []);

  function toggleTheme() {
    setTheme((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      localStorage.setItem("fc_theme", next);
      document.documentElement.classList.toggle("light", next === "light");
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Root providers ───────────────────────────────────────────────────────────
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LayoutParamCapture />
        <MiniAppReady />
        <MiniAppHomeRedirect />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
