/**
 * 词本导入页 - 支持文件上传/粘贴文本/第三方导入/AI生成词汇包
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { createWordbook, addWord, addLog } from '@/lib/database';
import { generateWordInfo, callAI } from '@/lib/aiService';
import { fetch } from 'expo/fetch';
import wordbankData from '@/lib/wordbank.json';

type Step = 'input' | 'preview' | 'generating' | 'done';
// AI生成子步骤
type AiGenStep = 'form' | 'previewing' | 'importing';

/** 内置词汇包 - 按分类分组 */
const WORD_CATEGORIES = [
  { key: '1.小学', label: '小学', icon: '📖', color: '#4CAF50' },
  { key: '2.初中', label: '初中', icon: '📚', color: '#2196F3' },
  { key: '3.高中', label: '高中', icon: '🎓', color: '#9C27B0' },
  { key: '3.高考', label: '高考', icon: '📝', color: '#FF5722' },
  { key: '4.大学四六级', label: '大学四六级', icon: '🏫', color: '#E91E63' },
  { key: '5.考研', label: '考研', icon: '🎯', color: '#F44336' },
  { key: '6.托福雅思', label: '托福雅思', icon: '🌍', color: '#00BCD4' },
  { key: '8.新概念英语', label: '新概念英语', icon: '📗', color: '#8BC34A' },
];

interface ParsedWord {
  word: string;
  phonetic: string;
  meaning: string;
  example: string;
}

/** 根据词汇样本自动检测语种 */
function detectLanguage(words: string[]): string {
  const sample = words.slice(0, 30).join('');
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';
  if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh';
  if (/[\u0400-\u04FF]/.test(sample)) return 'ru';
  if (/[àâçéèêëîïôùûüÿæœ]/i.test(sample)) return 'fr';
  if (/[äöüß]/i.test(sample)) return 'de';
  if (/[áéíóúñ¿¡]/i.test(sample)) return 'es';
  if (/[ãõçà]/i.test(sample)) return 'pt';
  return 'en';
}

export default function WordbookImportScreen() {
  const router = useRouter();
  const { isDark, activeAiConfig } = useAppContext();

  const [step, setStep] = useState<Step>('input');
  const [pasteText, setPasteText] = useState('');
  const [wordbookName, setWordbookName] = useState('');
  const [parsedWords, setParsedWords] = useState<ParsedWord[]>([]);
  const [detectedLang, setDetectedLang] = useState('en');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [showNameModal, setShowNameModal] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // ── AI 生成词汇包状态 ──
  const [showAiGenModal, setShowAiGenModal] = useState(false);
  const [aiGenStep, setAiGenStep] = useState<AiGenStep>('form');
  const [aiGenTopic, setAiGenTopic] = useState('');
  const [aiGenCount, setAiGenCount] = useState('20');
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiGenError, setAiGenError] = useState('');
  const [aiGenWords, setAiGenWords] = useState<ParsedWord[]>([]);
  const [aiGenBookName, setAiGenBookName] = useState('');

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputText = isDark ? '#fff' : '#1a2a3a';
  const modalBg = isDark ? '#2A2A2A' : '#FFFFFF';

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/csv', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.uri) return;
      const content = process.env.EXPO_OS === 'web'
        ? await (await fetch(asset.uri)).text()
        : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      setPasteText(content);
      const nameNoExt = (asset.name || '新词本').replace(/\.[^.]+$/, '');
      setWordbookName(nameNoExt);
    } catch (e: any) {
      setErrorMsg('文件读取失败：' + (e?.message || '未知错误'));
    }
  }

  function parseWords(raw: string): string[] {
    const lines = raw.split(/[\n,，\t]+/).map(s => s.trim()).filter(Boolean);
    return [...new Set(lines.map(l => l.split(/[,，\t]/)[0].trim()).filter(w => w.length > 0))];
  }

  async function handlePreview() {
    setErrorMsg('');
    const words = parseWords(pasteText);
    if (words.length === 0) { setErrorMsg('请输入有效内容'); return; }
    const lang = detectLanguage(words);
    setDetectedLang(lang);
    setParsedWords(words.map(w => ({ word: w, phonetic: '', meaning: '', example: '' })));
    setStep('preview');
  }

  async function handleGenerate(name: string) {
    if (!name.trim()) return;
    setWordbookName(name);
    setShowNameModal(false);
    setStep('generating');
    setProgress(0);
    try {
      const wordList = parsedWords.map(w => w.word);
      let enriched: ParsedWord[] = [...parsedWords];
      const hasAi = !!activeAiConfig;
      if (hasAi) {
        const batchSize = 10;
        for (let i = 0; i < wordList.length; i += batchSize) {
          const batch = wordList.slice(i, i + batchSize);
          const results = await generateWordInfo(batch, activeAiConfig, 'Chinese');
          results.forEach(r => {
            const idx = enriched.findIndex(w => w.word === r.word);
            if (idx >= 0) {
              enriched[idx] = { word: r.word, phonetic: r.phonetic || '', meaning: r.meaning || '', example: r.example || '' };
            }
          });
          setProgress(Math.round(((i + batch.length) / wordList.length) * 100));
        }
      }
      const wbId = await createWordbook(name.trim(), detectedLang);
      for (const w of enriched) {
        await addWord({ wordbook_id: wbId, word: w.word, phonetic: w.phonetic, meaning: w.meaning, example: w.example, language: detectedLang });
      }
      await addLog('info', '词本导入成功', `词本: ${name}, 单词数: ${enriched.length}`).catch(() => {});
      setStep('done');
    } catch (e: any) {
      await addLog('error', '词本导入失败', e?.message || '').catch(() => {});
      setErrorMsg('保存失败：' + (e?.message || ''));
      setStep('preview');
    }
  }

  // ── AI 生成词汇包：调用 AI 生成单词列表 ──
  async function handleAiGenerate() {
    const topic = aiGenTopic.trim();
    const count = parseInt(aiGenCount, 10);
    if (!topic) { setAiGenError('请输入词汇包主题'); return; }
    if (!count || count <= 0) { setAiGenError('请输入有效数量（大于0）'); return; }
    if (!activeAiConfig) {
      setAiGenError('请先配置AI服务（设置→AI服务配置）'); return;
    }
    setAiGenError(''); setAiGenLoading(true);
    try {
      const prompt = `请生成${count}个关于"${topic}"主题的英语词汇。
要求：
1. 每行一个，格式：单词|中文释义
2. 选择该主题下常用的实用词汇
3. 只输出词汇列表，不要其他说明

示例格式：
hotel|酒店
reservation|预订
luggage|行李`;
      const res = await callAI(activeAiConfig, [{ role: 'user', content: prompt }], 1500);
      if (!res.success) throw new Error(res.error || 'AI生成失败');
      // 解析 AI 返回内容
      const lines = res.text.split('\n').map(l => l.trim()).filter(Boolean);
      const parsed: ParsedWord[] = [];
      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 2) {
          const word = parts[0].replace(/^\d+\.\s*/, '').trim();
          const meaning = parts[1].trim();
          if (word && meaning) parsed.push({ word, phonetic: '', meaning, example: '' });
        } else {
          // 兼容只有单词的情况
          const word = line.replace(/^\d+\.\s*/, '').trim();
          if (word && /^[a-zA-Z]/.test(word)) parsed.push({ word, phonetic: '', meaning: '', example: '' });
        }
      }
      if (parsed.length === 0) throw new Error('AI返回格式异常，请重试');
      setAiGenWords(parsed);
      setAiGenBookName(topic + '词汇包');
      setAiGenStep('previewing');
    } catch (e: any) {
      setAiGenError('词汇包生成失败：' + (e?.message || '请重试'));
    } finally {
      setAiGenLoading(false);
    }
  }

  // ── AI 生成词汇包：确认导入 ──
  async function handleAiGenImport() {
    if (!aiGenBookName.trim()) { setAiGenError('请输入词本名称'); return; }
    setAiGenStep('importing');
    try {
      const wbId = await createWordbook(aiGenBookName.trim(), 'en');
      for (const w of aiGenWords) {
        await addWord({ wordbook_id: wbId, word: w.word, phonetic: w.phonetic, meaning: w.meaning, example: w.example, language: 'en' });
      }
      await addLog('info', 'AI词汇包导入成功', `词本: ${aiGenBookName}, 数量: ${aiGenWords.length}`).catch(() => {});
      setShowAiGenModal(false);
      setAiGenStep('form');
      setAiGenTopic(''); setAiGenCount('20'); setAiGenWords([]);
      setStep('done');
      setParsedWords(aiGenWords);
      setWordbookName(aiGenBookName);
    } catch (e: any) {
      setAiGenError('导入失败：' + (e?.message || ''));
      setAiGenStep('previewing');
    }
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        <View className="px-5 py-5">
          {/* 返回按钮 */}
          <View className="flex-row items-center gap-3 mb-5">
            <Pressable onPress={() => router.back()} className="p-1 -ml-1">
              <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
            </Pressable>
            <Text className={`text-xl font-bold ${textColor}`}>导入词本</Text>
          </View>
          {/* 步骤指示 */}
          <View className="flex-row items-center gap-2 mb-6">
            {['输入', '预览', '生成', '完成'].map((s, i) => {
              const stepNum = ['input', 'preview', 'generating', 'done'].indexOf(step);
              const isActive = i === stepNum;
              const isDone = i < stepNum;
              return (
                <View key={s} className="flex-row items-center">
                  <View className={`w-6 h-6 rounded-full items-center justify-center ${isDone ? 'bg-[#2C5F8A]' : isActive ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#444]' : 'bg-gray-200'}`}>
                    {isDone
                      ? <Ionicons name="checkmark" size={12} color="white" />
                      : <Text className={`text-xs font-bold ${isActive ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-400'}`}>{i + 1}</Text>
                    }
                  </View>
                  <Text className={`text-xs ml-1 ${isActive || isDone ? textColor : subText}`}>{s}</Text>
                  {i < 3 && <Text className={`mx-2 ${subText}`}>›</Text>}
                </View>
              );
            })}
          </View>

          {step === 'input' && (
            <>
              <Text className={`text-lg font-bold mb-1 ${textColor}`}>导入词汇</Text>
              <Text className={`text-sm mb-4 ${subText}`}>内置词汇包一键导入，AI智能生成，或上传 TXT/CSV 文件</Text>

              {/* 内置词汇包 - 按分类折叠 */}
              <Text className={`text-sm font-semibold mb-2 ${textColor}`}>内置词汇包</Text>
              <View className="mb-4">
                {WORD_CATEGORIES.map(cat => {
                  const packs = (wordbankData as any[]).filter((p: any) => p.c.startsWith(cat.key));
                  if (packs.length === 0) return null;
                  const isExpanded = expandedCategory === cat.key;
                  const totalWords = packs.reduce((sum: number, p: any) => sum + p.w.length, 0);
                  return (
                    <View key={cat.key} className={`rounded-xl border mb-2 ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
                      <Pressable
                        onPress={() => setExpandedCategory(isExpanded ? null : cat.key)}
                        className="flex-row items-center justify-between px-3 py-3"
                      >
                        <View className="flex-row items-center gap-2">
                          <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                          <Text className={`text-sm font-semibold ${textColor}`}>{cat.label}</Text>
                          <Text className={`text-xs px-1.5 py-0.5 rounded-full ${isDark ? 'bg-[#333] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{packs.length}本 · {totalWords}词</Text>
                        </View>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={isDark ? '#888' : '#666'} />
                      </Pressable>
                      {isExpanded && (
                        <View className="px-3 pb-3">
                          {packs.map((pack: any) => {
                            const packId = `wb_${pack.n}`;
                            const isSelected = selectedPackId === packId;
                            return (
                              <Pressable
                                key={packId}
                                onPress={() => {
                                  setSelectedPackId(isSelected ? null : packId);
                                  setPasteText(isSelected ? '' : pack.w.join('\n'));
                                  setWordbookName(isSelected ? '' : pack.n);
                                }}
                                className={`rounded-lg px-3 py-2.5 mb-1.5 flex-row items-center justify-between ${isSelected ? (isDark ? 'bg-[#1a2d40] border border-[#2C5F8A]' : 'bg-blue-50 border border-[#2C5F8A]') : (isDark ? 'bg-[#2A2A2A]' : 'bg-gray-50')}`}
                              >
                                <View className="flex-1">
                                  <Text className={`text-xs font-semibold ${isSelected ? 'text-[#2C5F8A]' : textColor}`}>{pack.n}</Text>
                                  <Text className={`text-[10px] ${isSelected ? (isDark ? 'text-blue-300' : 'text-blue-600') : subText}`}>{pack.w.length}词</Text>
                                </View>
                                {isSelected && <Ionicons name="checkmark-circle" size={16} color="#2C5F8A" />}
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* AI 生成词汇包入口 */}
              <Pressable
                onPress={() => { setShowAiGenModal(true); setAiGenStep('form'); setAiGenError(''); }}
                className={`rounded-xl border-2 p-4 mb-5 flex-row items-center gap-3 ${isDark ? 'bg-[#1a2d40] border-[#2C5F8A]' : 'bg-blue-50 border-[#2C5F8A]'}`}
                style={{ borderCurve: 'continuous' }}
              >
                <View className="w-10 h-10 rounded-xl bg-[#2C5F8A] items-center justify-center">
                  <Ionicons name="sparkles-outline" size={20} color="white" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-[#2C5F8A]">AI 智能生成词汇包</Text>
                  <Text className={`text-xs mt-0.5 ${subText}`}>输入主题，AI 自动生成词汇列表</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#2C5F8A" />
              </Pressable>

              {/* 上传文件 */}
              <Pressable
                onPress={handlePickFile}
                className={`rounded-2xl border-2 border-dashed p-6 items-center mb-4 ${isDark ? 'border-[#444]' : 'border-gray-300'}`}
                style={{ borderCurve: 'continuous' }}
              >
                <Ionicons name="cloud-upload-outline" size={32} color={isDark ? '#555' : '#ccc'} />
                <Text className={`text-sm font-medium mt-2 ${textColor}`}>点击上传 TXT / CSV 文件</Text>
                <Text className={`text-xs mt-1 ${subText}`}>每行一个单词，或逗号分隔</Text>
              </Pressable>

              <Text className={`text-sm font-medium mb-2 ${textColor}`}>或直接粘贴单词</Text>
              <TextInput
                value={pasteText}
                onChangeText={setPasteText}
                placeholder={"apple\nbanana\ncat\n或: apple, banana, cat"}
                placeholderTextColor={isDark ? '#555' : '#aaa'}
                multiline
                numberOfLines={8}
                style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 12, minHeight: 160, textAlignVertical: 'top', fontSize: 14 }}
                className="mb-4"
              />

              {errorMsg ? <Text className="text-red-500 text-xs mb-3">{errorMsg}</Text> : null}

              <Pressable onPress={handlePreview} className="bg-[#2C5F8A] py-4 rounded-xl items-center">
                <Text className="text-white font-semibold text-base">下一步：预览单词</Text>
              </Pressable>
            </>
          )}

          {step === 'preview' && (
            <>
              <Text className={`text-lg font-bold mb-1 ${textColor}`}>确认单词列表</Text>
              <Text className={`text-sm mb-2 ${subText}`}>共识别到 {parsedWords.length} 个单词{activeAiConfig ? '，将使用 AI 自动生成释义' : '（未配置 AI，仅保存单词）'}</Text>
              <View className={`flex-row items-center gap-1.5 mb-4 px-3 py-2 rounded-xl ${isDark ? 'bg-[#2A2A2A]' : 'bg-blue-50'}`}>
                <Ionicons name="language-outline" size={14} color="#2C5F8A" />
                <Text className="text-xs" style={{ color: '#2C5F8A' }}>
                  自动检测语种：{{ en: '英语', ja: '日语', ko: '韩语', zh: '中文', fr: '法语', de: '德语', es: '西班牙语', pt: '葡萄牙语', ru: '俄语' }[detectedLang] ?? detectedLang}
                </Text>
              </View>
              <View className={`rounded-2xl border p-4 mb-4 ${card}`} style={{ borderCurve: 'continuous' }}>
                {parsedWords.slice(0, 20).map((w, i) => (
                  <Text key={i} className={`text-sm py-1 ${textColor} ${i < parsedWords.length - 1 ? `border-b ${isDark ? 'border-[#444]' : 'border-gray-100'}` : ''}`}>
                    {i + 1}. {w.word}
                  </Text>
                ))}
                {parsedWords.length > 20 && <Text className={`text-xs mt-2 ${subText}`}>...还有 {parsedWords.length - 20} 个</Text>}
              </View>
              {errorMsg ? <Text className="text-red-500 text-xs mb-3">{errorMsg}</Text> : null}
              <View className="flex-row gap-3">
                <Pressable onPress={() => setStep('input')} className={`flex-1 py-4 rounded-xl items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
                  <Text className={`font-semibold ${subText}`}>返回修改</Text>
                </Pressable>
                <Pressable onPress={() => setShowNameModal(true)} className="flex-2 py-4 px-6 rounded-xl items-center bg-[#2C5F8A]">
                  <Text className="text-white font-semibold">保存词本</Text>
                </Pressable>
              </View>
            </>
          )}

          {step === 'generating' && (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color="#2C5F8A" />
              <Text className={`text-base font-semibold mt-4 ${textColor}`}>AI 正在生成释义...</Text>
              <Text className={`text-sm mt-2 ${subText}`}>{progress}%</Text>
              <View className={`h-2 w-48 rounded-full mt-4 ${isDark ? 'bg-[#444]' : 'bg-gray-200'}`}>
                <View className="h-2 rounded-full bg-[#2C5F8A]" style={{ width: `${progress}%` }} />
              </View>
            </View>
          )}

          {step === 'done' && (
            <View className="items-center py-10">
              <View className="w-16 h-16 rounded-full bg-green-100 items-center justify-center mb-4">
                <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
              </View>
              <Text className={`text-xl font-bold mb-2 ${textColor}`}>导入成功！</Text>
              <Text className={`text-sm text-center ${subText}`}>共导入 {parsedWords.length} 个单词到「{wordbookName}」</Text>
              <Pressable onPress={() => router.push('/wordbook/list')} className="mt-8 bg-[#2C5F8A] px-8 py-4 rounded-xl">
                <Text className="text-white font-semibold">查看词本</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 词本命名弹窗 */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="w-full rounded-2xl p-6" style={{ backgroundColor: modalBg }}>
            <Text className={`text-lg font-bold mb-4 ${textColor}`}>词本命名</Text>
            <TextInput
              value={wordbookName}
              onChangeText={setWordbookName}
              placeholder="如：托福词汇、四级核心词..."
              placeholderTextColor={isDark ? '#666' : '#aaa'}
              style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 16 }}
              autoFocus
            />
            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowNameModal(false)} className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}>
                <Text className={`font-semibold text-sm ${subText}`}>取消</Text>
              </Pressable>
              <Pressable onPress={() => handleGenerate(wordbookName)} className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]">
                <Text className="text-white font-semibold text-sm">确认保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── AI 生成词汇包弹窗 ── */}
      <Modal visible={showAiGenModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: modalBg, maxHeight: '85%' }}>
            <View className="flex-row items-center justify-between mb-5">
              <Text className={`text-lg font-bold ${textColor}`}>AI 智能生成词汇包</Text>
              <Pressable onPress={() => { setShowAiGenModal(false); setAiGenStep('form'); }}>
                <Ionicons name="close" size={22} color={isDark ? '#aaa' : '#666'} />
              </Pressable>
            </View>

            {aiGenStep === 'form' && (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text className={`text-sm mb-1 ${subText}`}>词汇主题</Text>
                <TextInput
                  value={aiGenTopic}
                  onChangeText={setAiGenTopic}
                  placeholder="如：旅行常用词、科技词汇、商务英语..."
                  placeholderTextColor={isDark ? '#555' : '#aaa'}
                  style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 16 }}
                />
                <Text className={`text-sm mb-1 ${subText}`}>生成数量</Text>
                <TextInput
                  value={aiGenCount}
                  onChangeText={setAiGenCount}
                  placeholder="建议 10~50"
                  placeholderTextColor={isDark ? '#555' : '#aaa'}
                  keyboardType="number-pad"
                  style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 16 }}
                />
                {/* 快捷主题 */}
                <Text className={`text-xs mb-2 ${subText}`}>快捷主题</Text>
                <View className="flex-row flex-wrap gap-2 mb-5">
                  {['旅行出行', '日常购物', '职场面试', '科技数码', '美食烹饪', '体育运动', '医疗健康', '环境自然'].map(t => (
                    <Pressable key={t} onPress={() => setAiGenTopic(t)} className={`px-3 py-1.5 rounded-full border ${aiGenTopic === t ? 'bg-[#2C5F8A] border-[#2C5F8A]' : isDark ? 'bg-[#333] border-[#555]' : 'bg-gray-50 border-gray-200'}`}>
                      <Text className={`text-xs ${aiGenTopic === t ? 'text-white' : subText}`}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
                {aiGenError ? <Text className="text-red-500 text-xs mb-3">{aiGenError}</Text> : null}
                <Pressable
                  onPress={handleAiGenerate}
                  disabled={aiGenLoading}
                  className={`py-4 rounded-xl items-center ${aiGenLoading ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
                >
                  {aiGenLoading
                    ? <View className="flex-row items-center gap-2"><ActivityIndicator size="small" color="#aaa" /><Text className={subText}>AI 生成中...</Text></View>
                    : <View className="flex-row items-center gap-2"><Ionicons name="sparkles-outline" size={16} color="white" /><Text className="text-white font-semibold">生成词汇包</Text></View>
                  }
                </Pressable>
              </ScrollView>
            )}

            {aiGenStep === 'previewing' && (
              <ScrollView>
                <View className={`flex-row items-center gap-2 mb-3 px-3 py-2 rounded-xl ${isDark ? 'bg-[#1a2d40]' : 'bg-blue-50'}`}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#2C5F8A" />
                  <Text className="text-sm text-[#2C5F8A]">已生成 {aiGenWords.length} 个词汇</Text>
                </View>
                <Text className={`text-sm mb-1 ${subText}`}>词本名称</Text>
                <TextInput
                  value={aiGenBookName}
                  onChangeText={setAiGenBookName}
                  style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 12 }}
                />
                <View className={`rounded-xl border p-3 mb-4 ${card}`} style={{ maxHeight: 220 }}>
                  <ScrollView nestedScrollEnabled>
                    {aiGenWords.slice(0, 30).map((w, i) => (
                      <View key={i} className={`flex-row gap-2 py-1.5 ${i < aiGenWords.length - 1 ? `border-b ${isDark ? 'border-[#444]' : 'border-gray-100'}` : ''}`}>
                        <Text className={`text-sm font-medium w-32 ${textColor}`}>{w.word}</Text>
                        <Text className={`text-sm flex-1 ${subText}`}>{w.meaning}</Text>
                      </View>
                    ))}
                    {aiGenWords.length > 30 && <Text className={`text-xs mt-1 ${subText}`}>...还有 {aiGenWords.length - 30} 个</Text>}
                  </ScrollView>
                </View>
                {aiGenError ? <Text className="text-red-500 text-xs mb-3">{aiGenError}</Text> : null}
                <View className="flex-row gap-3">
                  <Pressable onPress={() => setAiGenStep('form')} className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
                    <Text className={`font-semibold text-sm ${subText}`}>重新生成</Text>
                  </Pressable>
                  <Pressable onPress={handleAiGenImport} className="flex-1 py-3 rounded-xl items-center bg-[#E67E22]">
                    <Text className="text-white font-semibold text-sm">一键导入</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}

            {aiGenStep === 'importing' && (
              <View className="items-center py-8 gap-4">
                <ActivityIndicator size="large" color="#2C5F8A" />
                <Text className={`text-sm ${textColor}`}>正在导入词汇包...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
