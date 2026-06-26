/**
 * AI服务配置页 - 在线AI服务
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Modal,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getAiConfigs, saveAiConfig, deleteAiConfig, setActiveAiConfig, type AiConfig } from '@/lib/database';
import { fetch } from 'expo/fetch';

// ─── 在线AI预设 ───────────────────────────────────────────
const AI_PRESETS = [
  { name: 'DeepSeek', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { name: '自定义', endpoint: '', model: '' },
];

export default function AiConfigScreen() {
  const router = useRouter();
  const { isDark, refreshAiConfig } = useAppContext();

  // ── 在线AI状态 ──
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [loadingOnline, setLoadingOnline] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', apiKey: '', endpoint: '', model: '' });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; msg: string }>>({});

  // ── 主题 ──
  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputTextColor = isDark ? '#fff' : '#1a2a3a';

  useFocusEffect(useCallback(() => {
    loadOnline();
  }, []));

  async function loadOnline() {
    setLoadingOnline(true);
    setConfigs(await getAiConfigs());
    setLoadingOnline(false);
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
