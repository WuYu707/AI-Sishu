/**
 * 全局应用状态管理（主题、语言、AI配置等）
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getSetting, setSetting, getActiveAiConfig, type AiConfig } from '@/lib/database';

export type ThemeMode = 'light' | 'dark' | 'system';
export type StudyLanguage = 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'pt' | 'ru';

export interface OcrConfig {
  type: string;
  apiKey: string;
  secretKey: string;
}

interface AppContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  studyLanguage: StudyLanguage;
  setStudyLanguage: (lang: StudyLanguage) => void;
  activeAiConfig: AiConfig | null;
  refreshAiConfig: () => void;
  ocrConfig: OcrConfig | null;
  setOcrConfig: (cfg: OcrConfig) => void;
  dbReady: boolean;
}

const AppContext = createContext<AppContextType>({
  themeMode: 'system',
  isDark: false,
  setThemeMode: () => {},
  studyLanguage: 'en',
  setStudyLanguage: () => {},
  activeAiConfig: null,
  refreshAiConfig: () => {},
  ocrConfig: null,
  setOcrConfig: () => {},
  dbReady: false,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [studyLanguage, setStudyLanguageState] = useState<StudyLanguage>('en');
  const [activeAiConfig, setActiveAiConfig] = useState<AiConfig | null>(null);
  const [ocrConfig, setOcrConfigState] = useState<OcrConfig | null>(null);
  const [dbReady, setDbReady] = useState(false);

  const isDark = themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  useEffect(() => {
    async function init() {
      try {
        const theme = await getSetting('theme_mode', 'system') as ThemeMode;
        const lang = await getSetting('study_language', 'en') as StudyLanguage;
        setThemeModeState(theme);
        setStudyLanguageState(lang);
        const cfg = await getActiveAiConfig();
        setActiveAiConfig(cfg);
        const ocrRaw = await getSetting('ocr_config', '');
        if (ocrRaw) setOcrConfigState(JSON.parse(ocrRaw));
        setDbReady(true);
      } catch {
        setDbReady(true);
      }
    }
    init();
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await setSetting('theme_mode', mode);
  }, []);

  const setStudyLanguage = useCallback(async (lang: StudyLanguage) => {
    setStudyLanguageState(lang);
    await setSetting('study_language', lang);
  }, []);

  const refreshAiConfig = useCallback(async () => {
    const cfg = await getActiveAiConfig();
    setActiveAiConfig(cfg);
  }, []);

  const setOcrConfig = useCallback(async (cfg: OcrConfig) => {
    setOcrConfigState(cfg);
    await setSetting('ocr_config', JSON.stringify(cfg));
  }, []);

  return (
    <AppContext.Provider value={{
      themeMode, isDark, setThemeMode,
      studyLanguage, setStudyLanguage,
      activeAiConfig, refreshAiConfig,
      ocrConfig, setOcrConfig,
      dbReady,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
