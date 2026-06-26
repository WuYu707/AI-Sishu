/**
 * 艾宾浩斯复习页 - 支持词本筛选器
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import * as Speech from 'expo-speech';
import { View, Text, ScrollView, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getWordbooks, getWordsForReview, markWordMastered, type Wordbook, type Word} from '@/lib/database';

export default function ReviewScreen() {
  const router = useRouter();
  const { isDark } = useAppContext();

  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [selectedWbId, setSelectedWbId] = useState<number | null>(null);
  const [reviewWords, setReviewWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  useFocusEffect(
    useCallback(() => {
      loadData(); }, [])
  );

  async function loadData() {
    setLoading(true);
    try {
      const wbs = await getWordbooks();
      setWordbooks(wbs);
      await loadReview(null); } finally {
      setLoading(false); } }

  async function loadReview(wbId: number | null) {
    const words = await getWordsForReview(wbId ?? undefined);
    setReviewWords(words); }

  async function handleSelectWordbook(wbId: number | null) {
    setSelectedWbId(wbId);
    setLoading(true);
    await loadReview(wbId);
    setLoading(false);
    setReviewMode(false);
    setCurrentIdx(0);
    setFlipped(false); }

  async function handleMastery(mastered: boolean) {
    const current = reviewWords[currentIdx];
    if (!current) return;
    try {
      await markWordMastered(current.id, mastered);
    } catch {}
    if (currentIdx < reviewWords.length - 1) {
      setCurrentIdx(i => i + 1);
      setFlipped(false); } else {
      setReviewMode(false);
      setCurrentIdx(0);
      await loadReview(selectedWbId); } }

  const REVIEW_INTERVALS = [1, 2, 4, 7, 15];

  function getNextReviewDay(reviewCount: number, isMastered: boolean): string {
    if (!isMastered) return '明天复习';
    const idx = Math.min(reviewCount, REVIEW_INTERVALS.length - 1);
    const days = REVIEW_INTERVALS[idx];
    return `${days}天后复习`; }

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 items-center justify-center ${bg}`}>
        <ActivityIndicator size="large" color="#2C5F8A" />
      </SafeAreaView>
    ); }

  if (reviewMode && reviewWords.length > 0) {
    const current = reviewWords[currentIdx];
    return (
      <SafeAreaView className={`flex-1 ${bg}`}>
        <View className="px-4 py-2 flex-row items-center justify-between">
          <Pressable onPress={() => { setReviewMode(false); setCurrentIdx(0); }}>
            <Text className="text-[#2C5F8A] text-sm font-medium">← 退出复习</Text>
          </Pressable>
          <Text className={`text-sm ${subText}`}>{currentIdx + 1} / {reviewWords.length}</Text>
        </View>
        <View className={`mx-5 h-1 rounded-full ${isDark ? 'bg-[#333]' : 'bg-gray-200'} mb-6`}>
          <View className="h-1 rounded-full bg-[#E67E22]" style={{ width: `${((currentIdx + 1) / reviewWords.length) * 100}%` }} />
        </View>

        <View className="flex-1 px-5 items-center justify-center">
          <Pressable
            onPress={() => setFlipped(f => !f)}
            className={`w-full rounded-2xl border p-8 items-center ${card}`}
            style={{ borderCurve: 'continuous', minHeight: 250, boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.08)' }] }}
          >
            <Text className={`text-4xl font-bold mb-3 ${textColor}`}>{current?.word}</Text>
            {current?.phonetic && <Text className={`text-lg ${subText} mb-3`}>{current.phonetic}</Text>}
            {flipped ? (
              <>
                <View className={`h-px w-full ${isDark ? 'bg-[#444]' : 'bg-gray-100'} mb-4`} />
                <Text className="text-base text-[#2C5F8A] font-medium text-center">{current?.meaning}</Text>
                {current?.example && <Text className={`text-sm italic mt-3 text-center ${subText}`}>{current.example}</Text>}
              </>
            ) : (
              <Text className={`text-sm mt-4 ${subText}`}>点击翻转查看释义</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => { if (current?.word) Speech.speak(current.word, { language: 'en-US', rate: 0.85 }); }}
            className={`mt-3 px-4 py-2 rounded-full flex-row items-center gap-1.5 ${isDark ? 'bg-[#333]' : 'bg-blue-50'}`}
          >
            <Ionicons name="volume-medium-outline" size={14} color="#2C5F8A" />
            <Text className="text-[#2C5F8A] text-xs font-medium">朗读发音</Text>
          </Pressable>

          <View className="flex-row gap-3 mt-6 w-full">
            <Pressable
              onPress={() => handleMastery(false)}
              className={`flex-1 py-4 rounded-xl items-center ${isDark ? 'bg-red-900' : 'bg-red-50'}`}
            >
              <Ionicons name="close-circle-outline" size={22} color="#EF4444" />
              <Text className="text-red-500 font-semibold text-sm mt-1">未掌握</Text>
              <Text className="text-red-400 text-xs">重置复习周期</Text>
            </Pressable>
            <Pressable
              onPress={() => handleMastery(true)}
              className={`flex-1 py-4 rounded-xl items-center ${isDark ? 'bg-green-900' : 'bg-green-50'}`}
            >
              <Ionicons name="checkmark-circle-outline" size={22} color="#22C55E" />
              <Text className="text-green-600 font-semibold text-sm mt-1">已掌握</Text>
              <Text className="text-green-500 text-xs">{getNextReviewDay(current?.review_count || 0, true)}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    ); }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      {/* 顶部返回栏 */}
      <View className="flex-row items-center gap-3 px-5 pt-3 pb-2">
        <Pressable onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
        </Pressable>
        <Text className={`text-base font-bold flex-1 ${textColor}`}>艾宾浩斯复习</Text>
      </View>
      {/* 词本选择器 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 py-3" style={{ flexGrow: 0 }}>
        <View className="flex-row gap-2">
          {[{ id: null, name: '全部词本' }, ...wordbooks].map(wb => (
            <Pressable
              key={wb.id ?? -1}
              onPress={() => handleSelectWordbook(wb.id ?? null)}
              style={{ flexShrink: 0 }}
              className={`px-4 py-2 rounded-full ${selectedWbId === (wb.id ?? null) ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-200'}`}
            >
              <Text className={`text-xs font-medium ${selectedWbId === (wb.id ?? null) ? 'text-white' : subText}`}>
                {wb.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {reviewWords.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="checkmark-circle-outline" size={64} color="#22C55E" />
          <Text className={`text-base font-semibold mt-4 ${textColor}`}>暂无需复习的单词</Text>
          <Text className={`text-sm text-center mt-2 ${subText}`}>继续学习新单词，系统会自动安排艾宾浩斯复习计划</Text>
        </View>
      ) : (
        <View className="flex-1">
          <View className="px-5 py-3 flex-row items-center justify-between">
            <Text className={`text-base font-semibold ${textColor}`}>今日待复习 {reviewWords.length} 词</Text>
            <Pressable
              onPress={() => { setReviewMode(true); setCurrentIdx(0); setFlipped(false); }}
              className="bg-[#E67E22] px-4 py-2 rounded-xl flex-row items-center gap-1"
            >
              <Ionicons name="play" size={14} color="white" />
              <Text className="text-white text-sm font-semibold">开始复习</Text>
            </Pressable>
          </View>

          <FlatList
            data={reviewWords}
            keyExtractor={item => item.id.toString()}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
            ItemSeparatorComponent={() => <View className="h-2" />}
            renderItem={({ item }) => (
              <View className={`rounded-xl border p-3 flex-row items-center justify-between ${card}`} style={{ borderCurve: 'continuous' }}>
                <View>
                  <Text className={`text-sm font-semibold ${textColor}`}>{item.word}</Text>
                  {item.phonetic && <Text className={`text-xs ${subText}`}>{item.phonetic}</Text>}
                </View>
                <Text className={`text-xs px-2 py-1 rounded-full ${isDark ? 'bg-[#333] text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                  第{(item.review_count || 0) + 1}次复习
                </Text>
              </View>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  ); }
