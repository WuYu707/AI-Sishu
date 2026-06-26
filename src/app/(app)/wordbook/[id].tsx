/**
 * 单词卡学习页 - 卡片翻转、拼写输入、遮挡回忆、听力填词、听写、编辑、删除、搜索
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal, TextInput, Animated, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useAppContext } from '@/lib/AppContext';
import {
  getWords, searchWords, markWordMastered, deleteWord, updateWord, updateTodayStat,
  type Word
} from '@/lib/database';
import { generateMnemonicStory } from '@/lib/aiService';

type LearnMode = 'normal' | 'spelling' | 'recall' | 'listening' | 'context';

const LEARN_MODES: { key: LearnMode; label: string; icon: string }[] = [
  { key: 'normal', label: '翻卡', icon: 'swap-horizontal-outline' },
  { key: 'spelling', label: '拼写', icon: 'pencil-outline' },
  { key: 'recall', label: '回忆', icon: 'eye-off-outline' },
  { key: 'listening', label: '听力', icon: 'headset-outline' },
  { key: 'context', label: '语境', icon: 'chatbubbles-outline' },
];

export default function WordCardScreen() {
  const { id } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const { isDark, activeAiConfig } = useAppContext();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showStory, setShowStory] = useState(false);
  const [story, setStory] = useState('');
  const [storyLoading, setStoryLoading] = useState(false);
  const [editForm, setEditForm] = useState({ word: '', phonetic: '', meaning: '', example: '' });
  const [filter, setFilter] = useState<'all' | 'unmastered'>('all');
  const [learnMode, setLearnMode] = useState<LearnMode>('normal');

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Word[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searching, setSearching] = useState(false);

  // 听写模式
  const [dictationMode, setDictationMode] = useState(false);
  const [dictationInput, setDictationInput] = useState('');
  const [dictationSubmitted, setDictationSubmitted] = useState(false);
  const [dictationCorrect, setDictationCorrect] = useState<boolean | null>(null);
  const [dictationScore, setDictationScore] = useState({ correct: 0, total: 0 });

  // 拼写模式
  const [spellingInput, setSpellingInput] = useState('');
  const [spellingSubmitted, setSpellingSubmitted] = useState(false);
  const [spellingCorrect, setSpellingCorrect] = useState<boolean | null>(null);
  const [spellingScore, setSpellingScore] = useState({ correct: 0, total: 0 });

  // 遮挡回忆模式
  const [recallRevealed, setRecallRevealed] = useState(false);
  const [recallScore, setRecallScore] = useState({ correct: 0, total: 0 });

  // 听力填词模式
  const [listenInput, setListenInput] = useState('');
  const [listenSubmitted, setListenSubmitted] = useState(false);
  const [listenCorrect, setListenCorrect] = useState<boolean | null>(null);
  const [listenScore, setListenScore] = useState({ correct: 0, total: 0 });
  const [listening, setListening] = useState(false);

  // 语境填空模式
  const [contextInput, setContextInput] = useState('');
  const [contextSubmitted, setContextSubmitted] = useState(false);
  const [contextCorrect, setContextCorrect] = useState<boolean | null>(null);
  const [contextScore, setContextScore] = useState({ correct: 0, total: 0 });

  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { return () => { Speech.stop(); }; }, []);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputText = isDark ? '#fff' : '#1a2a3a';
  const modalBg = isDark ? '#2A2A2A' : '#FFFFFF';

  const filteredWords = filter === 'unmastered' ? words.filter(w => !w.mastered) : words;
  const current = filteredWords[currentIndex];

  useFocusEffect(useCallback(() => { loadWords(); }, [id]));

  async function loadWords() {
    setLoading(true);
    try {
      const list = await getWords(Number(id));
      setWords(list);
      setCurrentIndex(0);
      setFlipped(false);
    } finally { setLoading(false); }
  }

  function handleFlip() {
    Animated.timing(flipAnim, { toValue: flipped ? 0 : 1, duration: 250, useNativeDriver: true })
      .start(() => setFlipped(f => !f));
  }

  function goNext() {
    if (currentIndex < filteredWords.length - 1) {
      setCurrentIndex(i => i + 1);
      setFlipped(false);
      resetModeStates();
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
      setFlipped(false);
      resetModeStates();
    }
  }

  function resetModeStates() {
    setSpellingInput(''); setSpellingSubmitted(false); setSpellingCorrect(null);
    setRecallRevealed(false);
    setListenInput(''); setListenSubmitted(false); setListenCorrect(null);
  }

  async function handleMastery(mastered: boolean) {
    if (!current) return;
    await markWordMastered(current.id, mastered);
    if (mastered) await updateTodayStat({ new_words: 1 }).catch(() => {});
    setWords(prev => prev.map(w => w.id === current.id ? { ...w, mastered: mastered ? 1 : 0 } : w));
    goNext();
  }

  async function handleDelete() {
    if (!current) return;
    await deleteWord(current.id);
    setWords(prev => prev.filter(w => w.id !== current.id));
    setCurrentIndex(i => Math.max(0, i - 1));
    setFlipped(false);
  }

  async function handleEditSave() {
    if (!current) return;
    await updateWord(current.id, editForm);
    setWords(prev => prev.map(w => w.id === current.id ? { ...w, ...editForm } : w));
    setShowEdit(false);
  }

  async function handleGenerateStory() {
    if (!activeAiConfig || !current) {
      setStory('未配置 AI 服务，请前往「我」→「AI服务配置」');
      setShowStory(true);
      return;
    }
    setShowStory(true); setStoryLoading(true);
    try { setStory(await generateMnemonicStory(current.word, current.meaning, activeAiConfig)); }
    catch { setStory('AI 生成失败，请稍后重试'); }
    finally { setStoryLoading(false); }
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try { setSearchResults(await searchWords(Number(id), q.trim())); }
    finally { setSearching(false); }
  }

  // ── 听写模式 ──
  function openDictationMode() {
    setDictationMode(true); setDictationInput(''); setDictationSubmitted(false);
    setDictationCorrect(null); setDictationScore({ correct: 0, total: 0 });
    setCurrentIndex(0); setFlipped(false); resetModeStates();
    const first = filteredWords[0];
    if (first?.word) setTimeout(() => Speech.speak(first.word, { language: 'en-US', rate: 0.75 }), 300);
  }

  function handleDictationSubmit() {
    if (!current || !dictationInput.trim()) return;
    const isCorrect = dictationInput.trim().toLowerCase() === current.word.toLowerCase();
    setDictationCorrect(isCorrect); setDictationSubmitted(true);
    setDictationScore(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    if (isCorrect) markWordMastered(current.id, true).catch(() => {});
  }

  function handleDictationNext() {
    if (currentIndex < filteredWords.length - 1) {
      setCurrentIndex(i => i + 1); setDictationInput(''); setDictationSubmitted(false); setDictationCorrect(null);
      const next = filteredWords[currentIndex + 1];
      if (next?.word) setTimeout(() => Speech.speak(next.word, { language: 'en-US', rate: 0.75 }), 200);
    } else { setDictationMode(false); }
  }

  // ── 拼写模式 ──
  function handleSpellingSubmit() {
    if (!current || !spellingInput.trim()) return;
    const input = spellingInput.trim().toLowerCase();
    const target = current.word.toLowerCase();
    const isCorrect = input === target || (target.length > 3 && levenshtein(input, target) <= 1);
    setSpellingCorrect(isCorrect); setSpellingSubmitted(true);
    setSpellingScore(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    if (isCorrect) markWordMastered(current.id, true).catch(() => {});
  }

  function handleSpellingNext() {
    if (currentIndex < filteredWords.length - 1) {
      setCurrentIndex(i => i + 1); resetModeStates();
      Speech.speak(filteredWords[currentIndex + 1]?.word || '', { language: 'en-US', rate: 0.75 });
    }
  }

  // ── 遮挡回忆模式 ──
  function handleRecallAnswer(mastered: boolean) {
    if (!current) return;
    setRecallRevealed(true);
    setRecallScore(prev => ({ correct: prev.correct + (mastered ? 1 : 0), total: prev.total + 1 }));
    markWordMastered(current.id, mastered).catch(() => {});
    if (mastered) updateTodayStat({ new_words: 1 }).catch(() => {});
    setTimeout(() => {
      setWords(prev => prev.map(w => w.id === current.id ? { ...w, mastered: mastered ? 1 : 0 } : w));
      goNext(); setRecallRevealed(false);
    }, 1500);
  }

  // ── 听力填词模式 ──
  function playListeningSentence() {
    if (!current?.example) return;
    setListening(true);
    const sentence = current.example.replace(new RegExp(current.word, 'gi'), 'blank');
    Speech.speak(sentence, { language: 'en-US', rate: 0.8, onDone: () => setListening(false), onError: () => setListening(false) });
  }

  function handleListenSubmit() {
    if (!current || !listenInput.trim()) return;
    const isCorrect = listenInput.trim().toLowerCase() === current.word.toLowerCase();
    setListenCorrect(isCorrect); setListenSubmitted(true);
    setListenScore(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    if (isCorrect) markWordMastered(current.id, true).catch(() => {});
  }

  function handleListenNext() {
    if (currentIndex < filteredWords.length - 1) {
      setCurrentIndex(i => i + 1); setListenInput(''); setListenSubmitted(false); setListenCorrect(null);
    }
  }

  // ── 语境填空模式 ──
  function getContextSentence(): string {
    if (!current?.example) return '请填写正确的单词';
    return current.example.replace(new RegExp(`\\b${current.word}\\b`, 'gi'), '______');
  }

  function handleContextSubmit() {
    if (!current || !contextInput.trim()) return;
    const isCorrect = contextInput.trim().toLowerCase() === current.word.toLowerCase();
    setContextCorrect(isCorrect); setContextSubmitted(true);
    setContextScore(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    if (isCorrect) markWordMastered(current.id, true).catch(() => {});
  }

  function handleContextNext() {
    if (currentIndex < filteredWords.length - 1) {
      setCurrentIndex(i => i + 1); setContextInput(''); setContextSubmitted(false); setContextCorrect(null);
    }
  }

  // ── 编辑距离（模糊匹配拼写） ──
  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]!==b[j-1]?1:0));
    return dp[m][n];
  }

  if (loading) return (
    <SafeAreaView className={`flex-1 items-center justify-center ${bg}`}>
      <ActivityIndicator size="large" color="#2C5F8A" />
    </SafeAreaView>
  );

  if (filteredWords.length === 0) return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <Pressable onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
        </Pressable>
      </View>
      <View className="flex-1 items-center justify-center px-8">
        <Ionicons name="albums-outline" size={64} color={isDark ? '#555' : '#ccc'} />
        <Text className={`text-base font-semibold mt-4 ${textColor}`}>
          {filter === 'unmastered' ? '全部已掌握！' : '词本暂无单词'}
        </Text>
        {filter === 'unmastered' && (
          <Pressable onPress={() => { setFilter('all'); setCurrentIndex(0); }} className="mt-4 bg-[#2C5F8A] px-6 py-3 rounded-xl">
            <Text className="text-white font-semibold">查看全部单词</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );

  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      {/* 顶部工具栏 */}
      <View className="px-4 py-2 flex-row items-center justify-between">
        <View className="flex-row gap-2 items-center">
          <Pressable onPress={() => router.back()} className="p-1 -ml-1 mr-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
          {(['all', 'unmastered'] as const).map(f => (
            <Pressable key={f} onPress={() => { setFilter(f); setCurrentIndex(0); setFlipped(false); resetModeStates(); }}
              className={`px-3 py-1.5 rounded-lg ${filter === f ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
              <Text className={`text-xs font-medium ${filter === f ? 'text-white' : subText}`}>
                {f === 'all' ? `全部(${words.length})` : `未掌握(${words.filter(w => !w.mastered).length})`}
              </Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row gap-2 items-center">
          <Pressable onPress={() => setShowSearch(s => !s)}
            className={`p-2 rounded-lg ${showSearch ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
            <Ionicons name="search-outline" size={16} color={showSearch ? 'white' : (isDark ? '#aaa' : '#666')} />
          </Pressable>
          <Pressable onPress={openDictationMode}
            className={`px-2.5 py-1.5 rounded-lg flex-row items-center gap-1 ${isDark ? 'bg-[#2A3A2A]' : 'bg-green-50'}`}>
            <Ionicons name="pencil-outline" size={14} color="#2E6B5C" />
            <Text className="text-xs font-medium text-[#2E6B5C]">听写</Text>
          </Pressable>
          <Text className={`text-sm ${subText}`}>{currentIndex + 1}/{filteredWords.length}</Text>
        </View>
      </View>

      {/* 学习模式选择器 */}
      <View className="px-4 pb-2">
        <View className={`flex-row gap-1 p-1 rounded-xl ${isDark ? 'bg-[#252525]' : 'bg-gray-100'}`}>
          {LEARN_MODES.map(m => (
            <Pressable key={m.key} onPress={() => { setLearnMode(m.key); resetModeStates(); setFlipped(false); }}
              className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1 ${learnMode === m.key ? 'bg-[#2C5F8A]' : ''}`}>
              <Ionicons name={m.icon as any} size={13} color={learnMode === m.key ? '#fff' : (isDark ? '#888' : '#666')} />
              <Text className={`text-xs font-semibold ${learnMode === m.key ? 'text-white' : subText}`}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 搜索框 */}
      {showSearch && (
        <View className="px-4 pb-2">
          <View className={`flex-row items-center rounded-xl px-3 gap-2 ${isDark ? 'bg-[#2A2A2A] border border-[#444]' : 'bg-white border border-gray-200'}`}>
            <Ionicons name="search-outline" size={16} color={isDark ? '#888' : '#aaa'} />
            <TextInput value={searchQuery} onChangeText={handleSearch} placeholder="搜索单词、释义..."
              placeholderTextColor={isDark ? '#666' : '#aaa'} autoFocus
              style={{ flex: 1, color: isDark ? '#fff' : '#1a2a3a', paddingVertical: 10, fontSize: 14 }} />
            {searching && <ActivityIndicator size="small" color="#2C5F8A" />}
            {searchQuery.length > 0 && !searching && (
              <Pressable onPress={() => { setSearchQuery(''); setSearchResults(null); }}>
                <Ionicons name="close-circle" size={16} color={isDark ? '#666' : '#ccc'} />
              </Pressable>
            )}
          </View>
          {searchResults !== null && (
            <View className={`mt-2 rounded-xl border overflow-hidden ${card}`} style={{ maxHeight: 240 }}>
              {searchResults.length === 0 ? (
                <View className="p-4 items-center"><Text className={`text-sm ${subText}`}>未找到匹配的单词</Text></View>
              ) : (
                <ScrollView nestedScrollEnabled>
                  {searchResults.map((w, i) => (
                    <Pressable key={w.id} onPress={() => {
                      const idx = filteredWords.findIndex(fw => fw.id === w.id);
                      if (idx >= 0) { setCurrentIndex(idx); setFlipped(false); resetModeStates(); }
                      setShowSearch(false); setSearchQuery(''); setSearchResults(null);
                    }} className={`px-4 py-3 flex-row items-center gap-3 ${i > 0 ? (isDark ? 'border-t border-[#333]' : 'border-t border-gray-100') : ''}`}>
                      <View className="flex-1">
                        <Text className={`text-sm font-semibold ${textColor}`}>{w.word}</Text>
                        {w.meaning ? <Text className={`text-xs mt-0.5 ${subText}`} numberOfLines={1}>{w.meaning}</Text> : null}
                      </View>
                      {w.mastered ? <Ionicons name="checkmark-circle" size={14} color="#22C55E" /> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}

      {/* 进度条 */}
      <View className={`mx-5 h-1 rounded-full ${isDark ? 'bg-[#333]' : 'bg-gray-200'} mb-4`}>
        <View className="h-1 rounded-full bg-[#2C5F8A]" style={{ width: `${((currentIndex + 1) / filteredWords.length) * 100}%` }} />
      </View>

      {/* ═══ 翻卡模式 ═══ */}
      {learnMode === 'normal' && (
        <View className="flex-1 px-5 items-center justify-center">
          <Pressable onPress={handleFlip} className="w-full" style={{ minHeight: 280 }}>
            <Animated.View className={`absolute w-full rounded-2xl border p-6 items-center justify-center ${card}`}
              style={{ borderCurve: 'continuous', minHeight: 280, backfaceVisibility: 'hidden', transform: [{ rotateY: frontInterpolate }] }}>
              <Text className={`text-4xl font-bold mb-3 ${textColor}`}>{current?.word}</Text>
              {current?.phonetic ? <Text className={`text-lg ${subText} mb-2`}>{current.phonetic}</Text> : null}
              <Text className={`text-sm ${subText} mt-4`}>点击翻转查看释义</Text>
              {current?.mastered ? (
                <View className="absolute top-3 right-3 bg-green-100 px-2 py-1 rounded-full flex-row items-center gap-1">
                  <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                  <Text className="text-green-600 text-xs">已掌握</Text>
                </View>
              ) : null}
            </Animated.View>
            <Animated.View className={`absolute w-full rounded-2xl border p-6 ${card}`}
              style={{ borderCurve: 'continuous', minHeight: 280, backfaceVisibility: 'hidden', transform: [{ rotateY: backInterpolate }] }}>
              <Text className={`text-2xl font-bold mb-1 ${textColor}`}>{current?.word}</Text>
              {current?.phonetic ? <Text className={`text-sm ${subText} mb-3`}>{current.phonetic}</Text> : null}
              <Text className={`text-base text-[#2C5F8A] font-medium mb-3`}>{current?.meaning || '暂无释义'}</Text>
              {current?.example ? (<>
                <View className={`h-px ${isDark ? 'bg-[#444]' : 'bg-gray-100'} mb-3`} />
                <Text className={`text-sm italic ${subText} leading-5`}>{current.example}</Text>
              </>) : null}
            </Animated.View>
          </Pressable>
          <Pressable onPress={() => current?.word && Speech.speak(current.word, { language: 'en-US', rate: 0.85 })}
            className={`mt-3 px-4 py-2 rounded-full flex-row items-center gap-2 ${isDark ? 'bg-[#333]' : 'bg-blue-50'}`}>
            <Ionicons name="volume-medium-outline" size={16} color="#2C5F8A" />
            <Text className="text-[#2C5F8A] text-xs font-medium">朗读发音</Text>
          </Pressable>
        </View>
      )}

      {/* ═══ 拼写模式 ═══ */}
      {learnMode === 'spelling' && (
        <View className="flex-1 px-5 items-center justify-center">
          <View className={`w-full rounded-2xl border p-6 ${card}`} style={{ borderCurve: 'continuous' }}>
            <Text className={`text-xs font-medium mb-2 ${subText}`}>请根据释义拼写单词</Text>
            <Text className={`text-lg font-semibold mb-1 ${textColor}`}>{current?.meaning}</Text>
            {current?.example ? <Text className={`text-sm italic ${subText} mb-4`}>例：{current.example}</Text> : <View className="mb-4" />}
            <TextInput value={spellingInput} onChangeText={setSpellingInput}
              placeholder="输入单词..." placeholderTextColor={isDark ? '#555' : '#aaa'}
              autoCapitalize="none" autoCorrect={false} editable={!spellingSubmitted}
              style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 12 }} />
            {!spellingSubmitted ? (
              <Pressable onPress={handleSpellingSubmit} disabled={!spellingInput.trim()}
                className={`py-3.5 rounded-xl items-center ${spellingInput.trim() ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-200'}`}>
                <Text className={`font-semibold ${spellingInput.trim() ? 'text-white' : subText}`}>提交拼写</Text>
              </Pressable>
            ) : (
              <View>
                <View className={`rounded-xl p-4 mb-3 items-center ${spellingCorrect ? (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200') : (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')}`}>
                  <Ionicons name={spellingCorrect ? 'checkmark-circle' : 'close-circle'} size={32} color={spellingCorrect ? '#22C55E' : '#EF4444'} />
                  <Text className={`text-lg font-bold mt-2 ${spellingCorrect ? 'text-green-500' : 'text-red-500'}`}>
                    {spellingCorrect ? '拼写正确！' : '拼写错误'}
                  </Text>
                  {!spellingCorrect && <Text className={`text-sm mt-1 ${textColor}`}>正确答案：<Text className="font-bold text-[#2C5F8A]">{current?.word}</Text></Text>}
                </View>
                <View className="flex-row gap-3 items-center mb-2">
                  <Text className={`text-xs ${subText}`}>得分：{spellingScore.correct}/{spellingScore.total}</Text>
                  <Text className={`text-xs ${subText}`}>
                    正确率：{spellingScore.total > 0 ? Math.round(spellingScore.correct / spellingScore.total * 100) : 0}%
                  </Text>
                </View>
                <Pressable onPress={handleSpellingNext} className="py-3.5 rounded-xl items-center bg-[#2C5F8A]">
                  <Text className="text-white font-semibold">下一个</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ═══ 遮挡回忆模式 ═══ */}
      {learnMode === 'recall' && (
        <View className="flex-1 px-5 items-center justify-center">
          <View className={`w-full rounded-2xl border p-6 items-center ${card}`} style={{ borderCurve: 'continuous', minHeight: 280 }}>
            {!recallRevealed ? (<>
              <Text className={`text-4xl font-bold mb-3 ${textColor}`}>{current?.word}</Text>
              {current?.phonetic ? <Text className={`text-lg ${subText} mb-4`}>{current.phonetic}</Text> : null}
              <Pressable onPress={() => current?.word && Speech.speak(current.word, { language: 'en-US', rate: 0.85 })}
                className={`mb-6 px-4 py-2 rounded-full flex-row items-center gap-2 ${isDark ? 'bg-[#333]' : 'bg-blue-50'}`}>
                <Ionicons name="volume-medium-outline" size={16} color="#2C5F8A" />
                <Text className="text-[#2C5F8A] text-xs font-medium">朗读发音</Text>
              </Pressable>
              <Text className={`text-sm mb-4 ${subText}`}>看到单词后，在脑中回忆它的含义</Text>
              <View className="flex-row gap-3 w-full">
                <Pressable onPress={() => handleRecallAnswer(false)}
                  className="flex-1 py-3.5 rounded-xl items-center bg-red-50 border border-red-200">
                  <Text className="text-red-500 font-semibold text-sm">想不起来</Text>
                </Pressable>
                <Pressable onPress={() => handleRecallAnswer(true)}
                  className="flex-1 py-3.5 rounded-xl items-center bg-green-50 border border-green-200">
                  <Text className="text-green-600 font-semibold text-sm">记得住</Text>
                </Pressable>
              </View>
            </>) : (<>
              <Text className={`text-xs font-medium mb-2 ${subText}`}>答案揭晓</Text>
              <Text className={`text-lg font-semibold mb-1 ${textColor}`}>{current?.meaning}</Text>
              {current?.example ? <Text className={`text-sm italic ${subText} text-center`}>{current.example}</Text> : null}
              <View className="flex-row gap-3 mt-4 items-center">
                <Text className={`text-xs ${subText}`}>得分：{recallScore.correct}/{recallScore.total}</Text>
              </View>
            </>)}
          </View>
        </View>
      )}

      {/* ═══ 听力填词模式 ═══ */}
      {learnMode === 'listening' && (
        <View className="flex-1 px-5 items-center justify-center">
          <View className={`w-full rounded-2xl border p-6 ${card}`} style={{ borderCurve: 'continuous' }}>
            <Text className={`text-xs font-medium mb-2 ${subText}`}>听句子，填入缺失的单词</Text>
            <Text className={`text-sm ${subText} mb-4 leading-5`}>点击播放按钮听例句，然后在下方输入听到的单词</Text>
            <Pressable onPress={playListeningSentence} disabled={listening}
              className={`py-4 rounded-xl items-center mb-4 flex-row justify-center gap-2 ${listening ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}>
              {listening ? <ActivityIndicator size="small" color="#2C5F8A" /> : <Ionicons name="volume-high" size={20} color="white" />}
              <Text className={`font-semibold ${listening ? subText : 'text-white'}`}>{listening ? '播放中...' : '播放例句'}</Text>
            </Pressable>
            <TextInput value={listenInput} onChangeText={setListenInput}
              placeholder="输入听到的单词..." placeholderTextColor={isDark ? '#555' : '#aaa'}
              autoCapitalize="none" autoCorrect={false} editable={!listenSubmitted}
              style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 12 }} />
            {!listenSubmitted ? (
              <Pressable onPress={handleListenSubmit} disabled={!listenInput.trim()}
                className={`py-3.5 rounded-xl items-center ${listenInput.trim() ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-200'}`}>
                <Text className={`font-semibold ${listenInput.trim() ? 'text-white' : subText}`}>提交答案</Text>
              </Pressable>
            ) : (
              <View>
                <View className={`rounded-xl p-4 mb-3 items-center ${listenCorrect ? (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200') : (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')}`}>
                  <Ionicons name={listenCorrect ? 'checkmark-circle' : 'close-circle'} size={32} color={listenCorrect ? '#22C55E' : '#EF4444'} />
                  <Text className={`text-lg font-bold mt-2 ${listenCorrect ? 'text-green-500' : 'text-red-500'}`}>
                    {listenCorrect ? '回答正确！' : '回答错误'}
                  </Text>
                  {!listenCorrect && <Text className={`text-sm mt-1 ${textColor}`}>正确答案：<Text className="font-bold text-[#2C5F8A]">{current?.word}</Text></Text>}
                </View>
                <View className="flex-row gap-3 items-center mb-2">
                  <Text className={`text-xs ${subText}`}>得分：{listenScore.correct}/{listenScore.total}</Text>
                  <Text className={`text-xs ${subText}`}>
                    正确率：{listenScore.total > 0 ? Math.round(listenScore.correct / listenScore.total * 100) : 0}%
                  </Text>
                </View>
                <Pressable onPress={handleListenNext} className="py-3.5 rounded-xl items-center bg-[#2C5F8A]">
                  <Text className="text-white font-semibold">下一个</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ═══ 语境填空模式 ═══ */}
      {learnMode === 'context' && (
        <View className="flex-1 px-5 items-center justify-center">
          <View className={`w-full rounded-2xl border p-6 ${card}`} style={{ borderCurve: 'continuous' }}>
            <Text className={`text-xs font-medium mb-2 ${subText}`}>根据语境填入正确的单词</Text>
            <Text className={`text-sm ${subText} mb-4 leading-5`}>阅读下面的句子，填入空缺的单词</Text>
            <View className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-[#333]' : 'bg-gray-50'}`}>
              <Text className={`text-base leading-6 ${textColor}`}>{getContextSentence()}</Text>
            </View>
            <Text className={`text-xs mb-3 ${subText}`}>提示：{current?.meaning}</Text>
            <TextInput value={contextInput} onChangeText={setContextInput}
              placeholder="填入缺失的单词..." placeholderTextColor={isDark ? '#555' : '#aaa'}
              autoCapitalize="none" autoCorrect={false} editable={!contextSubmitted}
              style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 12 }} />
            {!contextSubmitted ? (
              <Pressable onPress={handleContextSubmit} disabled={!contextInput.trim()}
                className={`py-3.5 rounded-xl items-center ${contextInput.trim() ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-200'}`}>
                <Text className={`font-semibold ${contextInput.trim() ? 'text-white' : subText}`}>提交答案</Text>
              </Pressable>
            ) : (
              <View>
                <View className={`rounded-xl p-4 mb-3 items-center ${contextCorrect ? (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200') : (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')}`}>
                  <Ionicons name={contextCorrect ? 'checkmark-circle' : 'close-circle'} size={32} color={contextCorrect ? '#22C55E' : '#EF4444'} />
                  <Text className={`text-lg font-bold mt-2 ${contextCorrect ? 'text-green-500' : 'text-red-500'}`}>
                    {contextCorrect ? '填入正确！' : '填入错误'}
                  </Text>
                  {!contextCorrect && <Text className={`text-sm mt-1 ${textColor}`}>正确答案：<Text className="font-bold text-[#2C5F8A]">{current?.word}</Text></Text>}
                  {contextCorrect && <Text className={`text-sm mt-1 ${subText}`}>{current?.example}</Text>}
                </View>
                <View className="flex-row gap-3 items-center mb-2">
                  <Text className={`text-xs ${subText}`}>得分：{contextScore.correct}/{contextScore.total}</Text>
                  <Text className={`text-xs ${subText}`}>
                    正确率：{contextScore.total > 0 ? Math.round(contextScore.correct / contextScore.total * 100) : 0}%
                  </Text>
                </View>
                <Pressable onPress={handleContextNext} className="py-3.5 rounded-xl items-center bg-[#2C5F8A]">
                  <Text className="text-white font-semibold">下一个</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 底部操作栏（翻卡模式显示） */}
      {learnMode === 'normal' && (<>
        <View className="flex-row gap-3 px-5 mb-2">
          <Pressable onPress={() => handleMastery(false)}
            className={`flex-1 py-3 rounded-xl items-center flex-row justify-center gap-1 ${isDark ? 'bg-red-900' : 'bg-red-50'}`}>
            <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
            <Text className="text-red-500 font-semibold text-sm">未掌握</Text>
          </Pressable>
          <Pressable onPress={() => handleMastery(true)}
            className={`flex-1 py-3 rounded-xl items-center flex-row justify-center gap-1 ${isDark ? 'bg-green-900' : 'bg-green-50'}`}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#22C55E" />
            <Text className="text-green-600 font-semibold text-sm">已掌握</Text>
          </Pressable>
        </View>
        <View className="flex-row gap-2 px-5 mb-2">
          <Pressable onPress={handleGenerateStory}
            className={`flex-1 py-2 rounded-xl items-center ${isDark ? 'bg-[#2A3A4A]' : 'bg-blue-50'}`}>
            <Text className="text-[#2C5F8A] text-xs font-medium">AI助记</Text>
          </Pressable>
          <Pressable onPress={() => { setEditForm({ word: current?.word || '', phonetic: current?.phonetic || '', meaning: current?.meaning || '', example: current?.example || '' }); setShowEdit(true); }}
            className={`flex-1 py-2 rounded-xl items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
            <Text className={`text-xs font-medium ${subText}`}>编辑</Text>
          </Pressable>
          <Pressable onPress={handleDelete}
            className={`flex-1 py-2 rounded-xl items-center ${isDark ? 'bg-red-950' : 'bg-red-50'}`}>
            <Text className="text-red-500 text-xs font-medium">删除</Text>
          </Pressable>
        </View>
        <View className="flex-row gap-4 mt-1 mb-4 justify-center">
          <Pressable onPress={goPrev} disabled={currentIndex === 0}
            className={`w-12 h-12 rounded-full items-center justify-center ${currentIndex === 0 ? (isDark ? 'bg-[#222]' : 'bg-gray-100') : 'bg-[#2C5F8A]'}`}>
            <Ionicons name="chevron-back" size={20} color={currentIndex === 0 ? (isDark ? '#444' : '#ccc') : 'white'} />
          </Pressable>
          <Pressable onPress={goNext} disabled={currentIndex === filteredWords.length - 1}
            className={`w-12 h-12 rounded-full items-center justify-center ${currentIndex === filteredWords.length - 1 ? (isDark ? 'bg-[#222]' : 'bg-gray-100') : 'bg-[#2C5F8A]'}`}>
            <Ionicons name="chevron-forward" size={20} color={currentIndex === filteredWords.length - 1 ? (isDark ? '#444' : '#ccc') : 'white'} />
          </Pressable>
        </View>
      </>)}

      {/* 听写模式全屏覆盖 */}
      <Modal visible={dictationMode} animationType="slide">
        <SafeAreaView className={`flex-1 ${bg}`}>
          <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
            <View className="px-5 py-4">
              <View className="flex-row items-center justify-between mb-6">
                <Pressable onPress={() => setDictationMode(false)} className="p-1 -ml-1">
                  <Ionicons name="close" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
                </Pressable>
                <Text className={`text-base font-bold ${textColor}`}>听写模式</Text>
                <Text className={`text-sm ${subText}`}>{currentIndex + 1}/{filteredWords.length}</Text>
              </View>
              <View className={`rounded-xl p-3 mb-6 flex-row gap-6 items-center justify-center ${isDark ? 'bg-[#2A2A2A]' : 'bg-gray-50'}`}>
                <View className="items-center">
                  <Text className="text-lg font-bold text-green-500">{dictationScore.correct}</Text>
                  <Text className={`text-xs ${subText}`}>答对</Text>
                </View>
                <View className={`w-px h-8 ${isDark ? 'bg-[#444]' : 'bg-gray-200'}`} />
                <View className="items-center">
                  <Text className={`text-lg font-bold ${textColor}`}>{dictationScore.total}</Text>
                  <Text className={`text-xs ${subText}`}>已练</Text>
                </View>
                <View className={`w-px h-8 ${isDark ? 'bg-[#444]' : 'bg-gray-200'}`} />
                <View className="items-center">
                  <Text className="text-lg font-bold text-[#2C5F8A]">
                    {dictationScore.total > 0 ? Math.round(dictationScore.correct / dictationScore.total * 100) : 0}%
                  </Text>
                  <Text className={`text-xs ${subText}`}>正确率</Text>
                </View>
              </View>
              <View className={`rounded-2xl border p-6 mb-6 items-center ${card}`} style={{ borderCurve: 'continuous' }}>
                <Text className={`text-xs font-medium mb-3 ${subText}`}>请根据发音写出单词</Text>
                {current?.meaning ? <Text className={`text-base text-[#2C5F8A] font-medium mb-4 text-center`}>{current.meaning}</Text> : null}
                {current?.example ? <Text className={`text-sm italic text-center mb-4 ${subText}`} numberOfLines={2}>{current.example}</Text> : null}
                <Pressable onPress={() => current?.word && Speech.speak(current.word, { language: 'en-US', rate: 0.75 })}
                  className="flex-row items-center gap-2 bg-[#2C5F8A] px-5 py-2.5 rounded-full">
                  <Ionicons name="volume-high" size={18} color="white" />
                  <Text className="text-white text-sm font-semibold">播放发音</Text>
                </Pressable>
                {current?.phonetic ? <Text className={`text-sm mt-3 ${subText}`}>{current.phonetic}</Text> : null}
              </View>
              {!dictationSubmitted ? (
                <View>
                  <TextInput value={dictationInput} onChangeText={setDictationInput} placeholder="在此输入你听到的单词..."
                    placeholderTextColor={isDark ? '#555' : '#aaa'} autoCapitalize="none" autoCorrect={false}
                    style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff', color: isDark ? '#fff' : '#1a2a3a', borderRadius: 12, padding: 16, fontSize: 18, fontWeight: '600', borderWidth: 1, borderColor: isDark ? '#444' : '#E5E7EB', marginBottom: 12, textAlign: 'center' }}
                    onSubmitEditing={handleDictationSubmit} returnKeyType="done" />
                  <Pressable onPress={handleDictationSubmit} disabled={!dictationInput.trim()}
                    className={`py-4 rounded-xl items-center ${dictationInput.trim() ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-200'}`}>
                    <Text className={`font-semibold text-base ${dictationInput.trim() ? 'text-white' : subText}`}>提交答案</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  <View className={`rounded-2xl border p-5 mb-4 items-center ${dictationCorrect ? (isDark ? 'bg-green-950 border-green-800' : 'bg-green-50 border-green-200') : (isDark ? 'bg-red-950 border-red-800' : 'bg-red-50 border-red-200')}`} style={{ borderCurve: 'continuous' }}>
                    <Ionicons name={dictationCorrect ? 'checkmark-circle' : 'close-circle'} size={40} color={dictationCorrect ? '#22C55E' : '#EF4444'} />
                    <Text className={`text-lg font-bold mt-2 ${dictationCorrect ? 'text-green-500' : 'text-red-500'}`}>
                      {dictationCorrect ? '答对了！' : '加油，继续！'}
                    </Text>
                    <Text className={`text-xl font-bold mt-3 ${textColor}`}>{current?.word}</Text>
                    {!dictationCorrect && <Text className={`text-sm mt-1 ${subText}`}>你的答案：<Text className="text-red-500 font-medium">{dictationInput}</Text></Text>}
                  </View>
                  <Pressable onPress={handleDictationNext} className="py-4 rounded-xl items-center bg-[#2C5F8A]">
                    <Text className="text-white font-semibold text-base">{currentIndex >= filteredWords.length - 1 ? '完成听写' : '下一个'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal visible={showEdit} transparent animationType="slide">
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: modalBg }}>
            <Text className={`text-lg font-bold mb-4 ${textColor}`}>编辑单词</Text>
            {[{ key: 'word', label: '单词', ph: '输入单词' }, { key: 'phonetic', label: '音标', ph: '如 /ˈæpəl/' },
              { key: 'meaning', label: '释义', ph: '输入释义' }, { key: 'example', label: '例句', ph: '输入例句' }].map(({ key, label, ph }) => (
              <View key={key} className="mb-3">
                <Text className={`text-xs font-medium mb-1 ${subText}`}>{label}</Text>
                <TextInput value={(editForm as any)[key]} onChangeText={v => setEditForm(f => ({ ...f, [key]: v }))}
                  placeholder={ph} placeholderTextColor={isDark ? '#555' : '#aaa'}
                  style={{ backgroundColor: inputBg, color: inputText, borderRadius: 10, padding: 10, fontSize: 14 }} />
              </View>
            ))}
            <View className="flex-row gap-3 mt-2">
              <Pressable onPress={() => setShowEdit(false)} className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}>
                <Text className={`font-semibold ${subText}`}>取消</Text>
              </Pressable>
              <Pressable onPress={handleEditSave} className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]">
                <Text className="text-white font-semibold">保存</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* AI助记故事弹窗 */}
      <Modal visible={showStory} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: modalBg, maxHeight: '70%' }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className={`text-lg font-bold ${textColor}`}>AI 助记故事</Text>
              <Pressable onPress={() => setShowStory(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#aaa' : '#666'} />
              </Pressable>
            </View>
            <Text className={`text-sm font-medium mb-3 ${textColor}`}>{current?.word}</Text>
            <ScrollView>
              {storyLoading
                ? <View className="items-center py-6"><ActivityIndicator color="#2C5F8A" /><Text className={`text-sm mt-3 ${subText}`}>AI 正在生成故事...</Text></View>
                : <Text className={`text-sm leading-6 ${textColor}`}>{story}</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
