import { SafeAreaView } from 'react-native-safe-area-context';
/**
 * 「练」Tab - 题库列表页
 */
import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getExamPapers, deleteExamPaper, clearPracticeProgress, type ExamPaper } from '@/lib/database';

export default function PracticeTab() {
  const router = useRouter();
  const { isDark } = useAppContext();

  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteId, setShowDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  useFocusEffect(
    useCallback(() => {
      loadPapers();
    }, [])
  );

  async function loadPapers() {
    setLoading(true);
    setError(null);
    try {
      const list = await getExamPapers();
      setPapers(list);
    } catch (e: any) {
      setError(e?.message || '加载试卷失败');
    }
    setLoading(false);
  }

  async function handleDelete(id: number) {
    await deleteExamPaper(id);
    await clearPracticeProgress(id);
    setShowDeleteId(null);
    loadPapers();
  }

  async function handleReset(id: number) {
    await clearPracticeProgress(id);
    loadPapers();
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      {/* 顶部栏 */}
      <View className="px-5 pt-14 pb-4 flex-row items-center justify-between">
        <View>
          <Text className={`text-2xl font-bold ${textColor}`}>试题练习</Text>
          <Text className={`text-sm mt-1 ${subText}`}>共 {papers.length} 套试卷</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2C5F8A" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="warning-outline" size={48} color="#EF4444" />
          <Text className="text-red-500 text-sm mt-3 text-center">{error}</Text>
          <Pressable onPress={loadPapers} className="mt-4 bg-[#2C5F8A] px-6 py-2 rounded-xl">
            <Text className="text-white text-sm">重试</Text>
          </Pressable>
        </View>
      ) : papers.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="document-outline" size={64} color={isDark ? '#555' : '#ccc'} />
          <Text className={`text-base font-semibold mt-4 ${textColor}`}>暂无题库</Text>
          <Text className={`text-sm text-center mt-2 ${subText}`}>点击「立即导入」，上传 PDF/图片，AI 自动识别题型</Text>
          <Pressable
            onPress={() => router.push('/practice/import')}
            className="mt-6 bg-[#2C5F8A] px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-semibold">立即导入</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={papers}
          keyExtractor={item => item.id.toString()}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => {
            const progress = item.total_count > 0 ? item.progress / item.total_count : 0;
            const isExpanded = showDeleteId === item.id;
            return (
              <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.06)' }] }}>
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-3">
                    <Text className={`text-base font-semibold ${textColor}`} numberOfLines={2}>{item.title}</Text>
                    <Text className={`text-xs mt-1 ${subText}`}>
                      共 {item.total_count} 题 · 已完成 {item.progress} 题
                    </Text>
                    {/* 进度条 */}
                    <View className={`h-2 rounded-full mt-2 ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}>
                      <View
                        className="h-2 rounded-full bg-[#2C5F8A]"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </View>
                    <Text className={`text-xs mt-1 ${subText}`}>{Math.round(progress * 100)}%</Text>
                  </View>
                  <View className="gap-2">
                    <Pressable
                      onPress={() => router.push({ pathname: '/practice/[id]', params: { id: item.id } })}
                      className="bg-[#2C5F8A] px-3 py-1.5 rounded-lg"
                    >
                      <Text className="text-white text-xs font-semibold">
                        {item.progress > 0 ? '继续' : '开始'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowDeleteId(isExpanded ? null : item.id)}
                      className={`px-3 py-1.5 rounded-lg ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
                    >
                      <Ionicons name="ellipsis-horizontal" size={14} color={isDark ? '#aaa' : '#666'} />
                    </Pressable>
                  </View>
                </View>
                {isExpanded && (
                  <View className={`mt-3 pt-3 border-t flex-row gap-3 ${isDark ? 'border-[#444]' : 'border-gray-100'}`}>
                    <Pressable
                      onPress={() => { handleReset(item.id); }}
                      className={`flex-1 py-2 rounded-lg items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
                    >
                      <Text className={`text-xs font-medium ${subText}`}>重置进度</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push({ pathname: '/practice/wrong-answers', params: { paperId: item.id, title: item.title } })}
                      className="flex-1 py-2 rounded-lg items-center bg-orange-100"
                    >
                      <Text className="text-orange-600 text-xs font-medium">错题强化</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(item.id)}
                      className="flex-1 py-2 rounded-lg items-center bg-red-100"
                    >
                      <Text className="text-red-500 text-xs font-medium">删除</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
