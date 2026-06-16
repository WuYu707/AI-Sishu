/**
 * 首页文案设置页 - API地址配置 + 自定义字段筛选器
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getMottoSettings, saveMottoSettings, type MottoSettings } from '@/lib/database';
import { fetch } from 'expo/fetch';

// 本地默认文案，API失败时回退
const DEFAULT_MOTTOS = [
  '不积跬步，无以至千里。',
  '学如逆水行舟，不进则退。',
  '每天进步一点点，坚持就是胜利。',
  '知识改变命运，学习成就未来。',
];

// ── 与 index.tsx 保持一致的纯工具函数 ──────────────────────────────

function extractByPath(obj: any, path: string): any {
  if (!path.trim()) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function normalizeToStringArray(val: any): string[] {
  if (val == null) return [];
  if (typeof val === 'string') return val.trim() ? [val.trim()] : [];
  if (typeof val === 'number') return [String(val)];
  if (Array.isArray(val)) return val.map((v: any) => String(v).trim()).filter(Boolean);
  return [String(val).trim()].filter(Boolean);
}

function parseMottoList(body: string, contentType: string, settings?: Partial<MottoSettings> | null): string[] {
  const isJson = contentType.includes('application/json') || contentType.includes('text/json');
  if (isJson || body.trim().startsWith('[') || body.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(body);

      // ① 用户自定义字段路径规则（优先级最高）
      if (settings?.contentField?.trim()) {
        const contentVal = extractByPath(parsed, settings.contentField.trim());
        const contents = normalizeToStringArray(contentVal);
        if (contents.length > 0) {
          if (settings?.authorField?.trim()) {
            return contents.map((c, idx) => {
              const baseObj = Array.isArray(parsed) ? parsed[idx] : parsed;
              const author = extractByPath(baseObj, settings.authorField!.trim());
              const authorStr = author != null ? String(author).trim() : '';
              return authorStr ? `${c}  —— ${authorStr}` : c;
            });
          }
          return contents;
        }
      }

      // ② 一言API内置识别
      if (typeof parsed?.yiyan === 'string' && parsed.yiyan.trim()) {
        const nick = typeof parsed.nick === 'string' && parsed.nick.trim() ? `  —— ${parsed.nick.trim()}` : '';
        return [`${parsed.yiyan.trim()}${nick}`];
      }
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => {
          if (typeof item === 'string') return item.trim();
          if (typeof item?.yiyan === 'string') {
            const nick = typeof item.nick === 'string' && item.nick.trim() ? `  —— ${item.nick.trim()}` : '';
            return `${item.yiyan.trim()}${nick}`;
          }
          return String(item).trim();
        }).filter(Boolean);
      }
      if (Array.isArray(parsed?.text)) return parsed.text.map(String).filter(Boolean);
      if (Array.isArray(parsed?.mottos)) return parsed.mottos.map(String).filter(Boolean);
      if (typeof parsed?.text === 'string') return parsed.text.split('\n').map((s: string) => s.trim()).filter(Boolean);
    } catch { /* 降级为纯文本 */ }
  }
  return body.split('\n').map(s => s.trim()).filter(Boolean);
}

/** 将 JSON 对象扁平化为一级路径列表，用于字段路径提示 */
function flattenKeys(obj: any, prefix = '', depth = 0): string[] {
  if (depth > 3 || obj == null || typeof obj !== 'object') return [];
  return Object.keys(obj).flatMap(k => {
    const full = prefix ? `${prefix}.${k}` : k;
    const child = obj[k];
    if (child != null && typeof child === 'object' && !Array.isArray(child) && depth < 2) {
      return [full, ...flattenKeys(child, full, depth + 1)];
    }
    return [full];
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MottoScreen() {
  const router = useRouter();
  const { isDark } = useAppContext();

  const [customMotto, setCustomMotto] = useState('');
  const [remoteApi, setRemoteApi] = useState('');
  const [intervalMin, setIntervalMin] = useState('30');
  const [intervalUnit, setIntervalUnit] = useState<'min' | 'hour'>('min');
  const [contentField, setContentField] = useState('');
  const [authorField, setAuthorField] = useState('');

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; preview?: string[] } | null>(null);

  // 筛选器面板
  const [filterOpen, setFilterOpen] = useState(false);
  const [rawJson, setRawJson] = useState<any>(null);       // API 原始 JSON（测试成功后存入）
  const [rawBody, setRawBody] = useState('');              // 原始响应文本
  const [rawCT, setRawCT] = useState('');                  // 原始 content-type
  const [filterPreview, setFilterPreview] = useState<string[] | null>(null);
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);  // 扁平路径提示

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputTextColor = isDark ? '#fff' : '#1a2a3a';
  const accent = '#2C5F8A';

  useFocusEffect(
    useCallback(() => { loadSettings(); }, [])
  );

  async function loadSettings() {
    const s = await getMottoSettings();
    if (s) {
      setCustomMotto(s.customMotto || '');
      setRemoteApi(s.remoteUrl || '');
      setContentField(s.contentField || '');
      setAuthorField(s.authorField || '');
      const mins = s.intervalMin || 30;
      if (mins >= 60 && mins % 60 === 0) {
        setIntervalUnit('hour');
        setIntervalMin(String(mins / 60));
      } else {
        setIntervalUnit('min');
        setIntervalMin(String(mins));
      }
    }
  }

  // ── 测试 API ──────────────────────────────────────────────────────

  async function handleTestApi() {
    if (!remoteApi.trim()) {
      setTestResult({ ok: false, msg: '请先填写 API 地址' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    setRawJson(null);
    setAvailableKeys([]);
    setFilterPreview(null);
    try {
      const res = await fetch(remoteApi.trim());
      if (!res.ok) {
        setTestResult({ ok: false, msg: `请求失败（状态码 ${res.status}），将自动回退本地默认文案` });
        return;
      }
      const ct = res.headers.get('content-type') ?? '';
      const body = await res.text();
      setRawBody(body);
      setRawCT(ct);

      // 尝试解析 JSON，提取可用字段路径
      try {
        const parsed = JSON.parse(body);
        setRawJson(parsed);
        const keys = flattenKeys(Array.isArray(parsed) ? parsed[0] : parsed);
        setAvailableKeys(keys);
      } catch { /* 纯文本，不展示字段提示 */ }

      const list = parseMottoList(body, ct, { contentField, authorField });
      if (list.length > 0) {
        setTestResult({ ok: true, msg: `获取成功，共 ${list.length} 条文案`, preview: list.slice(0, 3) });
        setFilterOpen(true);   // 自动展开筛选器
      } else {
        setTestResult({ ok: false, msg: 'API 可访问，但未能解析出文案。请配置下方字段筛选器。' });
        setFilterOpen(true);
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: `网络异常：${e?.message ?? '请求失败'}，将自动回退本地默认文案` });
    } finally {
      setTesting(false);
    }
  }

  // ── 筛选器：应用当前规则并重新预览 ──────────────────────────────

  function handleApplyFilter() {
    if (!rawBody) {
      setFilterPreview(['请先点击上方「测试 API」获取响应数据']);
      return;
    }
    const result = parseMottoList(rawBody, rawCT, { contentField, authorField });
    if (result.length > 0) {
      setFilterPreview(result.slice(0, 5));
      // 同步更新测试结果状态
      setTestResult({ ok: true, msg: `筛选成功，共 ${result.length} 条文案`, preview: result.slice(0, 3) });
    } else {
      setFilterPreview(['⚠️ 未提取到内容，请检查字段路径是否正确']);
    }
  }

  // ── 快速填入字段路径 ─────────────────────────────────────────────

  function quickFill(key: string) {
    setContentField(key);
    setFilterPreview(null);
  }

  // ── 保存 ─────────────────────────────────────────────────────────

  async function handleSave() {
    setLoading(true);
    try {
      const mins = intervalUnit === 'hour' ? Number(intervalMin) * 60 : Number(intervalMin);
      await saveMottoSettings({ customMotto, remoteUrl: remoteApi, intervalMin: mins, contentField, authorField });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setTestResult({ ok: false, msg: '保存失败：' + (e?.message || '请重试') });
    } finally {
      setLoading(false);
    }
  }

  // ── 渲染 ─────────────────────────────────────────────────────────

  const filterBg = isDark ? 'bg-[#252525] border-[#3A3A3A]' : 'bg-slate-50 border-slate-200';
  const chipBg = isDark ? '#333' : '#E8EEF5';
  const chipText = isDark ? '#9DC4E8' : '#2C5F8A';

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
              <Text className={`text-xl font-bold ${textColor}`}>首页文案设置</Text>
            </View>

            {/* ── 自定义文案 ───────────────────────────────────── */}
            <Text className={`text-sm font-semibold mb-1 ${textColor}`}>自定义文案</Text>
            <Text className={`text-xs mb-2 ${subText}`}>每行一条，保存后优先于远程 API 显示</Text>
            <TextInput
              value={customMotto}
              onChangeText={setCustomMotto}
              placeholder={'知识改变命运，学习成就未来。\n坚持是成功最重要的因素。'}
              placeholderTextColor={isDark ? '#555' : '#aaa'}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: inputBg, color: inputTextColor,
                borderRadius: 12, padding: 12, fontSize: 14,
                minHeight: 80, textAlignVertical: 'top', marginBottom: 20,
              }}
            />

            {/* ── 远程 API ─────────────────────────────────────── */}
            <View className="flex-row items-center justify-between mb-1">
              <Text className={`text-sm font-semibold ${textColor}`}>远程文案 API 地址</Text>
              <Text className={`text-xs ${subText}`}>可选</Text>
            </View>
            <TextInput
              value={remoteApi}
              onChangeText={v => { setRemoteApi(v); setTestResult(null); setRawJson(null); setFilterPreview(null); }}
              placeholder="https://api.nxvav.cn/api/yiyan"
              placeholderTextColor={isDark ? '#555' : '#aaa'}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                backgroundColor: inputBg, color: inputTextColor,
                borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 6,
              }}
            />

            {/* API 格式说明 */}
            <View className={`rounded-xl p-3 mb-4 ${isDark ? 'bg-[#2A2A2A] border border-[#333]' : 'bg-blue-50 border border-blue-100'}`}>
              <Text className={`text-xs font-semibold mb-1 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                支持的 API 格式
              </Text>
              <Text className={`text-xs leading-5 ${isDark ? 'text-gray-400' : 'text-blue-800'}`}>
                {'• 一言API：{"yiyan":"...", "nick":"..."}\n• JSON 数组：["文案1", "文案2"]\n• JSON 对象：{"text":["文案1",...]}\n• 纯文本（每行一条）\n• 自定义格式：使用下方字段筛选器'}
              </Text>
            </View>

            {/* 测试 API 按钮 */}
            <Pressable
              onPress={handleTestApi}
              disabled={testing}
              className={`py-3 rounded-xl items-center border mb-3 ${
                testResult?.ok === true
                  ? (isDark ? 'border-green-700 bg-green-950/40' : 'border-green-300 bg-green-50')
                  : testResult?.ok === false
                  ? (isDark ? 'border-red-700 bg-red-950/40' : 'border-red-300 bg-red-50')
                  : (isDark ? 'border-[#444]' : 'border-gray-200')
              }`}
            >
              {testing ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={accent} />
                  <Text className={`text-sm font-medium ${subText}`}>检测中...</Text>
                </View>
              ) : (
                <View className="flex-row items-center gap-2">
                  <Ionicons
                    name={testResult?.ok === true ? 'checkmark-circle' : testResult?.ok === false ? 'close-circle' : 'wifi-outline'}
                    size={16}
                    color={testResult?.ok === true ? '#22C55E' : testResult?.ok === false ? '#EF4444' : (isDark ? '#888' : '#666')}
                  />
                  <Text className={`text-sm font-medium ${
                    testResult?.ok === true ? 'text-green-500' : testResult?.ok === false ? 'text-red-500' : textColor
                  }`}>
                    {testResult?.ok === true ? '测试成功' : testResult?.ok === false ? '测试失败（自动回退本地）' : '测试 API'}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* 测试结果详情 */}
            {testResult && (
              <View className={`rounded-xl p-3 mb-4 ${testResult.ok
                ? (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200')
                : (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')
              }`}>
                <Text className={`text-xs leading-5 ${testResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                  {testResult.msg}
                </Text>
                {testResult.preview && testResult.preview.length > 0 && (
                  <View className="mt-2 gap-1">
                    <Text className={`text-xs font-semibold ${isDark ? 'text-green-400' : 'text-green-700'}`}>预览：</Text>
                    {testResult.preview.map((p, i) => (
                      <Text key={i} className={`text-xs ${isDark ? 'text-green-400' : 'text-green-700'}`} numberOfLines={2}>
                        · {p}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ── 字段筛选器 ─────────────────────────────────── */}
            <Pressable
              onPress={() => setFilterOpen(v => !v)}
              className={`rounded-xl border px-4 py-3 mb-1 flex-row items-center justify-between ${filterBg}`}
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="funnel-outline" size={16} color={isDark ? '#9DC4E8' : accent} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#9DC4E8' : accent }}>
                  字段筛选器
                </Text>
                {(contentField.trim()) && (
                  <View style={{ backgroundColor: isDark ? '#1A3A55' : '#DBE9F7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 11, color: isDark ? '#7ABCF0' : accent }}>已配置</Text>
                  </View>
                )}
              </View>
              <Ionicons name={filterOpen ? 'chevron-up' : 'chevron-down'} size={16} color={isDark ? '#666' : '#999'} />
            </Pressable>

            {filterOpen && (
              <View className={`rounded-xl border p-4 mb-4 gap-4 ${filterBg}`} style={{ borderCurve: 'continuous' }}>

                {/* 说明 */}
                <Text className={`text-xs leading-5 ${subText}`}>
                  {'当 API 返回非标准格式时，填写字段路径来指定提取规则。\n支持点号嵌套，如：data.content 或 list[0].text'}
                </Text>

                {/* 可用字段提示（测试成功后显示） */}
                {availableKeys.length > 0 && (
                  <View>
                    <Text className={`text-xs font-semibold mb-2 ${textColor}`}>API 响应中检测到的字段（点击快速填入）</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {availableKeys.map(k => (
                        <Pressable
                          key={k}
                          onPress={() => quickFill(k)}
                          style={{ backgroundColor: chipBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}
                        >
                          <Text style={{ fontSize: 12, color: chipText, fontFamily: 'monospace' }}>{k}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* 原始 JSON 预览 */}
                {rawJson != null && (
                  <View>
                    <Text className={`text-xs font-semibold mb-1 ${textColor}`}>API 原始响应</Text>
                    <ScrollView
                      horizontal
                      style={{
                        backgroundColor: isDark ? '#1a1a1a' : '#F0F4F8',
                        borderRadius: 8, padding: 10, maxHeight: 120,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: isDark ? '#7ABCF0' : '#2C5F8A', fontFamily: 'monospace', lineHeight: 18 }}>
                        {JSON.stringify(rawJson, null, 2)}
                      </Text>
                    </ScrollView>
                  </View>
                )}

                {/* 内容字段路径 */}
                <View>
                  <View className="flex-row items-center gap-1 mb-1">
                    <Ionicons name="text-outline" size={13} color={isDark ? '#7ABCF0' : accent} />
                    <Text className={`text-xs font-semibold ${textColor}`}>文案内容字段路径</Text>
                    <Text className={`text-xs ${subText}`}>（必填）</Text>
                  </View>
                  <TextInput
                    value={contentField}
                    onChangeText={v => { setContentField(v); setFilterPreview(null); }}
                    placeholder="yiyan   或   data.content   或   list[0].text"
                    placeholderTextColor={isDark ? '#555' : '#aaa'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      backgroundColor: inputBg, color: inputTextColor,
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      fontSize: 13, fontFamily: 'monospace',
                    }}
                  />
                </View>

                {/* 作者字段路径 */}
                <View>
                  <View className="flex-row items-center gap-1 mb-1">
                    <Ionicons name="person-outline" size={13} color={isDark ? '#7ABCF0' : accent} />
                    <Text className={`text-xs font-semibold ${textColor}`}>作者/来源字段路径</Text>
                    <Text className={`text-xs ${subText}`}>（可选，显示为 —— 昵称）</Text>
                  </View>
                  <TextInput
                    value={authorField}
                    onChangeText={v => { setAuthorField(v); setFilterPreview(null); }}
                    placeholder="nick   或   data.author（留空则不显示）"
                    placeholderTextColor={isDark ? '#555' : '#aaa'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      backgroundColor: inputBg, color: inputTextColor,
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      fontSize: 13, fontFamily: 'monospace',
                    }}
                  />
                </View>

                {/* 应用并预览 */}
                <Pressable
                  onPress={handleApplyFilter}
                  disabled={!contentField.trim()}
                  style={{
                    backgroundColor: contentField.trim() ? accent : (isDark ? '#333' : '#E5E7EB'),
                    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                  }}
                >
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="play-outline" size={14} color={contentField.trim() ? '#fff' : (isDark ? '#555' : '#aaa')} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: contentField.trim() ? '#fff' : (isDark ? '#555' : '#aaa') }}>
                      应用规则并预览
                    </Text>
                  </View>
                </Pressable>

                {/* 筛选预览结果 */}
                {filterPreview && (
                  <View className={`rounded-xl p-3 ${isDark ? 'bg-[#1a1a1a] border border-[#333]' : 'bg-white border border-slate-200'}`}>
                    <Text className={`text-xs font-semibold mb-2 ${textColor}`}>提取结果预览</Text>
                    {filterPreview.map((p, i) => (
                      <Text key={i} className={`text-xs leading-5 ${subText}`} numberOfLines={2}>
                        {i + 1}. {p}
                      </Text>
                    ))}
                  </View>
                )}

                {/* 常用 API 示例 */}
                <View className={`rounded-xl p-3 ${isDark ? 'bg-[#1a1a1a] border border-[#333]' : 'bg-white border border-slate-200'}`}>
                  <Text className={`text-xs font-semibold mb-2 ${textColor}`}>常用 API 字段参考</Text>
                  {[
                    { name: 'nxvav 一言', content: 'yiyan', author: 'nick' },
                    { name: 'JSON 数组', content: '（无需填写，自动解析）', author: '' },
                    { name: '{"text": [...]}', content: 'text', author: '' },
                    { name: '{"data":{"content":"..."}}', content: 'data.content', author: '' },
                  ].map((ex, i) => (
                    <View key={i} className="flex-row items-start gap-2 mb-1">
                      <Text className={`text-xs ${subText}`} style={{ minWidth: 110 }}>{ex.name}</Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#7ABCF0' : accent, fontFamily: 'monospace', flex: 1 }}>
                        {ex.content}{ex.author ? `  /  ${ex.author}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── 本地默认文案预览 ──────────────────────────── */}
            <View className={`rounded-2xl border p-4 mb-5 ${card}`} style={{ borderCurve: 'continuous' }}>
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="shield-checkmark-outline" size={15} color={isDark ? '#888' : '#9CA3AF'} />
                <Text className={`text-xs font-semibold ${subText}`}>本地默认文案（API 失败时备用）</Text>
              </View>
              {DEFAULT_MOTTOS.slice(0, 2).map((m, i) => (
                <Text key={i} className={`text-xs leading-5 ${subText}`} numberOfLines={1}>· {m}</Text>
              ))}
              <Text className={`text-xs ${subText}`}>...共 {DEFAULT_MOTTOS.length} 条</Text>
            </View>

            {/* ── 切换间隔 ──────────────────────────────────── */}
            <Text className={`text-sm font-semibold mb-2 ${textColor}`}>自动切换间隔</Text>
            <View className="flex-row gap-2 mb-6 items-center">
              <TextInput
                value={intervalMin}
                onChangeText={v => setIntervalMin(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="30"
                placeholderTextColor={isDark ? '#555' : '#aaa'}
                style={{
                  flex: 1, backgroundColor: inputBg, color: inputTextColor,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
                }}
              />
              <View className={`flex-row rounded-xl overflow-hidden border ${isDark ? 'border-[#444]' : 'border-gray-200'}`}>
                {([{ key: 'min', label: '分钟' }, { key: 'hour', label: '小时' }] as const).map(u => (
                  <Pressable
                    key={u.key}
                    onPress={() => setIntervalUnit(u.key)}
                    className={`px-4 py-3 ${intervalUnit === u.key ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#2A2A2A]' : 'bg-gray-50'}`}
                  >
                    <Text className={`text-sm font-semibold ${intervalUnit === u.key ? 'text-white' : subText}`}>{u.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ── 保存按钮 ──────────────────────────────────── */}
            <Pressable
              onPress={handleSave}
              disabled={loading}
              className={`py-4 rounded-xl items-center ${saved ? 'bg-green-500' : 'bg-[#2C5F8A]'}`}
            >
              {loading
                ? <ActivityIndicator size="small" color="white" />
                : <View className="flex-row items-center gap-2">
                    {saved && <Ionicons name="checkmark" size={16} color="white" />}
                    <Text className="text-white font-semibold">{saved ? '✅ 已保存' : '保存设置'}</Text>
                  </View>
              }
            </Pressable>
            {saved && (
              <Text className="text-center text-green-500 text-sm mt-2 font-medium">设置已保存成功</Text>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

