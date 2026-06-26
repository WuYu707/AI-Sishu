/**
 * 动态复习推荐页 - 基于掌握度AI推荐
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getWordbooks, getWordsForReview, type Wordbook, type Word} from '@/lib/database';
import { getReviewRecommendation } from '@/lib/aiService';

interface RecommendedWord extends Word {
  reason?: string;
  priority?: number; }

export default function ReviewRecommendScreen() {
  const router = useRouter();
  const { isDark, activeAiConfig } = useAppContext();

  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [selectedWbId, setSelectedWbId] = useState<number | null>(null);
  const [words, setWords] = useState<RecommendedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');

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
      await loadRecommendations(null); } finally {
      setLoading(false); } }

  async function loadRecommendations(wbId: number | null) {
    setSelectedWbId(wbId);
    const result = await getWordsForReview(wbId ?? undefined);
    setWords(result);
    setAiSuggestion(''); }

  async function handleAiAnalyze() {
    const hasAi = !!activeAiConfig;
    if (!hasAi || words.length === 0) return;
    setAiLoading(true);
    try {
      const wordList = words.map(w => ({ word: w.word, mastered: !!w.mastered, review_count: w.review_count || 0 }));
      const suggestions = await getReviewRecommendation(wordList, activeAiConfig);
      setAiSuggestion(suggestions.length > 0 ? `推荐优先复习：${suggestions.join('、')}` : '暂无额外推荐，继续保持！');
    } catch {
      setAiSuggestion('AI 分析失败，请稍后重试');
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) {
    return <View className={`flex-1 items-center justify-center ${bg}`}><ActivityIndicator size="large" color="#2C5F8A" /></View>; }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      {/* 顶部标题栏 + 返回按钮 */}
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <Pressable onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
        </Pressable>
        <Text className={`text-lg font-bold ${textColor}`}>动态复习推荐</Text>
      </View>

      {/* 词本筛选器 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 py-3" style={{ maxHeight: 52, flexGrow: 0 }}>
        <View className="flex-row gap-2">
          {[{ id: null, name: '全部词本' }, ...wordbooks].map(wb => (
            <Pressable
              key={wb.id ?? -1}
              onPress={() => loadRecommendations(wb.id ?? null)}
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

      {/* AI 分析按钮 */}
      {words.length > 0 && (
        <View className="px-5 pb-3">
          <Pressable
            onPress={handleAiAnalyze}
            disabled={!activeAiConfig || aiLoading}
            style={{
              backgroundColor: !activeAiConfig
                ? (isDark ? '#222' : '#f3f4f6')
                : '#2C5F8A'
            }}
          >
            {aiLoading
              ? <ActivityIndicator size="small" color={activeAiConfig ? 'white' : '#aaa'} />
              : <Ionicons name="sparkles-outline" size={16} color={activeAiConfig ? 'white' : (isDark ? '#555' : '#aaa')} />}
            <Text className={`text-sm font-semibold ${!activeAiConfig ? (isDark ? 'text-gray-600' : 'text-gray-400') : 'text-white'}`}>
              {aiLoading ? 'AI 分析中...' : activeAiConfig ? 'AI 智能学习建议' : '请先配置 AI 服务'}
            </Text>
          </Pressable>

          {aiSuggestion ? (
            <View className={`mt-3 rounded-xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="bulb-outline" size={16} color="#E67E22" />
                <Text className={`text-xs font-semibold ${textColor}`}>AI 学习建议</Text>
              </View>
              <Text className={`text-sm leading-5 ${textColor}`}>{aiSuggestion}</Text>
            </View>
          ) : null}
        </View>
      )}

      {words.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="library-outline" size={64} color={isDark ? '#555' : '#ccc'} />
          <Text className={`text-base font-semibold mt-4 ${textColor}`}>暂无词汇</Text>
          <Text className={`text-sm text-center mt-2 ${subText}`}>请先导入词本，再使用动态复习推荐功能</Text>
        </View>
      ) : (
        <FlatList
          data={words}
          keyExtractor={item => item.id.toString()}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListHeaderComponent={() => (
            <Text className={`text-sm ${subText} mb-3`}>推荐复习 {words.length} 个单词（优先未掌握）</Text>
          )}
          renderItem={({ item, index }) => (
            <View
              className={`rounded-xl border p-3 flex-row items-center gap-3 ${card}`}
              style={{ borderCurve: 'continuous' }}
            >
              <View className={`w-8 h-8 rounded-full items-center justify-center ${
                item.mastered ? 'bg-green-100' : index < 5 ? 'bg-red-100' : (isDark ? 'bg-[#333]' : 'bg-gray-100') }`}>
                <Ionicons
                  name={item.mastered ? 'checkmark' : index < 5 ? 'alert' : 'ellipsis-horizontal'}
                  size={14}
                  color={item.mastered ? '#22C55E' : index < 5 ? '#EF4444' : (isDark ? '#666' : '#999')}
                />
              </View>
              <View className="flex-1">
                <Text className={`text-sm font-semibold ${textColor}`}>{item.word}</Text>
                {item.phonetic && <Text className={`text-xs ${subText}`}>{item.phonetic}</Text>}
                <Text className={`text-xs mt-0.5 ${subText}`}>复习 {item.review_count || 0} 次</Text>
              </View>
              <View className={`px-2 py-1 rounded-full ${item.mastered ? 'bg-green-100' : 'bg-orange-100'}`}>
                <Text className={`text-xs font-medium ${item.mastered ? 'text-green-600' : 'text-orange-600'}`}>
                  {item.mastered ? '已掌握' : '待复习'}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  ); }
