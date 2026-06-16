/**
 * 全局应用状态管理（主题、语言、AI配置、本地模型状态等）
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getSetting, setSetting, getActiveAiConfig, type AiConfig } from '@/lib/database';
import type { LocalModelConfig } from '@/lib/aiService';
import type { ModelStatus } from '@/lib/localInference';

export type ThemeMode = 'light' | 'dark' | 'system';
export type StudyLanguage = 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'pt' | 'ru';

export interface OcrConfig {
  type: string;
  apiKey: string;
  secretKey: string;
}

export interface LocalModelFile {
  id: string;
  name: string;
  size: number;
  path: string;
  isActive: boolean;
}

interface AppContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  studyLanguage: StudyLanguage;
  setStudyLanguage: (lang: StudyLanguage) => void;
  activeAiConfig: AiConfig | null;
  localAiConfig: LocalModelConfig | null;
  activeLocalFile: LocalModelFile | null;
  refreshAiConfig: () => void;
  ocrConfig: OcrConfig | null;
  setOcrConfig: (cfg: OcrConfig) => void;
  dbReady: boolean;
  // ── 本地模型推理引擎状态 ──────────────────────────────────────────────
  modelStatus: ModelStatus;
  modelError: string;
  modelProgress: number;   // 0~100，加载进度
  loadModel: () => Promise<void>;
  unloadModel: () => Promise<void>;
}

const AppContext = createContext<AppContextType>({
  themeMode: 'system',
  isDark: false,
  setThemeMode: () => {},
  studyLanguage: 'en',
  setStudyLanguage: () => {},
  activeAiConfig: null,
  localAiConfig: null,
  activeLocalFile: null,
  refreshAiConfig: () => {},
  ocrConfig: null,
  setOcrConfig: () => {},
  dbReady: false,
  modelStatus: 'idle',
  modelError: '',
  modelProgress: 0,
  loadModel: async () => {},
  unloadModel: async () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [studyLanguage, setStudyLanguageState] = useState<StudyLanguage>('en');
  const [activeAiConfig, setActiveAiConfig] = useState<AiConfig | null>(null);
  const [localAiConfig, setLocalAiConfig] = useState<LocalModelConfig | null>(null);
  const [activeLocalFile, setActiveLocalFile] = useState<LocalModelFile | null>(null);
  const [ocrConfig, setOcrConfigState] = useState<OcrConfig | null>(null);
  const [dbReady, setDbReady] = useState(false);
  // 本地推理引擎状态
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  const [modelError, setModelError] = useState('');
  const [modelProgress, setModelProgress] = useState(0);
  // 保存最新的 localAiConfig 供 loadModel 用（避免闭包陈旧引用）
  const localAiConfigRef = useRef<LocalModelConfig | null>(null);
  localAiConfigRef.current = localAiConfig;
  const activeLocalFileRef = useRef<LocalModelFile | null>(null);
  activeLocalFileRef.current = activeLocalFile;

  const isDark = themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  /** 从 Settings 加载本地大模型配置 + 激活文件 */
  async function loadLocalConfig() {
    const localRaw = await getSetting('local_model_config', '');
    if (localRaw) {
      try { setLocalAiConfig(JSON.parse(localRaw) as LocalModelConfig); } catch { /* 忽略 */ }
    } else {
      setLocalAiConfig(null);
    }
    const filesRaw = await getSetting('local_model_files_v1', '');
    if (filesRaw) {
      try {
        const files = JSON.parse(filesRaw) as LocalModelFile[];
        setActiveLocalFile(files.find(f => f.isActive) ?? null);
      } catch { /* 忽略 */ }
    } else {
      setActiveLocalFile(null);
    }
  }

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
        await loadLocalConfig();
        setDbReady(true);
      } catch {
        setDbReady(true);
      }
    }
    init();
  }, []);

  // 订阅 localInference 模块的状态变更
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    import('@/lib/localInference').then(({ subscribeModelStatus }) => {
      unsubscribe = subscribeModelStatus((status, error, progress) => {
        setModelStatus(status);
        setModelError(error);
        setModelProgress(progress);
      });
    }).catch(() => {/* 非 prebuild 环境忽略 */});
    return () => { unsubscribe?.(); };
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
    await loadLocalConfig();
  }, []);

  const setOcrConfig = useCallback(async (cfg: OcrConfig) => {
    setOcrConfigState(cfg);
    await setSetting('ocr_config', JSON.stringify(cfg));
  }, []);

  /** 加载激活的本地模型文件 */
  const loadModel = useCallback(async () => {
    const cfg = localAiConfigRef.current;
    const file = activeLocalFileRef.current;
    if (!file) throw new Error('没有激活的模型文件');
    const { loadModel: _load } = await import('@/lib/localInference');
    await _load(file.path, {
      nGpuLayers: cfg?.computeBackend === 'cpu' ? 0 : (cfg?.nGpuLayers ?? 0),
      nThreads: cfg?.nThreads ?? 4,
      contextSize: cfg?.contextSize ?? 2048,
    });
  }, []);

  /** 卸载当前模型 */
  const unloadModel = useCallback(async () => {
    const { unloadModel: _unload } = await import('@/lib/localInference');
    await _unload();
  }, []);

  return (
    <AppContext.Provider value={{
      themeMode, isDark, setThemeMode,
      studyLanguage, setStudyLanguage,
      activeAiConfig, localAiConfig, activeLocalFile, refreshAiConfig,
      ocrConfig, setOcrConfig,
      dbReady,
      modelStatus, modelError, modelProgress,
      loadModel, unloadModel,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
