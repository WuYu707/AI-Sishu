/**
 * AI服务配置页 - 在线AI服务 + 本地大模型（HTTP 服务 & 本地文件导入）
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Modal, Switch,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getAiConfigs, saveAiConfig, deleteAiConfig, setActiveAiConfig, getSetting, setSetting, type AiConfig } from '@/lib/database';
import { fetch } from 'expo/fetch';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { LocalModelConfig } from '@/lib/aiService';

// ─── 在线AI预设 ───────────────────────────────────────────
const AI_PRESETS = [
  { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  { name: 'Moonshot', endpoint: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
];

// ─── 本地服务预设 ──────────────────────────────────────────
const LOCAL_PRESETS = [
  { name: 'Ollama', endpoint: 'http://127.0.0.1:11434/v1', model: 'llama3', hint: '需先运行 ollama serve' },
  { name: 'LM Studio', endpoint: 'http://127.0.0.1:1234/v1', model: 'local-model', hint: '在 LM Studio 中启动本地服务器' },
  { name: '自定义', endpoint: '', model: '', hint: '填写本地服务的 OpenAI 兼容接口地址' },
];

type Priority = 'local_first' | 'online_first' | 'online_only';
type Tab = 'online' | 'local';

const DEFAULT_LOCAL: LocalModelConfig = {
  enabled: false,
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'llama3',
  apiKey: '',
  priority: 'local_first',
  localSubMode: 'file',
  fileEndpoint: 'http://127.0.0.1:11434/v1',
  fileApiKey: '',
  computeBackend: 'auto',
  nGpuLayers: 0,
  nThreads: 4,
  contextSize: 2048,
};

// ─── 本地模型文件类型 ──────────────────────────────────────
interface LocalModelFile {
  id: string;
  name: string;
  size: number;   // bytes
  path: string;
  isActive: boolean;
}
const LOCAL_FILES_STORAGE = 'local_model_files_v1';

type LocalSubTab = 'http' | 'file';

export default function AiConfigScreen() {
  const router = useRouter();
  const { isDark, refreshAiConfig, modelStatus, modelError, modelProgress, loadModel, unloadModel, activeLocalFile } = useAppContext();

  const [activeTab, setActiveTab] = useState<Tab>('online');

  // ── 在线AI状态 ──
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [loadingOnline, setLoadingOnline] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', apiKey: '', endpoint: '', model: '' });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; msg: string }>>({});

  // ── 本地模型状态 ──
  const [local, setLocal] = useState<LocalModelConfig>(DEFAULT_LOCAL);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [savingLocal, setSavingLocal] = useState(false);
  const [localSaveMsg, setLocalSaveMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingLocal, setTestingLocal] = useState(false);
  const [localTestResult, setLocalTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // 子 Tab：HTTP 服务 / 本地文件（默认本地文件）
  const [localSubTab, setLocalSubTab] = useState<LocalSubTab>('file');
  // 本地模型文件
  const [localFiles, setLocalFiles] = useState<LocalModelFile[]>([]);
  const [importingFile, setImportingFile] = useState(false);
  const [fileStatusMsg, setFileStatusMsg] = useState('');
  // 文件模式推理测试
  const [testingFileInfer, setTestingFileInfer] = useState(false);
  const [fileInferResult, setFileInferResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // 文件模式推理端点配置（独立编辑态，不影响 local.fileEndpoint 直到保存）
  const [fileEndpointEdit, setFileEndpointEdit] = useState('http://127.0.0.1:11434/v1');
  const [fileApiKeyEdit, setFileApiKeyEdit] = useState('');
  // 引擎设置 — 自定义数值模式
  const GPU_PRESETS = [0, 20, 40, 99];
  const THREAD_PRESETS = [1, 2, 4, 6, 8];
  const CTX_PRESETS = [512, 1024, 2048, 4096];
  const [gpuCustomMode, setGpuCustomMode] = useState(false);
  const [threadsCustomMode, setThreadsCustomMode] = useState(false);
  const [ctxCustomMode, setCtxCustomMode] = useState(false);
  const [gpuCustomText, setGpuCustomText] = useState('');
  const [threadsCustomText, setThreadsCustomText] = useState('');
  const [ctxCustomText, setCtxCustomText] = useState('');

  // ── 主题 ──
  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputTextColor = isDark ? '#fff' : '#1a2a3a';

  useFocusEffect(useCallback(() => {
    loadOnline();
    loadLocal();
  }, []));

  async function loadOnline() {
    setLoadingOnline(true);
    setConfigs(await getAiConfigs());
    setLoadingOnline(false);
  }

  async function loadLocal() {
    setLoadingLocal(true);
    try {
      const raw = await getSetting('local_model_config', '');
      if (raw) {
        const parsed = { ...DEFAULT_LOCAL, ...JSON.parse(raw) as LocalModelConfig };
        setLocal(parsed);
        setFileEndpointEdit(parsed.fileEndpoint || 'http://127.0.0.1:11434/v1');
        setFileApiKeyEdit(parsed.fileApiKey || '');
        // 同步子 Tab 到已保存的模式
        if (parsed.localSubMode) setLocalSubTab(parsed.localSubMode);
        // 若保存值不在预设中，自动进入自定义模式
        const gl = parsed.nGpuLayers ?? 0;
        const nt = parsed.nThreads ?? 4;
        const cs = parsed.contextSize ?? 2048;
        if (![0, 20, 40, 99].includes(gl)) { setGpuCustomMode(true); setGpuCustomText(String(gl)); }
        if (![1, 2, 4, 6, 8].includes(nt)) { setThreadsCustomMode(true); setThreadsCustomText(String(nt)); }
        if (![512, 1024, 2048, 4096].includes(cs)) { setCtxCustomMode(true); setCtxCustomText(String(cs)); }
      }
      const rawFiles = await getSetting(LOCAL_FILES_STORAGE, '');
      if (rawFiles) setLocalFiles(JSON.parse(rawFiles) as LocalModelFile[]);
    } catch { /* 忽略 */ }
    setLoadingLocal(false);
  }

  // ── 本地文件导入 ──
  async function handleImportFile() {
    setImportingFile(true);
    setFileStatusMsg('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) { setImportingFile(false); return; }
      const asset = result.assets[0];
      const filename = asset.name ?? `model_${Date.now()}.gguf`;
      if (!filename.toLowerCase().endsWith('.gguf')) {
        setFileStatusMsg('仅支持 .gguf 格式的模型文件');
        setImportingFile(false);
        return;
      }
      if (localFiles.find(m => m.name === filename)) {
        setFileStatusMsg('同名模型已存在，请先删除旧版本');
        setImportingFile(false);
        return;
      }
      const destDir = FileSystem.documentDirectory + 'models/';
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const destPath = destDir + filename;
      await FileSystem.copyAsync({ from: asset.uri, to: destPath });
      const info = await FileSystem.getInfoAsync(destPath);
      const newModel: LocalModelFile = {
        id: Date.now().toString(),
        name: filename,
        size: (info as any).size ?? 0,
        path: destPath,
        isActive: localFiles.length === 0,
      };
      const updated = [...localFiles, newModel];
      setLocalFiles(updated);
      await setSetting(LOCAL_FILES_STORAGE, JSON.stringify(updated));
      setFileStatusMsg(`✓ 已导入「${filename}」${localFiles.length === 0 ? '，已自动激活' : ''}`);
    } catch (e: any) {
      setFileStatusMsg('导入失败：' + (e?.message ?? ''));
    } finally {
      setImportingFile(false);
    }
  }

  async function handleActivateFile(id: string) {
    const updated = localFiles.map(m => ({ ...m, isActive: m.id === id }));
    setLocalFiles(updated);
    await setSetting(LOCAL_FILES_STORAGE, JSON.stringify(updated));

    // 激活文件后，自动将 localAiConfig 切换到文件模式
    const activatedFile = updated.find(m => m.id === id);
    if (activatedFile) {
      // 从文件名提取模型名（去掉路径、扩展名、特殊字符）
      const modelName = activatedFile.name.replace(/\.gguf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
      const toSave: LocalModelConfig = {
        ...local,
        localSubMode: 'file',
        localFilePath: activatedFile.path,
        localFileModel: modelName,
        fileEndpoint: fileEndpointEdit || 'http://127.0.0.1:11434/v1',
        fileApiKey: fileApiKeyEdit,
        enabled: true,   // 激活文件时自动启用本地大模型
      };
      setLocal(toSave);
      await setSetting('local_model_config', JSON.stringify(toSave));
      await refreshAiConfig();
      setFileStatusMsg(`✓ 已激活「${activatedFile.name}」→ 模型名：${modelName}`);
      setFileInferResult(null);
    }
  }

  // 文件模式推理测试：向推理服务发送一条测试消息
  async function handleTestFileInfer() {
    const activeFile = localFiles.find(f => f.isActive);
    if (!activeFile) {
      setFileInferResult({ ok: false, msg: '请先激活一个模型文件' });
      return;
    }
    const modelName = activeFile.name.replace(/\.gguf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
    const base = (fileEndpointEdit || 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
    const chatEp = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
    setTestingFileInfer(true);
    setFileInferResult(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (fileApiKeyEdit.trim()) headers['Authorization'] = 'Bearer ' + fileApiKeyEdit.trim();
      const res = await fetch(chatEp, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });
      if (res.ok) {
        setFileInferResult({ ok: true, msg: `✓ 推理成功！模型「${modelName}」已就绪` });
        // 同步保存配置
        const toSave: LocalModelConfig = {
          ...local,
          localSubMode: 'file',
          localFilePath: activeFile.path,
          localFileModel: modelName,
          fileEndpoint: fileEndpointEdit,
          fileApiKey: fileApiKeyEdit,
          enabled: true,
        };
        setLocal(toSave);
        await setSetting('local_model_config', JSON.stringify(toSave));
        await refreshAiConfig();
      } else {
        const body = await res.text().catch(() => '');
        setFileInferResult({ ok: false, msg: `状态码 ${res.status}${body ? '：' + body.slice(0, 120) : ''}` });
      }
    } catch (e: any) {
      setFileInferResult({ ok: false, msg: '连接失败：' + (e?.message ?? '请确认推理服务已启动') });
    } finally {
      setTestingFileInfer(false);
    }
  }

  async function handleDeleteFile(id: string) {
    const target = localFiles.find(m => m.id === id);
    if (target) {
      await FileSystem.deleteAsync(target.path, { idempotent: true }).catch(() => {});
    }
    const updated = localFiles.filter(m => m.id !== id);
    setLocalFiles(updated);
    await setSetting(LOCAL_FILES_STORAGE, JSON.stringify(updated));
    setFileStatusMsg(target ? `已删除「${target.name}」` : '');
  }

  function formatBytes(bytes: number) {
    if (!bytes) return '未知大小';
    if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  }

  // ──────────────────────────────────────────────
  // 在线AI操作
  // ──────────────────────────────────────────────
  async function handleSaveOnline() {
    if (!form.name.trim() || !form.apiKey.trim() || !form.endpoint.trim() || !form.model.trim()) {
      setErrorMsg('请填写完整配置信息');
      return;
    }
    setSaving(true);
    try {
      await saveAiConfig({
        name: form.name.trim(),
        api_key_enc: form.apiKey.trim(),
        endpoint: form.endpoint.trim(),
        model: form.model.trim(),
        is_active: configs.length === 0 ? 1 : 0,
      });
      await loadOnline();
      await refreshAiConfig();
      setShowAdd(false);
      setForm({ name: '', apiKey: '', endpoint: '', model: '' });
      setErrorMsg('');
    } catch (e: any) {
      setErrorMsg('保存失败：' + e?.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive(id: number) {
    await setActiveAiConfig(id);
    await loadOnline();
    await refreshAiConfig();
  }

  async function handleDeleteOnline(id: number) {
    await deleteAiConfig(id);
    await loadOnline();
    await refreshAiConfig();
  }

  async function handleTestOnline(cfg: AiConfig) {
    if (!cfg.id) return;
    setTestingId(cfg.id);
    setTestResults(prev => ({ ...prev, [cfg.id!]: { ok: false, msg: '' } }));
    try {
      const base = cfg.endpoint.replace(/\/(chat\/completions)?$/, '');
      const res = await fetch(base + '/models', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + cfg.api_key_enc },
      });
      if (res.ok) {
        setTestResults(prev => ({ ...prev, [cfg.id!]: { ok: true, msg: '连接成功，API 可用' } }));
      } else {
        const body = await res.text().catch(() => '');
        setTestResults(prev => ({
          ...prev,
          [cfg.id!]: { ok: false, msg: `状态码 ${res.status}${body ? '：' + body.slice(0, 80) : ''}` },
        }));
      }
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [cfg.id!]: { ok: false, msg: '网络异常：' + (e?.message ?? '') } }));
    } finally {
      setTestingId(null);
    }
  }

  // ──────────────────────────────────────────────
  // 本地模型操作
  // ──────────────────────────────────────────────
  async function handleSaveLocal() {
    if (!local.endpoint.trim() || !local.model.trim()) {
      setLocalSaveMsg({ ok: false, msg: '请填写服务地址和模型名称' });
      return;
    }
    setSavingLocal(true);
    try {
      const toSave: LocalModelConfig = {
        ...local,
        endpoint: local.endpoint.trim(),
        model: local.model.trim(),
        apiKey: local.apiKey.trim(),
        localSubMode: 'http',  // 在 HTTP Tab 保存时固定 http 模式
      };
      await setSetting('local_model_config', JSON.stringify(toSave));
      await refreshAiConfig();
      setLocalSaveMsg({ ok: true, msg: '✓ HTTP 服务配置已保存' });
    } catch (e: any) {
      setLocalSaveMsg({ ok: false, msg: '保存失败：' + (e?.message ?? '') });
    } finally {
      setSavingLocal(false);
      setTimeout(() => setLocalSaveMsg(null), 3000);
    }
  }

  async function handleTestLocal() {
    if (!local.endpoint.trim() || !local.model.trim()) {
      setLocalTestResult({ ok: false, msg: '请先填写服务地址和模型名称' });
      return;
    }
    setTestingLocal(true);
    setLocalTestResult(null);
    try {
      const base = local.endpoint.replace(/\/(chat\/completions)?$/, '');
      const headers: Record<string, string> = {};
      if (local.apiKey.trim()) headers['Authorization'] = 'Bearer ' + local.apiKey.trim();
      const res = await fetch(base + '/models', { method: 'GET', headers });
      if (res.ok) {
        setLocalTestResult({ ok: true, msg: `连接成功！本地服务可用` });
      } else {
        const body = await res.text().catch(() => '');
        setLocalTestResult({ ok: false, msg: `状态码 ${res.status}${body ? '：' + body.slice(0, 100) : ''}` });
      }
    } catch (e: any) {
      setLocalTestResult({ ok: false, msg: '连接失败：' + (e?.message ?? '检查服务是否已启动') });
    } finally {
      setTestingLocal(false);
    }
  }

  const tabBtnBase = 'flex-1 py-2.5 items-center rounded-xl';
  const tabActive = 'bg-[#2C5F8A]';
  const tabInactive = isDark ? 'bg-[#2A2A2A]' : 'bg-gray-100';

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
          <View className="px-5 py-5">

            {/* 顶部导航 */}
            <View className="flex-row items-center gap-3 mb-6">
              <Pressable onPress={() => router.back()} className="p-1 -ml-1">
                <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
              </Pressable>
              <Text className={`text-xl font-bold ${textColor}`}>AI 服务配置</Text>
            </View>

            {/* Tab 切换 */}
            <View className={`flex-row gap-2 p-1 rounded-2xl mb-6 ${isDark ? 'bg-[#252525]' : 'bg-gray-100'}`}>
              <Pressable onPress={() => setActiveTab('online')} className={`${tabBtnBase} ${activeTab === 'online' ? tabActive : tabInactive}`}>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="cloud-outline" size={15} color={activeTab === 'online' ? '#fff' : (isDark ? '#888' : '#666')} />
                  <Text className={`text-sm font-semibold ${activeTab === 'online' ? 'text-white' : subText}`}>在线 AI 服务</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setActiveTab('local')} className={`${tabBtnBase} ${activeTab === 'local' ? tabActive : tabInactive}`}>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="hardware-chip-outline" size={15} color={activeTab === 'local' ? '#fff' : (isDark ? '#888' : '#666')} />
                  <Text className={`text-sm font-semibold ${activeTab === 'local' ? 'text-white' : subText}`}>本地大模型</Text>
                </View>
              </Pressable>
            </View>

            {/* ════════════ 在线AI Panel ════════════ */}
            {activeTab === 'online' && (
              <View>
                <Text className={`text-sm mb-4 ${subText}`}>配置 API Key 后即可使用 AI 功能，Key 仅本地加密存储</Text>

                {loadingOnline ? (
                  <ActivityIndicator color="#2C5F8A" />
                ) : configs.length === 0 ? (
                  <View className={`rounded-2xl border p-8 items-center mb-5 ${card}`} style={{ borderCurve: 'continuous' }}>
                    <Ionicons name="cloud-offline-outline" size={48} color={isDark ? '#555' : '#ccc'} />
                    <Text className={`text-sm mt-3 ${subText}`}>暂无 AI 服务配置</Text>
                  </View>
                ) : (
                  <View className="gap-3 mb-5">
                    {configs.map(cfg => (
                      <View key={cfg.id} className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
                        <View className="flex-row items-center justify-between mb-1">
                          <View className="flex-row items-center gap-2">
                            <Text className={`text-sm font-semibold ${textColor}`}>{cfg.name}</Text>
                            {cfg.is_active ? (
                              <View className="px-2 py-0.5 bg-green-100 rounded-full">
                                <Text className="text-green-600 text-xs font-medium">当前使用</Text>
                              </View>
                            ) : null}
                          </View>
                          <View className="flex-row gap-3 items-center">
                            {!cfg.is_active && (
                              <Pressable onPress={() => handleSetActive(cfg.id!)}>
                                <Text className="text-[#2C5F8A] text-xs font-medium">启用</Text>
                              </Pressable>
                            )}
                            <Pressable onPress={() => handleDeleteOnline(cfg.id!)}>
                              <Ionicons name="trash-outline" size={16} color="#EF4444" />
                            </Pressable>
                          </View>
                        </View>
                        <Text className={`text-xs ${subText}`}>{cfg.endpoint}</Text>
                        <Text className={`text-xs mb-3 ${subText}`}>模型：{cfg.model}</Text>
                        <Pressable
                          onPress={() => handleTestOnline(cfg)}
                          disabled={testingId === cfg.id}
                          className={`py-2.5 rounded-xl items-center border ${
                            testResults[cfg.id!]?.ok === true
                              ? (isDark ? 'border-green-700 bg-green-950/40' : 'border-green-300 bg-green-50')
                              : testResults[cfg.id!]?.ok === false
                              ? (isDark ? 'border-red-700 bg-red-950/40' : 'border-red-300 bg-red-50')
                              : (isDark ? 'border-[#444]' : 'border-gray-200')
                          }`}
                        >
                          {testingId === cfg.id ? (
                            <View className="flex-row items-center gap-2">
                              <ActivityIndicator size="small" color="#2C5F8A" />
                              <Text className={`text-xs ${subText}`}>测试中...</Text>
                            </View>
                          ) : (
                            <View className="flex-row items-center gap-2">
                              <Ionicons
                                name={testResults[cfg.id!]?.ok === true ? 'checkmark-circle' : testResults[cfg.id!]?.ok === false ? 'close-circle' : 'wifi-outline'}
                                size={14}
                                color={testResults[cfg.id!]?.ok === true ? '#22C55E' : testResults[cfg.id!]?.ok === false ? '#EF4444' : (isDark ? '#888' : '#666')}
                              />
                              <Text className={`text-xs font-medium ${testResults[cfg.id!]?.ok === true ? 'text-green-500' : testResults[cfg.id!]?.ok === false ? 'text-red-500' : textColor}`}>
                                {testResults[cfg.id!]?.ok === true ? '连接成功' : testResults[cfg.id!]?.ok === false ? '连接失败' : '测试连接'}
                              </Text>
                            </View>
                          )}
                        </Pressable>
                        {testResults[cfg.id!]?.msg ? (
                          <Text className={`text-xs mt-1.5 ${testResults[cfg.id!]?.ok ? 'text-green-500' : 'text-red-500'}`}>
                            {testResults[cfg.id!].msg}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={() => { setShowAdd(true); setErrorMsg(''); }}
                  className="py-4 rounded-xl items-center bg-[#2C5F8A]"
                >
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="add" size={16} color="white" />
                    <Text className="text-white font-semibold">添加 AI 服务</Text>
                  </View>
                </Pressable>
              </View>
            )}

            {/* ════════════ 本地大模型 Panel ════════════ */}
            {activeTab === 'local' && (
              <View>
                {loadingLocal ? (
                  <ActivityIndicator color="#2C5F8A" />
                ) : (
                  <>
                    {/* 启用开关 */}
                    <View className={`rounded-2xl border p-4 mb-4 ${card}`} style={{ borderCurve: 'continuous' }}>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 mr-4">
                          <Text className={`text-sm font-semibold ${textColor}`}>启用本地大模型</Text>
                          <Text className={`text-xs mt-0.5 ${subText}`}>开启后 AI 功能将根据优先级使用本地服务</Text>
                        </View>
                        <Switch
                          value={local.enabled}
                          onValueChange={v => setLocal(l => ({ ...l, enabled: v }))}
                          trackColor={{ false: isDark ? '#444' : '#D1D5DB', true: '#2C5F8A' }}
                          thumbColor={local.enabled ? '#fff' : (isDark ? '#888' : '#f4f3f4')}
                        />
                      </View>
                    </View>

                    {/* 子 Tab：HTTP 服务 / 本地文件 */}
                    <View className={`flex-row gap-1.5 p-1 rounded-xl mb-5 ${isDark ? 'bg-[#252525]' : 'bg-gray-100'}`}>
                      {([
                        { key: 'http' as LocalSubTab, label: 'HTTP 服务', icon: 'server-outline' },
                        { key: 'file' as LocalSubTab, label: '本地模型文件', icon: 'folder-open-outline' },
                      ] as const).map(t => (
                        <Pressable
                          key={t.key}
                          onPress={() => {
                            setLocalSubTab(t.key);
                            setLocal(l => ({ ...l, localSubMode: t.key }));
                          }}
                          className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1 ${localSubTab === t.key ? 'bg-[#2C5F8A]' : ''}`}
                        >
                          <Ionicons name={t.icon} size={13} color={localSubTab === t.key ? '#fff' : (isDark ? '#888' : '#666')} />
                          <Text className={`text-xs font-semibold ${localSubTab === t.key ? 'text-white' : subText}`}>{t.label}</Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* ── 子Tab：HTTP 服务 ── */}
                    {localSubTab === 'http' && (
                      <>
                        {/* 说明卡 */}
                        <View className={`rounded-xl p-3 mb-4 ${isDark ? 'bg-[#2C5F8A]/10 border border-[#2C5F8A]/30' : 'bg-blue-50 border border-blue-200'}`}>
                          <Text className={`text-xs leading-5 ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                            支持 Ollama、LM Studio、vLLM 等任意 OpenAI 兼容 HTTP 服务。{'\n'}Ollama 用法：<Text className="font-bold">ollama serve</Text> 后填写下方地址即可使用。
                          </Text>
                        </View>

                        {/* 快速预设 */}
                        <Text className={`text-xs font-semibold mb-2 ${subText}`}>快速选择服务类型</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                          <View className="flex-row gap-2">
                            {LOCAL_PRESETS.map(p => (
                              <Pressable
                                key={p.name}
                                onPress={() => p.endpoint ? setLocal(l => ({ ...l, endpoint: p.endpoint, model: p.model })) : {}}
                                className={`px-3 py-2 rounded-xl border ${isDark ? 'bg-[#333] border-[#444]' : 'bg-white border-gray-200'}`}
                              >
                                <Text className={`text-xs font-medium ${textColor}`}>{p.name}</Text>
                                <Text className={`text-xs ${subText}`} style={{ fontSize: 9 }}>{p.hint}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </ScrollView>

                        {/* 服务地址 */}
                        <Text className={`text-sm font-medium mb-1.5 ${textColor}`}>服务地址（OpenAI 兼容接口）</Text>
                        <TextInput
                          value={local.endpoint}
                          onChangeText={v => setLocal(l => ({ ...l, endpoint: v }))}
                          placeholder="http://127.0.0.1:11434/v1"
                          placeholderTextColor={isDark ? '#555' : '#aaa'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 12 }}
                        />

                        {/* 模型名称 */}
                        <Text className={`text-sm font-medium mb-1.5 ${textColor}`}>模型名称</Text>
                        <TextInput
                          value={local.model}
                          onChangeText={v => setLocal(l => ({ ...l, model: v }))}
                          placeholder="llama3 / qwen2.5 / mistral ..."
                          placeholderTextColor={isDark ? '#555' : '#aaa'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 12 }}
                        />

                        {/* API Key（可选） */}
                        <Text className={`text-sm font-medium mb-1.5 ${textColor}`}>
                          API Key <Text className={`text-xs ${subText}`}>（Ollama 无需填写，LM Studio 可选）</Text>
                        </Text>
                        <TextInput
                          value={local.apiKey}
                          onChangeText={v => setLocal(l => ({ ...l, apiKey: v }))}
                          placeholder="留空即可（Ollama 默认不需要）"
                          placeholderTextColor={isDark ? '#555' : '#aaa'}
                          autoCapitalize="none"
                          secureTextEntry
                          style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 16 }}
                        />

                        {/* 调用优先级 */}
                        <Text className={`text-sm font-semibold mb-2 ${textColor}`}>调用优先级</Text>
                        <View className="gap-2 mb-5">
                          {([
                            { v: 'local_first' as Priority, label: '优先本地', desc: '优先使用本地模型，失败自动降级到在线 AI（默认）' },
                            { v: 'online_first' as Priority, label: '优先在线', desc: '优先在线 AI，失败自动降级到本地模型' },
                            { v: 'online_only' as Priority, label: '仅在线', desc: '始终使用在线 AI，忽略本地配置' },
                          ]).map(opt => (
                            <Pressable
                              key={opt.v}
                              onPress={() => setLocal(l => ({ ...l, priority: opt.v }))}
                              className={`flex-row items-center p-3 rounded-xl border ${
                                local.priority === opt.v
                                  ? (isDark ? 'border-[#2C5F8A] bg-[#2C5F8A]/20' : 'border-[#2C5F8A] bg-blue-50')
                                  : (isDark ? 'border-[#333] bg-[#2A2A2A]' : 'border-gray-200 bg-white')
                              }`}
                            >
                              <View className={`w-4 h-4 rounded-full border-2 mr-3 items-center justify-center ${
                                local.priority === opt.v ? 'border-[#2C5F8A]' : (isDark ? 'border-[#555]' : 'border-gray-300')
                              }`}>
                                {local.priority === opt.v && <View className="w-2 h-2 rounded-full bg-[#2C5F8A]" />}
                              </View>
                              <View className="flex-1">
                                <Text className={`text-sm font-medium ${local.priority === opt.v ? 'text-[#2C5F8A]' : textColor}`}>{opt.label}</Text>
                                <Text className={`text-xs mt-0.5 ${subText}`}>{opt.desc}</Text>
                              </View>
                            </Pressable>
                          ))}
                        </View>

                        {/* 测试连接 */}
                        <Pressable
                          onPress={handleTestLocal}
                          disabled={testingLocal}
                          className={`py-3 rounded-xl items-center border mb-3 ${
                            localTestResult?.ok === true
                              ? (isDark ? 'border-green-700 bg-green-950/40' : 'border-green-300 bg-green-50')
                              : localTestResult?.ok === false
                              ? (isDark ? 'border-red-700 bg-red-950/40' : 'border-red-300 bg-red-50')
                              : (isDark ? 'border-[#444]' : 'border-gray-200')
                          }`}
                        >
                          {testingLocal ? (
                            <View className="flex-row items-center gap-2">
                              <ActivityIndicator size="small" color="#2C5F8A" />
                              <Text className={`text-sm font-medium ${subText}`}>测试中...</Text>
                            </View>
                          ) : (
                            <View className="flex-row items-center gap-2">
                              <Ionicons
                                name={localTestResult?.ok === true ? 'checkmark-circle' : localTestResult?.ok === false ? 'close-circle' : 'flash-outline'}
                                size={16}
                                color={localTestResult?.ok === true ? '#22C55E' : localTestResult?.ok === false ? '#EF4444' : (isDark ? '#888' : '#666')}
                              />
                              <Text className={`text-sm font-medium ${localTestResult?.ok === true ? 'text-green-500' : localTestResult?.ok === false ? 'text-red-500' : textColor}`}>
                                {localTestResult?.ok === true ? '连接成功' : localTestResult?.ok === false ? '连接失败' : '测试本地连接'}
                              </Text>
                            </View>
                          )}
                        </Pressable>
                        {localTestResult?.msg ? (
                          <Text className={`text-xs mb-4 ${localTestResult.ok ? 'text-green-500' : 'text-red-500'}`}>{localTestResult.msg}</Text>
                        ) : null}

                        {/* 保存按钮 */}
                        {localSaveMsg && (
                          <View className={`rounded-xl p-3 mb-3 ${localSaveMsg.ok
                            ? (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200')
                            : (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')}`}>
                            <Text className={`text-xs ${localSaveMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{localSaveMsg.msg}</Text>
                          </View>
                        )}
                        <Pressable
                          onPress={handleSaveLocal}
                          disabled={savingLocal}
                          className={`py-4 rounded-xl items-center mb-4 ${savingLocal ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
                        >
                          {savingLocal
                            ? <ActivityIndicator size="small" color="#aaa" />
                            : <Text className="text-white font-semibold">保存本地大模型配置</Text>
                          }
                        </Pressable>
                      </>
                    )}

                    {/* ── 子Tab：本地模型文件 ── */}
                    {localSubTab === 'file' && (
                      <>
                        {/* 说明卡 */}
                        <View className={`rounded-xl p-3 mb-4 ${isDark ? 'bg-blue-950/40 border border-blue-800/50' : 'bg-blue-50 border border-blue-200'}`}>
                          <View className="flex-row gap-2 items-start">
                            <Ionicons name="information-circle-outline" size={15} color="#2C5F8A" />
                            <Text className={`flex-1 text-xs leading-5 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                              导入 <Text className="font-bold">.gguf</Text> 文件后激活，再通过下方推理服务地址（Ollama 等）进行推理。激活后所有 AI 功能自动优先调用本文件。
                            </Text>
                          </View>
                        </View>

                        {/* 导入按钮 */}
                        <Pressable
                          onPress={handleImportFile}
                          disabled={importingFile}
                          className={`flex-row items-center justify-center gap-2 py-4 rounded-xl mb-3 border-2 border-dashed ${
                            isDark ? 'border-[#444] bg-[#252525]' : 'border-gray-300 bg-gray-50'
                          }`}
                        >
                          {importingFile ? (
                            <>
                              <ActivityIndicator size="small" color="#2C5F8A" />
                              <Text className={`text-sm font-medium ${subText}`}>正在导入...</Text>
                            </>
                          ) : (
                            <>
                              <Ionicons name="document-outline" size={20} color="#2C5F8A" />
                              <Text className="text-sm font-semibold text-[#2C5F8A]">选择并导入 .gguf 模型文件</Text>
                            </>
                          )}
                        </Pressable>

                        {fileStatusMsg ? (
                          <Text className={`text-xs mb-3 ${fileStatusMsg.startsWith('✓') ? 'text-green-500' : 'text-red-500'}`}>{fileStatusMsg}</Text>
                        ) : null}

                        {/* 已导入模型列表 */}
                        {localFiles.length === 0 ? (
                          <View className={`rounded-2xl border p-8 items-center mb-5 ${card}`} style={{ borderCurve: 'continuous' }}>
                            <Ionicons name="folder-open-outline" size={40} color={isDark ? '#444' : '#ddd'} />
                            <Text className={`text-sm mt-3 ${subText}`}>暂无导入的模型文件</Text>
                            <Text className={`text-xs mt-1 ${subText}`}>点击上方按钮导入 .gguf 文件</Text>
                          </View>
                        ) : (
                          <View className="gap-3 mb-5">
                            <Text className={`text-xs font-semibold mb-0.5 ${subText}`}>已导入模型（{localFiles.length} 个）</Text>
                            {localFiles.map(m => {
                              const derivedModel = m.name.replace(/\.gguf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
                              return (
                                <View key={m.id} className={`rounded-2xl border ${m.isActive ? (isDark ? 'border-[#2C5F8A] bg-[#2C5F8A]/10' : 'border-[#2C5F8A] bg-blue-50') : card}`} style={{ borderCurve: 'continuous' }}>
                                  <View className="p-4">
                                    <View className="flex-row items-start justify-between gap-2">
                                      <View className="flex-1">
                                        <View className="flex-row items-center gap-2">
                                          <Ionicons name={m.isActive ? 'checkmark-circle' : 'cube-outline'} size={15} color={m.isActive ? '#22C55E' : (isDark ? '#666' : '#aaa')} />
                                          <Text className={`text-sm font-semibold flex-1 ${m.isActive ? 'text-[#2C5F8A]' : textColor}`} numberOfLines={2}>{m.name}</Text>
                                        </View>
                                        <View className="flex-row items-center gap-3 mt-1.5">
                                          <Text className={`text-xs ${subText}`}>{formatBytes(m.size)}</Text>
                                          <View className={`px-2 py-0.5 rounded-full ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
                                            <Text className={`text-xs font-mono ${subText}`}>{derivedModel}</Text>
                                          </View>
                                        </View>
                                        {m.isActive && (
                                          <View className="flex-row items-center gap-1 mt-1.5">
                                            <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                            <Text className="text-xs text-green-500 font-medium">当前激活 · AI 功能将优先调用此模型</Text>
                                          </View>
                                        )}
                                      </View>
                                      <View className="flex-row gap-3 items-center">
                                        {!m.isActive && (
                                          <Pressable onPress={() => handleActivateFile(m.id)} className="px-3 py-1.5 rounded-lg bg-[#2C5F8A]">
                                            <Text className="text-white text-xs font-semibold">激活</Text>
                                          </Pressable>
                                        )}
                                        <Pressable onPress={() => handleDeleteFile(m.id)}>
                                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                        </Pressable>
                                      </View>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}

                        {/* 推理服务端点配置 */}
                        <View className={`rounded-2xl border p-4 mb-4 ${card}`} style={{ borderCurve: 'continuous' }}>
                          <View className="flex-row items-center gap-2 mb-3">
                            <Ionicons name="server-outline" size={15} color="#2C5F8A" />
                            <Text className={`text-sm font-semibold ${textColor}`}>推理服务地址</Text>
                          </View>
                          <Text className={`text-xs mb-3 leading-4 ${subText}`}>
                            激活模型文件后，需要通过本地推理服务（如 Ollama）加载并推理。填写服务地址，点击"测试推理"验证是否正常。
                          </Text>

                          {/* 快速预设 */}
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                            <View className="flex-row gap-2">
                              {LOCAL_PRESETS.filter(p => p.endpoint).map(p => (
                                <Pressable
                                  key={p.name}
                                  onPress={() => setFileEndpointEdit(p.endpoint)}
                                  className={`px-3 py-1.5 rounded-lg border ${isDark ? 'bg-[#333] border-[#444]' : 'bg-white border-gray-200'}`}
                                >
                                  <Text className={`text-xs font-medium ${textColor}`}>{p.name}</Text>
                                </Pressable>
                              ))}
                            </View>
                          </ScrollView>

                          <Text className={`text-xs font-medium mb-1 ${subText}`}>服务地址</Text>
                          <TextInput
                            value={fileEndpointEdit}
                            onChangeText={setFileEndpointEdit}
                            placeholder="http://127.0.0.1:11434/v1"
                            placeholderTextColor={isDark ? '#555' : '#aaa'}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 10 }}
                          />
                          <Text className={`text-xs font-medium mb-1 ${subText}`}>API Key <Text style={{ fontSize: 10 }}>（Ollama 无需填写）</Text></Text>
                          <TextInput
                            value={fileApiKeyEdit}
                            onChangeText={setFileApiKeyEdit}
                            placeholder="留空即可"
                            placeholderTextColor={isDark ? '#555' : '#aaa'}
                            autoCapitalize="none"
                            secureTextEntry
                            style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 12 }}
                          />

                          {/* Ollama 加载提示 */}
                          {localFiles.find(f => f.isActive) && (
                            <View className={`rounded-lg p-3 mb-3 ${isDark ? 'bg-[#1a1a1a] border border-[#333]' : 'bg-gray-50 border border-gray-200'}`}>
                              <Text className={`text-xs font-medium mb-1 ${textColor}`}>Ollama 加载命令参考：</Text>
                              <Text className={`text-xs font-mono ${isDark ? 'text-green-400' : 'text-green-600'}`} selectable>
                                {`ollama create ${localFiles.find(f => f.isActive)!.name.replace(/\.gguf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()} -f ${localFiles.find(f => f.isActive)!.path}`}
                              </Text>
                            </View>
                          )}

                          {/* 测试推理按钮 */}
                          <Pressable
                            onPress={handleTestFileInfer}
                            disabled={testingFileInfer || !localFiles.find(f => f.isActive)}
                            className={`py-3 rounded-xl items-center border ${
                              fileInferResult?.ok === true
                                ? (isDark ? 'border-green-700 bg-green-950/40' : 'border-green-300 bg-green-50')
                                : fileInferResult?.ok === false
                                ? (isDark ? 'border-red-700 bg-red-950/40' : 'border-red-300 bg-red-50')
                                : !localFiles.find(f => f.isActive)
                                ? (isDark ? 'border-[#333] bg-[#252525]' : 'border-gray-200 bg-gray-50')
                                : (isDark ? 'border-[#444]' : 'border-gray-200')
                            }`}
                          >
                            {testingFileInfer ? (
                              <View className="flex-row items-center gap-2">
                                <ActivityIndicator size="small" color="#2C5F8A" />
                                <Text className={`text-sm font-medium ${subText}`}>测试推理中...</Text>
                              </View>
                            ) : (
                              <View className="flex-row items-center gap-2">
                                <Ionicons
                                  name={fileInferResult?.ok === true ? 'checkmark-circle' : fileInferResult?.ok === false ? 'close-circle' : 'flash-outline'}
                                  size={16}
                                  color={
                                    !localFiles.find(f => f.isActive) ? (isDark ? '#444' : '#ccc') :
                                    fileInferResult?.ok === true ? '#22C55E' :
                                    fileInferResult?.ok === false ? '#EF4444' :
                                    (isDark ? '#888' : '#666')
                                  }
                                />
                                <Text className={`text-sm font-medium ${
                                  !localFiles.find(f => f.isActive) ? (isDark ? 'text-[#444]' : 'text-gray-300') :
                                  fileInferResult?.ok === true ? 'text-green-500' :
                                  fileInferResult?.ok === false ? 'text-red-500' : textColor
                                }`}>
                                  {!localFiles.find(f => f.isActive) ? '请先激活一个模型文件' :
                                    fileInferResult?.ok === true ? '推理测试通过' :
                                    fileInferResult?.ok === false ? '推理测试失败' : '测试推理（发送测试消息）'}
                                </Text>
                              </View>
                            )}
                          </Pressable>
                          {fileInferResult?.msg ? (
                            <Text className={`text-xs mt-2 leading-4 ${fileInferResult.ok ? 'text-green-500' : 'text-red-500'}`}>{fileInferResult.msg}</Text>
                          ) : null}
                        </View>
                      </>
                    )}

                    {/* ── 引擎设置（两个子 Tab 共用） ── */}
                    <View className={`rounded-2xl border p-4 mt-2 mb-4 ${card}`} style={{ borderCurve: 'continuous' }}>
                      <View className="flex-row items-center gap-2 mb-4">
                        <Ionicons name="settings-outline" size={15} color="#2C5F8A" />
                        <Text className={`text-sm font-semibold ${textColor}`}>推理引擎设置</Text>
                      </View>

                      {/* 计算后端 */}
                      <Text className={`text-xs font-medium mb-2 ${subText}`}>计算后端</Text>
                      <View className={`flex-row rounded-xl p-1 mb-4 ${isDark ? 'bg-[#1a1a1a]' : 'bg-gray-100'}`}>
                        {([
                          { key: 'auto' as const, label: '自动', desc: '优先 GPU' },
                          { key: 'gpu' as const, label: 'GPU', desc: 'Vulkan/Metal' },
                          { key: 'cpu' as const, label: 'CPU', desc: '兼容性最佳' },
                        ]).map(opt => {
                          const active = (local.computeBackend ?? 'auto') === opt.key;
                          return (
                            <Pressable
                              key={opt.key}
                              onPress={() => setLocal(l => ({ ...l, computeBackend: opt.key }))}
                              className={`flex-1 py-2 rounded-lg items-center ${active ? 'bg-[#2C5F8A]' : ''}`}
                            >
                              <Text className={`text-xs font-bold ${active ? 'text-white' : textColor}`}>{opt.label}</Text>
                              <Text className={`text-[10px] mt-0.5 ${active ? 'text-blue-200' : subText}`}>{opt.desc}</Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {/* GPU 层数（仅 auto/gpu 显示） */}
                      {(local.computeBackend ?? 'auto') !== 'cpu' && (
                        <View className="mb-4">
                          <View className="flex-row justify-between items-center mb-1">
                            <Text className={`text-xs font-medium ${subText}`}>GPU 卸载层数</Text>
                            <Text className={`text-xs font-mono font-semibold ${textColor}`}>{local.nGpuLayers ?? 0}</Text>
                          </View>
                          <View className="flex-row gap-2 flex-wrap">
                            {GPU_PRESETS.map(v => (
                              <Pressable
                                key={v}
                                onPress={() => { setLocal(l => ({ ...l, nGpuLayers: v })); setGpuCustomMode(false); }}
                                className={`flex-1 py-1.5 rounded-lg items-center border ${(!gpuCustomMode && (local.nGpuLayers ?? 0) === v) ? 'bg-[#2C5F8A] border-[#2C5F8A]' : (isDark ? 'border-[#444]' : 'border-gray-200')}`}
                              >
                                <Text className={`text-xs font-mono font-medium ${(!gpuCustomMode && (local.nGpuLayers ?? 0) === v) ? 'text-white' : textColor}`}>
                                  {v === 0 ? 'CPU' : v === 99 ? '全部' : String(v)}
                                </Text>
                              </Pressable>
                            ))}
                            <Pressable
                              onPress={() => { setGpuCustomMode(true); setGpuCustomText(String(local.nGpuLayers ?? 0)); }}
                              className={`flex-1 py-1.5 rounded-lg items-center border ${gpuCustomMode ? 'bg-[#2C5F8A] border-[#2C5F8A]' : (isDark ? 'border-[#444]' : 'border-gray-200')}`}
                            >
                              <Text className={`text-xs font-mono font-medium ${gpuCustomMode ? 'text-white' : textColor}`}>自定义</Text>
                            </Pressable>
                          </View>
                          {gpuCustomMode && (
                            <TextInput
                              className={`mt-2 rounded-lg px-3 py-2 text-sm font-mono border ${isDark ? 'bg-[#1a1a1a] border-[#555] text-white' : 'bg-gray-50 border-gray-300 text-[#1a2a3a]'}`}
                              keyboardType="numeric"
                              placeholder="输入层数 (0-999)"
                              placeholderTextColor={isDark ? '#666' : '#aaa'}
                              value={gpuCustomText}
                              onChangeText={t => {
                                setGpuCustomText(t);
                                const n = parseInt(t, 10);
                                if (!isNaN(n) && n >= 0 && n <= 999) setLocal(l => ({ ...l, nGpuLayers: n }));
                              }}
                            />
                          )}
                          <Text className={`text-[10px] mt-1.5 ${subText}`}>99 = 所有层推给 GPU（最大加速）；0 = 纯 CPU</Text>
                        </View>
                      )}

                      {/* CPU 线程数 */}
                      <View className="mb-4">
                        <View className="flex-row justify-between items-center mb-1">
                          <Text className={`text-xs font-medium ${subText}`}>CPU 线程数</Text>
                          <Text className={`text-xs font-mono font-semibold ${textColor}`}>{local.nThreads ?? 4}</Text>
                        </View>
                        <View className="flex-row gap-2 flex-wrap">
                          {THREAD_PRESETS.map(v => (
                            <Pressable
                              key={v}
                              onPress={() => { setLocal(l => ({ ...l, nThreads: v })); setThreadsCustomMode(false); }}
                              className={`flex-1 py-1.5 rounded-lg items-center border ${(!threadsCustomMode && (local.nThreads ?? 4) === v) ? 'bg-[#2C5F8A] border-[#2C5F8A]' : (isDark ? 'border-[#444]' : 'border-gray-200')}`}
                            >
                              <Text className={`text-xs font-mono font-medium ${(!threadsCustomMode && (local.nThreads ?? 4) === v) ? 'text-white' : textColor}`}>{v}</Text>
                            </Pressable>
                          ))}
                          <Pressable
                            onPress={() => { setThreadsCustomMode(true); setThreadsCustomText(String(local.nThreads ?? 4)); }}
                            className={`flex-1 py-1.5 rounded-lg items-center border ${threadsCustomMode ? 'bg-[#2C5F8A] border-[#2C5F8A]' : (isDark ? 'border-[#444]' : 'border-gray-200')}`}
                          >
                            <Text className={`text-xs font-mono font-medium ${threadsCustomMode ? 'text-white' : textColor}`}>自定义</Text>
                          </Pressable>
                        </View>
                        {threadsCustomMode && (
                          <TextInput
                            className={`mt-2 rounded-lg px-3 py-2 text-sm font-mono border ${isDark ? 'bg-[#1a1a1a] border-[#555] text-white' : 'bg-gray-50 border-gray-300 text-[#1a2a3a]'}`}
                            keyboardType="numeric"
                            placeholder="输入线程数 (1-32)"
                            placeholderTextColor={isDark ? '#666' : '#aaa'}
                            value={threadsCustomText}
                            onChangeText={t => {
                              setThreadsCustomText(t);
                              const n = parseInt(t, 10);
                              if (!isNaN(n) && n >= 1 && n <= 32) setLocal(l => ({ ...l, nThreads: n }));
                            }}
                          />
                        )}
                        <Text className={`text-[10px] mt-1.5 ${subText}`}>建议设为设备 CPU 核心数的一半</Text>
                      </View>

                      {/* 上下文长度 */}
                      <View className="mb-4">
                        <View className="flex-row justify-between items-center mb-1">
                          <Text className={`text-xs font-medium ${subText}`}>上下文长度（tokens）</Text>
                          <Text className={`text-xs font-mono font-semibold ${textColor}`}>{local.contextSize ?? 2048}</Text>
                        </View>
                        <View className="flex-row gap-2 flex-wrap">
                          {CTX_PRESETS.map(v => (
                            <Pressable
                              key={v}
                              onPress={() => { setLocal(l => ({ ...l, contextSize: v })); setCtxCustomMode(false); }}
                              className={`flex-1 py-1.5 rounded-lg items-center border ${(!ctxCustomMode && (local.contextSize ?? 2048) === v) ? 'bg-[#2C5F8A] border-[#2C5F8A]' : (isDark ? 'border-[#444]' : 'border-gray-200')}`}
                            >
                              <Text className={`text-xs font-mono font-medium ${(!ctxCustomMode && (local.contextSize ?? 2048) === v) ? 'text-white' : textColor}`}>{v >= 1024 ? (v / 1024) + 'K' : String(v)}</Text>
                            </Pressable>
                          ))}
                          <Pressable
                            onPress={() => { setCtxCustomMode(true); setCtxCustomText(String(local.contextSize ?? 2048)); }}
                            className={`flex-1 py-1.5 rounded-lg items-center border ${ctxCustomMode ? 'bg-[#2C5F8A] border-[#2C5F8A]' : (isDark ? 'border-[#444]' : 'border-gray-200')}`}
                          >
                            <Text className={`text-xs font-mono font-medium ${ctxCustomMode ? 'text-white' : textColor}`}>自定义</Text>
                          </Pressable>
                        </View>
                        {ctxCustomMode && (
                          <TextInput
                            className={`mt-2 rounded-lg px-3 py-2 text-sm font-mono border ${isDark ? 'bg-[#1a1a1a] border-[#555] text-white' : 'bg-gray-50 border-gray-300 text-[#1a2a3a]'}`}
                            keyboardType="numeric"
                            placeholder="输入 token 数 (128-65536)"
                            placeholderTextColor={isDark ? '#666' : '#aaa'}
                            value={ctxCustomText}
                            onChangeText={t => {
                              setCtxCustomText(t);
                              const n = parseInt(t, 10);
                              if (!isNaN(n) && n >= 128 && n <= 65536) setLocal(l => ({ ...l, contextSize: n }));
                            }}
                          />
                        )}
                        <Text className={`text-[10px] mt-1.5 ${subText}`}>值越大支持更长对话，但占用更多内存</Text>
                      </View>

                      {/* 保存引擎设置按钮 */}
                      <Pressable
                        onPress={async () => {
                          const toSave: LocalModelConfig = {
                            ...local,
                            computeBackend: local.computeBackend ?? 'auto',
                            nGpuLayers: local.computeBackend === 'cpu' ? 0 : (local.nGpuLayers ?? 0),
                            nThreads: local.nThreads ?? 4,
                            contextSize: local.contextSize ?? 2048,
                          };
                          await setSetting('local_model_config', JSON.stringify(toSave));
                          await refreshAiConfig();
                          setLocalSaveMsg({ ok: true, msg: '✓ 引擎设置已保存' });
                          setTimeout(() => setLocalSaveMsg(null), 2500);
                        }}
                        className="py-2.5 rounded-xl items-center bg-[#2C5F8A]"
                      >
                        <Text className="text-white text-sm font-semibold">保存引擎设置</Text>
                      </Pressable>
                    </View>

                    {/* ── 模型加载控制卡片（文件模式专属） ── */}
                    {localSubTab === 'file' && activeLocalFile && (
                      <View className={`rounded-2xl border p-4 mb-6 ${
                        modelStatus === 'ready'
                          ? (isDark ? 'border-green-700 bg-green-950/20' : 'border-green-200 bg-green-50')
                          : modelStatus === 'error'
                          ? (isDark ? 'border-red-700 bg-red-950/20' : 'border-red-200 bg-red-50')
                          : card
                      }`} style={{ borderCurve: 'continuous' }}>
                        <View className="flex-row items-center justify-between mb-3">
                          <View className="flex-row items-center gap-2">
                            <Ionicons
                              name={modelStatus === 'ready' ? 'checkmark-circle' : modelStatus === 'error' ? 'close-circle' : modelStatus === 'loading' ? 'sync' : 'power-outline'}
                              size={16}
                              color={modelStatus === 'ready' ? '#22C55E' : modelStatus === 'error' ? '#EF4444' : modelStatus === 'loading' ? '#2C5F8A' : (isDark ? '#666' : '#aaa')}
                            />
                            <Text className={`text-sm font-semibold ${textColor}`}>推理引擎状态</Text>
                          </View>
                          <View className={`px-2.5 py-1 rounded-full ${
                            modelStatus === 'ready' ? 'bg-green-500' :
                            modelStatus === 'error' ? 'bg-red-500' :
                            modelStatus === 'loading' ? 'bg-[#2C5F8A]' :
                            (isDark ? 'bg-[#333]' : 'bg-gray-200')
                          }`}>
                            <Text className={`text-[11px] font-semibold ${modelStatus === 'idle' ? subText : 'text-white'}`}>
                              {modelStatus === 'ready' ? '已就绪' : modelStatus === 'loading' ? `加载中 ${modelProgress}%` : modelStatus === 'error' ? '加载失败' : '未加载'}
                            </Text>
                          </View>
                        </View>

                        {/* 当前激活文件 */}
                        <View className={`rounded-lg px-3 py-2 mb-3 ${isDark ? 'bg-[#1a1a1a]' : 'bg-gray-50'}`}>
                          <Text className={`text-xs ${subText}`}>当前激活模型</Text>
                          <Text className={`text-sm font-medium mt-0.5 ${textColor}`} numberOfLines={1}>{activeLocalFile.name}</Text>
                        </View>

                        {/* 加载进度条 */}
                        {modelStatus === 'loading' && (
                          <View className="mb-3">
                            <View className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-[#333]' : 'bg-gray-200'}`}>
                              <View className="h-full bg-[#2C5F8A] rounded-full" style={{ width: `${modelProgress}%` }} />
                            </View>
                            <Text className={`text-xs mt-1 text-center ${subText}`}>正在加载模型到内存... {modelProgress}%</Text>
                          </View>
                        )}

                        {/* 错误信息 */}
                        {modelStatus === 'error' && modelError && (
                          <View className={`rounded-xl p-3 mb-3 ${isDark ? 'bg-red-950/30' : 'bg-red-50'}`}>
                            <Text className="text-xs font-semibold text-red-500 mb-1">加载失败原因：</Text>
                            <Text selectable className="text-xs text-red-500 leading-5">{modelError}</Text>
                          </View>
                        )}

                        {/* 操作按钮 */}
                        <View className="flex-row gap-3">
                          {modelStatus !== 'ready' && (
                            <Pressable
                              onPress={async () => {
                                try { await loadModel(); } catch (e: any) { /* AppContext 已更新状态 */ }
                              }}
                              disabled={modelStatus === 'loading'}
                              className={`flex-1 py-3 rounded-xl items-center flex-row justify-center gap-2 ${modelStatus === 'loading' ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
                            >
                              {modelStatus === 'loading'
                                ? <ActivityIndicator size="small" color="#2C5F8A" />
                                : <Ionicons name="play-circle-outline" size={16} color="#fff" />}
                              <Text className={`text-sm font-semibold ${modelStatus === 'loading' ? subText : 'text-white'}`}>
                                {modelStatus === 'loading' ? '加载中...' : '加载模型'}
                              </Text>
                            </Pressable>
                          )}
                          {modelStatus === 'ready' && (
                            <Pressable
                              onPress={unloadModel}
                              className={`flex-1 py-3 rounded-xl items-center flex-row justify-center gap-2 border ${isDark ? 'border-red-700' : 'border-red-300'}`}
                            >
                              <Ionicons name="stop-circle-outline" size={16} color="#EF4444" />
                              <Text className="text-sm font-semibold text-red-500">卸载模型</Text>
                            </Pressable>
                          )}
                          {modelStatus === 'error' && (
                            <Pressable
                              onPress={async () => {
                                try { await loadModel(); } catch { /* 忽略 */ }
                              }}
                              className={`py-3 px-5 rounded-xl items-center border ${isDark ? 'border-[#444]' : 'border-gray-300'}`}
                            >
                              <Text className={`text-sm font-medium ${textColor}`}>重试</Text>
                            </Pressable>
                          )}
                        </View>

                        {modelStatus === 'ready' && (
                          <Text className={`text-xs mt-3 text-center ${subText}`}>
                            模型已加载到内存，所有 AI 功能将优先调用本地引擎 🚀
                          </Text>
                        )}
                        {modelStatus === 'idle' && (
                          <Text className={`text-xs mt-3 text-center ${subText}`}>
                            首次加载可能需要 30–60 秒，请耐心等待{'\n'}
                            ⚠️ 需使用原生构建版本（非 Expo Go）
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 添加在线AI弹窗 */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className={`flex-1 ${bg}`}>
          <View className={`flex-row items-center justify-between px-5 py-4 border-b ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
            <Text className={`text-base font-bold ${textColor}`}>添加 AI 服务</Text>
            <Pressable onPress={() => setShowAdd(false)}>
              <Ionicons name="close" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
            </Pressable>
          </View>
          <ScrollView className="px-5 py-4">
            <Text className={`text-xs font-medium mb-2 ${subText}`}>快速选择</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row gap-2">
                {AI_PRESETS.map(p => (
                  <Pressable
                    key={p.name}
                    onPress={() => setForm(f => ({ ...f, name: p.name, endpoint: p.endpoint, model: p.model }))}
                    className={`px-3 py-2 rounded-xl border ${isDark ? 'bg-[#333] border-[#444]' : 'bg-white border-gray-200'}`}
                  >
                    <Text className={`text-xs font-medium ${textColor}`}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {[
              { key: 'name', label: '名称', placeholder: '如：DeepSeek' },
              { key: 'apiKey', label: 'API Key', placeholder: 'sk-...' },
              { key: 'endpoint', label: 'API Endpoint', placeholder: 'https://api.deepseek.com/v1' },
              { key: 'model', label: '模型名称', placeholder: 'deepseek-chat' },
            ].map(field => (
              <View key={field.key} className="mb-4">
                <Text className={`text-sm font-medium mb-1.5 ${textColor}`}>{field.label}</Text>
                <TextInput
                  value={(form as any)[field.key]}
                  onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))}
                  placeholder={field.placeholder}
                  placeholderTextColor={isDark ? '#555' : '#aaa'}
                  secureTextEntry={field.key === 'apiKey'}
                  autoCapitalize="none"
                  style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 12, padding: 12, fontSize: 14 }}
                />
              </View>
            ))}
            {errorMsg ? <Text className="text-red-500 text-xs mb-3">{errorMsg}</Text> : null}
            <View className="flex-row gap-3 pb-6">
              <Pressable
                onPress={() => { setShowAdd(false); setForm({ name: '', apiKey: '', endpoint: '', model: '' }); setErrorMsg(''); }}
                className={`flex-1 py-4 rounded-xl items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
              >
                <Text className={`font-semibold ${subText}`}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveOnline}
                disabled={saving}
                className={`flex-1 py-4 rounded-xl items-center ${saving ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
              >
                {saving ? <ActivityIndicator size="small" color="#aaa" /> : <Text className="text-white font-semibold">保存</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

