"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import {
  getStoredTheme,
  getSystemTheme,
  setTheme as applyThemePreference,
  subscribeToThemeChanges,
  type Theme,
} from "@/lib/theme";
import {
  ACTIVE_SESSION_EVENT,
  ACTIVE_SESSION_STORAGE_KEY,
  CODE_BLOCK_SHOW_LINE_NUMBERS_STORAGE_KEY,
  CODE_BLOCK_SETTINGS_EVENT,
  CODE_BLOCK_THEME_STORAGE_KEY,
  CODE_BLOCK_WRAP_LONG_LINES_STORAGE_KEY,
  LANGUAGE_EVENT,
  LANGUAGE_STORAGE_KEY,
  hasStoredLanguage,
  SIDEBAR_COLLAPSED_EVENT,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  normalizeCodeBlockShowLineNumbers,
  normalizeCodeBlockTheme,
  normalizeCodeBlockWrapLongLines,
  normalizeLanguage,
  resolveResponseLanguage,
  SESSION_EVENT,
  readStoredActiveSessionId,
  readStoredCodeBlockShowLineNumbers,
  readStoredCodeBlockTheme,
  readStoredCodeBlockWrapLongLines,
  readStoredLanguage,
  writeStoredResponseLanguage,
  readStoredSidebarCollapsed,
  writeStoredActiveSessionId,
  writeStoredCodeBlockShowLineNumbers,
  writeStoredCodeBlockTheme,
  writeStoredCodeBlockWrapLongLines,
  writeStoredLanguage,
  writeStoredSidebarCollapsed,
  type AppLanguage,
} from "@/context/app-shell-storage";

interface AppShellContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: AppLanguage;
  languageReady: boolean;
  setLanguage: (language: AppLanguage) => void;
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  codeBlockTheme: string;
  setCodeBlockTheme: (theme: string) => void;
  codeBlockShowLineNumbers: boolean;
  setCodeBlockShowLineNumbers: (show: boolean) => void;
  codeBlockWrapLongLines: boolean;
  setCodeBlockWrapLongLines: (wrap: boolean) => void;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return getStoredTheme() ?? getSystemTheme();
  });
  // Always start with "en" to match SSR; hydrate from localStorage after mount
  const [language, setLanguageState] = useState<AppLanguage>("en");
  const [languageReady, setLanguageReady] = useState(false);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(
    () => readStoredActiveSessionId(),
  );
  // Always start expanded to match SSR; hydrate from localStorage after mount
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(false);
  // Code block settings - start with defaults, hydrate from localStorage after mount
  const [codeBlockTheme, setCodeBlockThemeState] = useState<string>(() =>
    readStoredCodeBlockTheme(),
  );
  const [codeBlockShowLineNumbers, setCodeBlockShowLineNumbersState] =
    useState<boolean>(() => readStoredCodeBlockShowLineNumbers());
  const [codeBlockWrapLongLines, setCodeBlockWrapLongLinesState] =
    useState<boolean>(() => readStoredCodeBlockWrapLongLines());

  useEffect(() => {
    // Hydrate client-only preferences after SSR-safe first render.
    setSidebarCollapsedState(readStoredSidebarCollapsed());
    setCodeBlockThemeState(readStoredCodeBlockTheme());
    setCodeBlockShowLineNumbersState(readStoredCodeBlockShowLineNumbers());
    setCodeBlockWrapLongLinesState(readStoredCodeBlockWrapLongLines());
  }, []);

  useEffect(() => {
    // The two language fields are not the same kind of state.
    //
    // Interface locale is a browser preference: adopt the server value only
    // when this browser has never chosen, so a local selection wins. i18n
    // stays disabled (`languageReady`) until that hydrate-or-fetch finishes,
    // with a short fallback so a hung request cannot blank the UI.
    //
    // Model output language is account-level. The public endpoint returns
    // null for it when there is no session (so a login-page visit cannot
    // inherit the admin's French and then pin it in localStorage). Once a
    // session exists the same URL returns the caller's own value, and we
    // always write that through — even if localStorage already holds a
    // leftover from a previous visitor on this browser.
    //
    // AppShell lives on the root layout, so a client-side login does not
    // remount it. Re-run the same fetch on ``SESSION_EVENT`` (login/logout)
    // or the account value only lands after a full refresh.
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const markReady = () => {
      if (!cancelled) setLanguageReady(true);
    };

    const syncFromServer = (options: { initial: boolean }) => {
      const adoptInterface = !hasStoredLanguage();
      const nextController = new AbortController();

      if (options.initial && !adoptInterface) {
        if (!cancelled) {
          setLanguageState(readStoredLanguage());
          setLanguageReady(true);
        }
      } else if (options.initial && adoptInterface) {
        fallbackTimer = setTimeout(() => {
          nextController.abort();
          markReady();
        }, 1_500);
      }

      controller?.abort();
      controller = nextController;

      void (async () => {
        try {
          const response = await apiFetch(apiUrl("/api/v1/settings/ui"), {
            signal: nextController.signal,
            skipAuthRedirect: true,
          });
          if (!response.ok) return;
          const payload = (await response.json()) as {
            language?: unknown;
            response_language?: unknown;
          };
          const interfaceLanguage =
            payload.language === "zh" ||
            payload.language === "en" ||
            payload.language === "fr"
              ? payload.language
              : null;
          if (adoptInterface && interfaceLanguage) {
            writeStoredLanguage(interfaceLanguage);
            if (!cancelled) setLanguageState(interfaceLanguage);
          }
          if (
            payload.response_language === "zh" ||
            payload.response_language === "en" ||
            payload.response_language === "fr"
          ) {
            writeStoredResponseLanguage(payload.response_language);
          } else if (adoptInterface && interfaceLanguage) {
            // Pre-session (or a backend that predates the split): inherit
            // the interface locale so the two fields cannot disagree.
            writeStoredResponseLanguage(
              resolveResponseLanguage(null, interfaceLanguage),
            );
          }
        } catch {
          // Offline or unauthenticated: keep the local default.
        } finally {
          if (options.initial) {
            if (fallbackTimer) clearTimeout(fallbackTimer);
            markReady();
          }
        }
      })();
    };

    syncFromServer({ initial: true });
    const onSession = () => syncFromServer({ initial: false });
    window.addEventListener(SESSION_EVENT, onSession);
    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      controller?.abort();
      window.removeEventListener(SESSION_EVENT, onSession);
    };
  }, []);

  useEffect(() => {
    return subscribeToThemeChanges((nextTheme) => {
      setThemeState(nextTheme);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY) {
        setLanguageState(normalizeLanguage(event.newValue));
      }
      if (event.key === ACTIVE_SESSION_STORAGE_KEY) {
        setActiveSessionIdState(event.newValue);
      }
      if (event.key === SIDEBAR_COLLAPSED_STORAGE_KEY) {
        setSidebarCollapsedState(event.newValue === "1");
      }
      if (event.key === CODE_BLOCK_THEME_STORAGE_KEY) {
        setCodeBlockThemeState(normalizeCodeBlockTheme(event.newValue));
      }
      if (event.key === CODE_BLOCK_SHOW_LINE_NUMBERS_STORAGE_KEY) {
        setCodeBlockShowLineNumbersState(
          normalizeCodeBlockShowLineNumbers(event.newValue),
        );
      }
      if (event.key === CODE_BLOCK_WRAP_LONG_LINES_STORAGE_KEY) {
        setCodeBlockWrapLongLinesState(
          normalizeCodeBlockWrapLongLines(event.newValue),
        );
      }
    };

    const onLanguage = (event: Event) => {
      const detail = (event as CustomEvent<{ language?: AppLanguage }>).detail;
      setLanguageState(normalizeLanguage(detail?.language));
    };

    const onActiveSession = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string | null }>)
        .detail;
      setActiveSessionIdState(detail?.sessionId ?? null);
    };

    const onSidebarCollapsed = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed?: boolean }>).detail;
      setSidebarCollapsedState(Boolean(detail?.collapsed));
    };

    const onCodeBlockSettings = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          codeBlockTheme?: string;
          codeBlockShowLineNumbers?: boolean;
          codeBlockWrapLongLines?: boolean;
        }>
      ).detail;

      if (detail?.codeBlockTheme !== undefined) {
        setCodeBlockThemeState(normalizeCodeBlockTheme(detail.codeBlockTheme));
      }
      if (detail?.codeBlockShowLineNumbers !== undefined) {
        setCodeBlockShowLineNumbersState(
          Boolean(detail.codeBlockShowLineNumbers),
        );
      }
      if (detail?.codeBlockWrapLongLines !== undefined) {
        setCodeBlockWrapLongLinesState(Boolean(detail.codeBlockWrapLongLines));
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(LANGUAGE_EVENT, onLanguage);
    window.addEventListener(ACTIVE_SESSION_EVENT, onActiveSession);
    window.addEventListener(SIDEBAR_COLLAPSED_EVENT, onSidebarCollapsed);
    window.addEventListener(CODE_BLOCK_SETTINGS_EVENT, onCodeBlockSettings);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LANGUAGE_EVENT, onLanguage);
      window.removeEventListener(ACTIVE_SESSION_EVENT, onActiveSession);
      window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, onSidebarCollapsed);
      window.removeEventListener(
        CODE_BLOCK_SETTINGS_EVENT,
        onCodeBlockSettings,
      );
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    applyThemePreference(nextTheme);
    setThemeState(nextTheme);
  }, []);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    writeStoredLanguage(nextLanguage);
    setLanguageState(nextLanguage);
    setLanguageReady(true);
  }, []);

  const setActiveSessionId = useCallback((sessionId: string | null) => {
    writeStoredActiveSessionId(sessionId);
    setActiveSessionIdState(sessionId);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    writeStoredSidebarCollapsed(collapsed);
    setSidebarCollapsedState(collapsed);
  }, []);

  const setCodeBlockTheme = useCallback((nextTheme: string) => {
    const normalizedTheme = normalizeCodeBlockTheme(nextTheme);
    writeStoredCodeBlockTheme(normalizedTheme);
    setCodeBlockThemeState(normalizedTheme);
  }, []);

  const setCodeBlockShowLineNumbers = useCallback((show: boolean) => {
    writeStoredCodeBlockShowLineNumbers(show);
    setCodeBlockShowLineNumbersState(show);
  }, []);

  const setCodeBlockWrapLongLines = useCallback((wrap: boolean) => {
    writeStoredCodeBlockWrapLongLines(wrap);
    setCodeBlockWrapLongLinesState(wrap);
  }, []);

  const value = useMemo<AppShellContextValue>(
    () => ({
      theme,
      setTheme,
      language,
      languageReady,
      setLanguage,
      activeSessionId,
      setActiveSessionId,
      sidebarCollapsed,
      setSidebarCollapsed,
      codeBlockTheme,
      setCodeBlockTheme,
      codeBlockShowLineNumbers,
      setCodeBlockShowLineNumbers,
      codeBlockWrapLongLines,
      setCodeBlockWrapLongLines,
    }),
    [
      activeSessionId,
      codeBlockShowLineNumbers,
      codeBlockTheme,
      codeBlockWrapLongLines,
      language,
      languageReady,
      setActiveSessionId,
      setCodeBlockShowLineNumbers,
      setCodeBlockTheme,
      setCodeBlockWrapLongLines,
      setLanguage,
      setSidebarCollapsed,
      setTheme,
      sidebarCollapsed,
      theme,
    ],
  );

  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used inside AppShellProvider");
  }
  return context;
}
