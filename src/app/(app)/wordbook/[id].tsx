/**
 * 单词卡学习页 - 卡片翻转、已掌握/未掌握、编辑、删除、搜索、听写模式
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
import { generateMnemonicStory, isLocalAiAvailable } from '@/lib/aiService';

export default function WordCardScreen() {
  const { id } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const { isDark, activeAiConfig, localAiConfig } = useAppContext();

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

  const flipAnim = useRef(new Animated.Value(0)).current;

  // 组件卸载时停止 TTS
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

  useFocusEffect(
    useCallback(() => {
      loadWords();
    }, [id])
  );

  async function loadWords() {
    setLoading(true);
    try {
      const list = await getWords(Number(id));
      setWords(list);
      setCurrentIndex(0);
      setFlipped(false);
    } finally {
      setLoading(false);
    }
  }

  function handleFlip() {
    Animated.timing(flipAnim, {
      toValue: flipped ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setFlipped(f => !f));
  }

  function goNext() {
    if (currentIndex < filteredWords.length - 1) {
      setCurrentIndex(i => i + 1);
      setFlipped(false);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
      setFlipped(false);
    }
  }

  async function handleMastery(mastered: boolean) {
    if (!current) return;
    await markWordMastered(current.id, mastered);
    // 仅"已掌握"时计入今日新词数
    if (mastered) {
      await updateTodayStat({ new_words: 1 }).catch(() => {});
    }
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
    const hasAi = activeAiConfig || isLocalAiAvailable(localAiConfig);
    if (!current) return;
    if (!hasAi) {
      setStory('未配置 AI 服务，请前往「我」→「AI服务配置」');
      setShowStory(true);
      return;
    }
    setShowStory(true);
    setStoryLoading(true);
    try {
      const s = await generateMnemonicStory(current.word, current.meaning, activeAiConfig, localAiConfig);
      setStory(s);
    } catch {
      setStory('AI 生成失败，请稍后重试');
    } finally {
      setStoryLoading(false);
    }
  }

  // 搜索处理
  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const results = await searchWords(Number(id), q.trim());
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }

  function openDictationMode() {
    setDictationMode(true);
    setDictationInput('');
    setDictationSubmitted(false);
    setDictationCorrect(null);
    setDictationScore({ correct: 0, total: 0 });
    setCurrentIndex(0);
    setFlipped(false);
    // 自动朗读第一个词
    const first = filteredWords[0];
    if (first?.word) {
      setTimeout(() => Speech.speak(first.word, { language: 'en-US', rate: 0.75 }), 300);
    }
  }

  function handleDictationSubmit() {
    if (!current || !dictationInput.trim()) return;
    const isCorrect = dictationInput.trim().toLowerCase() === current.word.toLowerCase();
    setDictationCorrect(isCorrect);
    setDictationSubmitted(true);
    setDictationScore(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    if (isCorrect) markWordMastered(current.id, true).catch(() => {});
  }

  function handleDictationNext() {
    if (currentIndex < filteredWords.length - 1) {
      setCurrentIndex(i => i + 1);
      setDictationInput('');
      setDictationSubmitted(false);
      setDictationCorrect(null);
      const next = filteredWords[currentIndex + 1];
      if (next?.word) {
        setTimeout(() => Speech.speak(next.word, { language: 'en-US', rate: 0.75 }), 200);
      }
    } else {
      // 听写完成
      setDictationMode(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 items-center justify-center ${bg}`}>
        <ActivityIndicator size="large" color="#2C5F8A" />
      </SafeAreaView>
    );
  }

  if (filteredWords.length === 0) {
    return (
      <SafeAreaView className={`flex-1 ${bg}`}>
        <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
          <Pressable onPress={() => router.back()} className="p-1 -ml-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="albums-outline" size={64} color={isDark ? '#555' : '#ccc'} />
          <Text className={`text-base font-semibold mt-4 ${textColor}`}>
            {filter === 'unmastered' ? '🎉 全部已掌握！' : '词本暂无单词'}
          </Text>
          {filter === 'unmastered' && (
            <Pressable onPress={() => { setFilter('all'); setCurrentIndex(0); }} className="mt-4 bg-[#2C5F8A] px-6 py-3 rounded-xl">
              <Text className="text-white font-semibold">查看全部单词</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

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
            <Pressable
              key={f}
              onPress={() => { setFilter(f); setCurrentIndex(0); setFlipped(false); }}
              className={`px-3 py-1.5 rounded-lg ${filter === f ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
            >
              <Text className={`text-xs font-medium ${filter === f ? 'text-white' : subText}`}>
                {f === 'all' ? `全部(${words.length})` : `未掌握(${words.filter(w => !w.mastered).length})`}
              </Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row gap-2 items-center">
          {/* 搜索按钮 */}
          <Pressable
            onPress={() => setShowSearch(s => !s)}
            className={`p-2 rounded-lg ${showSearch ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
          >
            <Ionicons name="search-outline" size={16} color={showSearch ? 'white' : (isDark ? '#aaa' : '#666')} />
          </Pressable>
          {/* 听写模式按钮 */}
          <Pressable
            onPress={openDictationMode}
            className={`px-2.5 py-1.5 rounded-lg flex-row items-center gap-1 ${isDark ? 'bg-[#2A3A2A]' : 'bg-green-50'}`}
          >
            <Ionicons name="pencil-outline" size={14} color="#2E6B5C" />
            <Text className="text-xs font-medium text-[#2E6B5C]">听写</Text>
          </Pressable>
          <Text className={`text-sm ${subText}`}>{currentIndex + 1}/{filteredWords.length}</Text>
        </View>
      </View>

      {/* 搜索框（可折叠） */}
      {showSearch && (
        <View className="px-4 pb-2">
          <View className={`flex-row items-center rounded-xl px-3 gap-2 ${isDark ? 'bg-[#2A2A2A] border border-[#444]' : 'bg-white border border-gray-200'}`}>
            <Ionicons name="search-outline" size={16} color={isDark ? '#888' : '#aaa'} />
            <TextInput
              value={searchQuery}
              onChangeText={handleSearch}
              placeholder="搜索单词、释义..."
              placeholderTextColor={isDark ? '#666' : '#aaa'}
              autoFocus
              style={{ flex: 1, color: isDark ? '#fff' : '#1a2a3a', paddingVertical: 10, fontSize: 14 }}
            />
            {searching && <ActivityIndicator size="small" color="#2C5F8A" />}
            {searchQuery.length > 0 && !searching && (
              <Pressable onPress={() => { setSearchQuery(''); setSearchResults(null); }}>
                <Ionicons name="close-circle" size={16} color={isDark ? '#666' : '#ccc'} />
              </Pressable>
            )}
          </View>
          {/* 搜索结果列表 */}
          {searchResults !== null && (
            <View className={`mt-2 rounded-xl border overflow-hidden ${card}`} style={{ maxHeight: 240 }}>
              {searchResults.length === 0 ? (
                <View className="p-4 items-center">
                  <Text className={`text-sm ${subText}`}>未找到匹配的单词</Text>
                </View>
              ) : (
                <ScrollView nestedScrollEnabled>
                  {searchResults.map((w, i) => (
                    <Pressable
                      key={w.id}
                      onPress={() => {
                        // 定位到该词
                        const idx = filteredWords.findIndex(fw => fw.id === w.id);
                        if (idx >= 0) {
                          setCurrentIndex(idx);
                          setFlipped(false);
                        }
                        setShowSearch(false);
                        setSearchQuery('');
                        setSearchResults(null);
                      }}
                      className={`px-4 py-3 flex-row items-center gap-3 ${i > 0 ? (isDark ? 'border-t border-[#333]' : 'border-t border-gray-100') : ''}`}
                    >
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
      <View className={`mx-5 h-1 rounded-full ${isDark ? 'bg-[#333]' : 'bg-gray-200'} mb-6`}>
        <View
          className="h-1 rounded-full bg-[#2C5F8A]"
          style={{ width: `${((currentIndex + 1) / filteredWords.length) * 100}%` }}
        />
      </View>

      {/* 单词卡片 */}
      <View className="flex-1 px-5 items-center justify-center">
        <Pressable onPress={handleFlip} className="w-full" style={{ minHeight: 280 }}>
          {/* 正面 */}
          <Animated.View
            className={`absolute w-full rounded-2xl border p-6 items-center justify-center ${card}`}
            style={{
              borderCurve: 'continuous',
              minHeight: 280,
              backfaceVisibility: 'hidden',
              transform: [{ rotateY: frontInterpolate }],
              boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.08)' }],
            }}
          >
            <Text className={`text-4xl font-bold mb-3 ${textColor}`}>{current?.word}</Text>
            {current?.phonetic ? (
              <Text className={`text-lg ${subText} mb-2`}>{current.phonetic}</Text>
            ) : null}
            <Pressable
              onPress={() => { if (current?.word) Speech.speak(current.word, { language: 'en-US', rate: 0.85 }); }}
              className={`mt-2 px-4 py-2 rounded-full flex-row items-center gap-2 ${isDark ? 'bg-[#333]' : 'bg-blue-50'}`}
            >
              <Ionicons name="volume-medium-outline" size={16} color="#2C5F8A" />
              <Text className="text-[#2C5F8A] text-xs font-medium">朗读发音</Text>
            </Pressable>
            <Text className={`text-sm ${subText} mt-4`}>点击翻转查看释义</Text>
            {current?.mastered ? (
              <View className="absolute top-3 right-3 bg-green-100 px-2 py-1 rounded-full flex-row items-center gap-1">
                <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                <Text className="text-green-600 text-xs">已掌握</Text>
              </View>
            ) : null}
          </Animated.View>

          {/* 背面 */}
          <Animated.View
            className={`absolute w-full rounded-2xl border p-6 ${card}`}
            style={{
              borderCurve: 'continuous',
              minHeight: 280,
              backfaceVisibility: 'hidden',
              transform: [{ rotateY: backInterpolate }],
              boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.08)' }],
            }}
          >
            <Text className={`text-2xl font-bold mb-1 ${textColor}`}>{current?.word}</Text>
            {current?.phonetic ? <Text className={`text-sm ${subText} mb-3`}>{current.phonetic}</Text> : null}
            <Pressable
              onPress={() => { if (current?.word) Speech.speak(current.word, { language: 'en-US', rate: 0.85 }); }}
              className={`mb-3 px-3 py-1.5 rounded-full flex-row items-center gap-1.5 self-start ${isDark ? 'bg-[#333]' : 'bg-blue-50'}`}
            >
              <Ionicons name="volume-medium-outline" size={14} color="#2C5F8A" />
              <Text className="text-[#2C5F8A] text-xs font-medium">朗读</Text>
            </Pressable>
            <Text className={`text-base text-[#2C5F8A] font-medium mb-3`}>{current?.meaning || '暂无释义'}</Text>
            {current?.example ? (
              <>
                <View className={`h-px ${isDark ? 'bg-[#444]' : 'bg-gray-100'} mb-3`} />
                <Text className={`text-sm italic ${subText} leading-5`}>{current.example}</Text>
              </>
            ) : null}
          </Animated.View>
        </Pressable>

        {/* 操作按钮 */}
        <View className="flex-row gap-3 mt-6 w-full">
          <Pressable
            onPress={() => handleMastery(false)}
            className={`flex-1 py-3 rounded-xl items-center flex-row justify-center gap-1 ${isDark ? 'bg-red-900' : 'bg-red-50'}`}
          >
            <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
            <Text className="text-red-500 font-semibold text-sm">未掌握</Text>
          </Pressable>
          <Pressable
            onPress={() => handleMastery(true)}
            className={`flex-1 py-3 rounded-xl items-center flex-row justify-center gap-1 ${isDark ? 'bg-green-900' : 'bg-green-50'}`}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#22C55E" />
            <Text className="text-green-600 font-semibold text-sm">已掌握</Text>
          </Pressable>
        </View>

        {/* AI助记 + 编辑 + 删除 */}
        <View className="flex-row gap-2 mt-3 w-full">
          <Pressable
            onPress={handleGenerateStory}
            className={`flex-1 py-2 rounded-xl items-center ${isDark ? 'bg-[#2A3A4A]' : 'bg-blue-50'}`}
          >
            <Text className="text-[#2C5F8A] text-xs font-medium">✨ AI助记</Text>
          </Pressable>
          <Pressable
            onPress={() => { setEditForm({ word: current?.word || '', phonetic: current?.phonetic || '', meaning: current?.meaning || '', example: current?.example || '' }); setShowEdit(true); }}
            className={`flex-1 py-2 rounded-xl items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
          >
            <Text className={`text-xs font-medium ${subText}`}>✏️ 编辑</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            className={`flex-1 py-2 rounded-xl items-center ${isDark ? 'bg-red-950' : 'bg-red-50'}`}
          >
            <Text className="text-red-500 text-xs font-medium">🗑️ 删除</Text>
          </Pressable>
        </View>

        {/* 翻页 */}
        <View className="flex-row gap-4 mt-4">
          <Pressable
            onPress={goPrev}
            disabled={currentIndex === 0}
            className={`w-12 h-12 rounded-full items-center justify-center ${currentIndex === 0 ? (isDark ? 'bg-[#222]' : 'bg-gray-100') : 'bg-[#2C5F8A]'}`}
          >
            <Ionicons name="chevron-back" size={20} color={currentIndex === 0 ? (isDark ? '#444' : '#ccc') : 'white'} />
          </Pressable>
          <Pressable
            onPress={goNext}
            disabled={currentIndex === filteredWords.length - 1}
            className={`w-12 h-12 rounded-full items-center justify-center ${currentIndex === filteredWords.length - 1 ? (isDark ? 'bg-[#222]' : 'bg-gray-100') : 'bg-[#2C5F8A]'}`}
          >
            <Ionicons name="chevron-forward" size={20} color={currentIndex === filteredWords.length - 1 ? (isDark ? '#444' : '#ccc') : 'white'} />
          </Pressable>
        </View>
      </View>

      {/* 听写模式全屏覆盖 */}
      <Modal visible={dictationMode} animationType="slide">
        <SafeAreaView className={`flex-1 ${bg}`}>
          <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
            <View className="px-5 py-4">
              {/* 顶栏 */}
              <View className="flex-row items-center justify-between mb-6">
                <Pressable onPress={() => setDictationMode(false)} className="p-1 -ml-1">
                  <Ionicons name="close" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
                </Pressable>
                <Text className={`text-base font-bold ${textColor}`}>听写模式</Text>
                <Text className={`text-sm ${subText}`}>{currentIndex + 1}/{filteredWords.length}</Text>
              </View>

              {/* 得分统计 */}
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

              {/* 提示区：播放发音 + 释义提示 */}
              <View className={`rounded-2xl border p-6 mb-6 items-center ${card}`} style={{ borderCurve: 'continuous' }}>
                <Text className={`text-xs font-medium mb-3 ${subText}`}>请根据发音写出单词</Text>
                {current?.meaning ? (
                  <Text className={`text-base text-[#2C5F8A] font-medium mb-4 text-center`}>{current.meaning}</Text>
                ) : null}
                {current?.example ? (
                  <Text className={`text-sm italic text-center mb-4 ${subText}`} numberOfLines={2}>{current.example}</Text>
                ) : null}
                <Pressable
                  onPress={() => { if (current?.word) Speech.speak(current.word, { language: 'en-US', rate: 0.75 }); }}
                  className="flex-row items-center gap-2 bg-[#2C5F8A] px-5 py-2.5 rounded-full"
                >
                  <Ionicons name="volume-high" size={18} color="white" />
                  <Text className="text-white text-sm font-semibold">播放发音</Text>
                </Pressable>
                {current?.phonetic ? (
                  <Text className={`text-sm mt-3 ${subText}`}>{current.phonetic}</Text>
                ) : null}
              </View>

              {/* 输入区 */}
              {!dictationSubmitted ? (
                <View>
                  <TextInput
                    value={dictationInput}
                    onChangeText={setDictationInput}
                    placeholder="在此输入你听到的单词..."
                    placeholderTextColor={isDark ? '#555' : '#aaa'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff', color: isDark ? '#fff' : '#1a2a3a', borderRadius: 12, padding: 16, fontSize: 18, fontWeight: '600', borderWidth: 1, borderColor: isDark ? '#444' : '#E5E7EB', marginBottom: 12, textAlign: 'center' }}
                    onSubmitEditing={handleDictationSubmit}
                    returnKeyType="done"
                  />
                  <Pressable
                    onPress={handleDictationSubmit}
                    disabled={!dictationInput.trim()}
                    className={`py-4 rounded-xl items-center ${dictationInput.trim() ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-200'}`}
                  >
                    <Text className={`font-semibold text-base ${dictationInput.trim() ? 'text-white' : subText}`}>提交答案</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  {/* 判题结果 */}
                  <View className={`rounded-2xl border p-5 mb-4 items-center ${dictationCorrect ? (isDark ? 'bg-green-950 border-green-800' : 'bg-green-50 border-green-200') : (isDark ? 'bg-red-950 border-red-800' : 'bg-red-50 border-red-200')}`} style={{ borderCurve: 'continuous' }}>
                    <Ionicons name={dictationCorrect ? 'checkmark-circle' : 'close-circle'} size={40} color={dictationCorrect ? '#22C55E' : '#EF4444'} />
                    <Text className={`text-lg font-bold mt-2 ${dictationCorrect ? 'text-green-500' : 'text-red-500'}`}>
                      {dictationCorrect ? '答对了！' : '加油，继续！'}
                    </Text>
                    <Text className={`text-xl font-bold mt-3 ${textColor}`}>{current?.word}</Text>
                    {!dictationCorrect && (
                      <Text className={`text-sm mt-1 ${subText}`}>你的答案：<Text className="text-red-500 font-medium">{dictationInput}</Text></Text>
                    )}
                  </View>
                  <Pressable
                    onPress={handleDictationNext}
                    className="py-4 rounded-xl items-center bg-[#2C5F8A]"
                  >
                    <Text className="text-white font-semibold text-base">
                      {currentIndex >= filteredWords.length - 1 ? '完成听写' : '下一个'}
                    </Text>
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
            {[
              { key: 'word', label: '单词', ph: '输入单词' },
              { key: 'phonetic', label: '音标', ph: '如 /ˈæpəl/' },
              { key: 'meaning', label: '释义', ph: '输入释义' },
              { key: 'example', label: '例句', ph: '输入例句' },
            ].map(({ key, label, ph }) => (
              <View key={key} className="mb-3">
                <Text className={`text-xs font-medium mb-1 ${subText}`}>{label}</Text>
                <TextInput
                  value={(editForm as any)[key]}
                  onChangeText={v => setEditForm(f => ({ ...f, [key]: v }))}
                  placeholder={ph}
                  placeholderTextColor={isDark ? '#555' : '#aaa'}
                  style={{ backgroundColor: inputBg, color: inputText, borderRadius: 10, padding: 10, fontSize: 14 }}
                />
              </View>
            ))}
            <View className="flex-row gap-3 mt-2">
              <Pressable
                onPress={() => setShowEdit(false)}
                className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}
              >
                <Text className={`font-semibold ${subText}`}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleEditSave}
                className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]"
              >
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
              <Text className={`text-lg font-bold ${textColor}`}>✨ AI 助记故事</Text>
              <Pressable onPress={() => setShowStory(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#aaa' : '#666'} />
              </Pressable>
            </View>
            <Text className={`text-sm font-medium mb-3 ${textColor}`}>{current?.word}</Text>
            <ScrollView>
              {storyLoading
                ? <View className="items-center py-6"><ActivityIndicator color="#2C5F8A" /><Text className={`text-sm mt-3 ${subText}`}>AI 正在生成故事...</Text></View>
                : <Text className={`text-sm leading-6 ${textColor}`}>{story}</Text>
              }
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
