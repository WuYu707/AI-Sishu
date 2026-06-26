/**
 * 错题强化页 - 专项练习（真实作答 + 计分）、AI生成相似题、导出错题集
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, FlatList, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import {
  getWrongAnswers, getSimilarQuestions, saveSimilarQuestion,
  updateTodayStat, saveAnswerRecord,
  simpleHash, type Question, type SimilarQuestion
} from '@/lib/database';
import { generateSimilarQuestion } from '@/lib/aiService';

// Web 环境：Blob 触发下载
function downloadTextOnWeb(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface WrongItem {
  question: Question;
  user_answer: string;
  similarQuestions: SimilarQuestion[];
}

export default function WrongAnswersScreen() {
  const router = useRouter();
  const { paperId } = useLocalSearchParams<{ paperId: string }>();
  const { isDark, activeAiConfig } = useAppContext();

  const [items, setItems] = useState<WrongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceItem, setPracticeItem] = useState<WrongItem | null>(null);
  const [practiceQIdx, setPracticeQIdx] = useState(0);

  // 专项练习作答状态
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);
  const [practiceScore, setPracticeScore] = useState({ correct: 0, total: 0 });

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [paperId])
  );

  async function loadData() {
    setLoading(true);
    try {
      const wrongs = paperId
        ? await getWrongAnswers(Number(paperId))
        : [];
      const withSimilar: WrongItem[] = [];
      for (const w of wrongs) {
        const similar = await getSimilarQuestions(w.question.id);
        withSimilar.push({
          question: w.question,
          user_answer: w.user_answer || '',
          similarQuestions: similar,
        });
      }
      setItems(withSimilar);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateSimilar(idx: number) {
    const item = items[idx];
    const hasAi = !!activeAiConfig;
    if (!hasAi) return;
    if (item.similarQuestions.length >= 5) return;
    setGeneratingIdx(idx);
    try {
      const result = await generateSimilarQuestion(
        item.question.content,
        item.question.answer || '',
        activeAiConfig,
      );
      if (!result) return;
      const contentStr = result.content;
      const hash = simpleHash(contentStr);
      // 检查是否重复
      const isDup = item.similarQuestions.some(sq => sq.content_hash === hash);
      if (isDup) return;
      const newSQ: Omit<SimilarQuestion, 'id' | 'created_at'> = {
        original_question_id: item.question.id,
        content: contentStr,
        type: item.question.type,
        options: JSON.stringify(result.options || []),
        answer: result.answer || '',
        content_hash: hash,
      };
      await saveSimilarQuestion(newSQ);
      const updated = await getSimilarQuestions(item.question.id);
      setItems(prev => prev.map((it, i) =>
        i === idx ? { ...it, similarQuestions: updated } : it
      ));
    } catch {
      // 静默失败
    } finally {
      setGeneratingIdx(null);
    }
  }

  async function handleExport() {
    try {
      const csvLines = ['题目,正确答案,我的答案,类型'];
      for (const item of items) {
        const row = [
          `"${(item.question.content || '').replace(/"/g, '""')}"`,
          `"${item.question.answer || ''}"`,
          `"${item.user_answer}"`,
          `"${item.question.type}"`,
        ].join(',');
        csvLines.push(row);
      }
      const csv = csvLines.join('\n');
      if (process.env.EXPO_OS === 'web') {
        downloadTextOnWeb(csv, `错题集_${Date.now()}.csv`, 'text/csv');
      } else {
        const path = FileSystem.cacheDirectory + `错题集_${Date.now()}.csv`;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: '导出错题集' });
      }
    } catch {
      // 导出失败静默处理
    }
  }

  function startPractice() {
    setPracticeItem(items[0]);
    setPracticeQIdx(0);
    setSelectedOption(null);
    setPracticeSubmitted(false);
    setPracticeScore({ correct: 0, total: 0 });
    setPracticeMode(true);
  }

  function handlePracticeSelect(option: string) {
    if (practiceSubmitted) return;
    setSelectedOption(option);
  }

  async function handlePracticeSubmit() {
    if (!practiceItem || practiceSubmitted) return;
    const q = practiceItem.question;
    const isChoiceQ = q.type === 'single_choice' || q.type === 'multiple_choice';
    if (isChoiceQ && !selectedOption) return;
    const answer = isChoiceQ ? (selectedOption ?? '') : q.answer;
    const correct = answer.trim().toUpperCase() === (q.answer || '').trim().toUpperCase();
    setPracticeSubmitted(true);
    const newScore = { correct: practiceScore.correct + (correct ? 1 : 0), total: practiceScore.total + 1 };
    setPracticeScore(newScore);
    await saveAnswerRecord(Number(paperId || 0) || 1, q.id, answer, correct).catch(() => {});
    await updateTodayStat({ question_count: 1 }).catch(() => {});
  }

  function handlePracticeNext() {
    const nextIdx = practiceQIdx + 1;
    if (nextIdx < items.length) {
      setPracticeQIdx(nextIdx);
      setPracticeItem(items[nextIdx]);
      setSelectedOption(null);
      setPracticeSubmitted(false);
    } else {
      setPracticeMode(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 ${bg}`}>
        <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
          <Pressable onPress={() => router.back()} className="p-1 -ml-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
          <Text className={`text-lg font-bold ${textColor}`}>错题强化</Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2C5F8A" />
        </View>
      </SafeAreaView>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView className={`flex-1 items-center justify-center px-8 ${bg}`}>
        <View className="flex-row items-center gap-3 absolute top-4 left-4">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
        </View>
        <Ionicons name="checkmark-circle-outline" size={64} color="#22C55E" />
        <Text className={`text-base font-semibold mt-4 ${textColor}`}>暂无错题，继续加油！</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      {/* 顶部标题栏 + 返回按钮 */}
      <View className={`px-5 py-3 flex-row justify-between items-center border-b ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} className="p-1 -ml-1 mr-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
          <Text className={`text-sm ${subText}`}>共 {items.length} 道错题</Text>
        </View>
        <View className="flex-row gap-2">
          {items.length > 0 && (
            <Pressable
              onPress={startPractice}
              className={`flex-row items-center gap-1 px-3 py-1.5 rounded-lg ${isDark ? 'bg-orange-900' : 'bg-orange-50'}`}
            >
              <Ionicons name="fitness-outline" size={14} color="#E67E22" />
              <Text className="text-orange-500 text-xs font-semibold">专项练习</Text>
            </Pressable>
          )}
          <Pressable onPress={handleExport} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2C5F8A]">
            <Ionicons name="download-outline" size={14} color="white" />
            <Text className="text-white text-xs font-semibold">导出</Text>
          </Pressable>
        </View>
      </View>

      {/* 薄弱点分析 */}
      {items.length > 0 && (
        <View className="px-5 mb-2 mt-2">
          <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="analytics-outline" size={16} color="#E67E22" />
              <Text className={`text-sm font-semibold ${textColor}`}>薄弱点分析</Text>
            </View>
            <View className="flex-row gap-2 flex-wrap mb-2">
              {(() => {
                const typeMap: Record<string, number> = {};
                items.forEach(item => { const t = item.question.type || '其他'; typeMap[t] = (typeMap[t] || 0) + 1; });
                const TYPE_LABELS: Record<string, string> = {
                  single_choice: '单选', multiple_choice: '多选', fill_in_blank: '填空',
                  true_false: '判断', short_answer: '简答', other: '其他',
                };
                return Object.entries(typeMap).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <View key={type} className={`rounded-lg px-2.5 py-1.5 ${isDark ? 'bg-red-950/40 border border-red-800/50' : 'bg-red-50 border border-red-100'}`}>
                    <Text className="text-xs font-medium text-red-500">{TYPE_LABELS[type] || type}</Text>
                    <Text className="text-xs text-red-400">{count} 题</Text>
                  </View>
                ));
              })()}
            </View>
            <View className={`rounded-lg p-2.5 ${isDark ? 'bg-[#333]' : 'bg-gray-50'}`}>
              <Text className={`text-xs leading-4 ${subText}`}>
                {items.length >= 10
                  ? `共 ${items.length} 道错题，建议重点强化「${(() => { const t: Record<string, number> = {}; items.forEach(i => { const k = i.question.type || '其他'; t[k] = (t[k] || 0) + 1; }); return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] || '未知'; })()}」类题目`
                  : `共 ${items.length} 道错题，继续加油！`}
              </Text>
            </View>
          </View>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(_, i) => i.toString()}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item, index }) => {
          const isExpanded = expandedIdx === index;
          const isGenerating = generatingIdx === index;
          const hasAi = !!activeAiConfig;
          const canGenerate = hasAi && item.similarQuestions.length < 5;

          return (
            <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
              {/* 错题内容 */}
              <View className="flex-row items-start gap-2 mb-2">
                <View className="w-5 h-5 rounded-full bg-red-100 items-center justify-center mt-0.5">
                  <Ionicons name="close" size={12} color="#EF4444" />
                </View>
                <Text className={`flex-1 text-sm leading-5 ${textColor}`}>{item.question.content}</Text>
              </View>
              <View className="flex-row gap-4 mb-2">
                <Text className={`text-xs ${subText}`}>正确：<Text className="text-green-500 font-medium">{item.question.answer}</Text></Text>
                <Text className={`text-xs ${subText}`}>我答：<Text className="text-red-500 font-medium">{item.user_answer || '未作答'}</Text></Text>
              </View>

              {/* 相似题 */}
              <Pressable
                onPress={() => setExpandedIdx(isExpanded ? null : index)}
                className={`flex-row items-center justify-between py-2 border-t ${isDark ? 'border-[#444]' : 'border-gray-100'}`}
              >
                <Text className={`text-xs font-medium ${subText}`}>
                  相似题练习 ({item.similarQuestions.length}/5)
                </Text>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={isDark ? '#666' : '#aaa'} />
              </Pressable>

              {isExpanded && (
                <View className="mt-2">
                  {item.similarQuestions.map((sq, si) => (
                    <View key={sq.id} className={`rounded-lg p-3 mb-2 ${isDark ? 'bg-[#333]' : 'bg-gray-50'}`}>
                      <Text className={`text-xs ${subText} mb-1`}>相似题 {si + 1}</Text>
                      <Text className={`text-sm leading-5 ${textColor}`}>{sq.content}</Text>
                      {sq.answer && (
                        <Text className={`text-xs mt-1 text-green-500`}>答案：{sq.answer}</Text>
                      )}
                    </View>
                  ))}

                  {canGenerate && (
                    <Pressable
                      onPress={() => handleGenerateSimilar(index)}
                      disabled={isGenerating}
                      className={`py-2 rounded-lg items-center flex-row justify-center gap-2 ${isDark ? 'bg-[#2A3A4A]' : 'bg-blue-50'}`}
                    >
                      {isGenerating
                        ? <ActivityIndicator size="small" color="#2C5F8A" />
                        : <Ionicons name="add-circle-outline" size={16} color="#2C5F8A" />
                      }
                      <Text className="text-[#2C5F8A] text-xs font-medium">
                        {isGenerating ? 'AI 生成中...' : '再生成一道'}
                      </Text>
                    </Pressable>
                  )}
                  {item.similarQuestions.length >= 5 && (
                    <Text className={`text-center text-xs ${subText} py-2`}>已达上限（5道）</Text>
                  )}
                  {!hasAi && (
                    <Text className="text-center text-xs text-orange-500 py-2">请先配置 AI 服务以生成相似题</Text>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />
      {/* 错题专项练习模态 */}
      {practiceMode && practiceItem && (
        <SafeAreaView className={`absolute inset-0 z-50 flex-1`} style={{ backgroundColor: isDark ? '#1E1E1E' : '#F8F9FA' }}>
          {/* 顶部：关闭 + 进度 + 得分 */}
          <View className={`px-5 py-3 flex-row items-center gap-2 border-b ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
            <Pressable onPress={() => setPracticeMode(false)} className="p-1 -ml-1">
              <Ionicons name="close" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
            </Pressable>
            <Text className={`text-base font-bold flex-1 ${textColor}`}>错题专项练习</Text>
            <View className="flex-row items-center gap-3">
              <Text className="text-green-500 font-bold text-sm">{practiceScore.correct}</Text>
              <Text className={`text-xs ${subText}`}>/</Text>
              <Text className={`text-sm font-bold ${textColor}`}>{practiceScore.total}</Text>
              <Text className={`text-xs ${subText}`}>{practiceQIdx + 1}/{items.length}</Text>
            </View>
          </View>

          <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20 }}>
            {/* 进度条 */}
            <View className={`h-1 rounded-full mb-4 ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
              <View
                className="h-1 rounded-full bg-[#2C5F8A]"
                style={{ width: `${((practiceQIdx + 1) / items.length) * 100}%` }}
              />
            </View>

            {/* 题目卡片 */}
            <View className={`rounded-2xl border p-4 mb-4 ${card}`} style={{ borderCurve: 'continuous' }}>
              <View className="flex-row items-center gap-2 mb-3">
                <View className={`self-start px-2 py-0.5 rounded-full ${isDark ? 'bg-orange-900' : 'bg-orange-50'}`}>
                  <Text className="text-orange-500 text-xs font-medium">错题重练</Text>
                </View>
                <Text className={`text-xs ${subText}`}>{practiceItem.question.type === 'single_choice' ? '单选题' : practiceItem.question.type === 'multiple_choice' ? '多选题' : '主观题'}</Text>
              </View>
              <Text className={`text-base leading-6 font-medium ${textColor}`}>{practiceItem.question.content}</Text>
            </View>

            {/* 选项 / 主观题提示 */}
            {(practiceItem.question.type === 'single_choice' || practiceItem.question.type === 'multiple_choice') ? (() => {
              let opts: string[] = [];
              try { opts = JSON.parse(practiceItem.question.options || '[]'); } catch {}
              return (
                <View className="gap-2 mb-4">
                  {opts.map((opt, oi) => {
                    const optLabel = String.fromCharCode(65 + oi); // A B C D
                    const isSelected = selectedOption === optLabel;
                    const correctLabel = (practiceItem.question.answer || '').trim().toUpperCase();
                    const isCorrectOpt = optLabel === correctLabel;
                    let borderColor = isDark ? '#444' : '#E5E7EB';
                    let bgColor = isDark ? '#2A2A2A' : '#fff';
                    if (practiceSubmitted) {
                      if (isCorrectOpt) { borderColor = '#22C55E'; bgColor = isDark ? '#052e16' : '#F0FDF4'; }
                      else if (isSelected && !isCorrectOpt) { borderColor = '#EF4444'; bgColor = isDark ? '#2d0707' : '#FFF5F5'; }
                    } else if (isSelected) {
                      borderColor = '#2C5F8A'; bgColor = isDark ? '#0d2a3f' : '#EFF6FF';
                    }
                    return (
                      <Pressable
                        key={oi}
                        onPress={() => handlePracticeSelect(optLabel)}
                        style={{ borderRadius: 12, borderWidth: 1.5, borderColor, backgroundColor: bgColor, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                      >
                        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected || (practiceSubmitted && isCorrectOpt) ? borderColor : 'transparent' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: (isSelected || (practiceSubmitted && isCorrectOpt)) ? '#fff' : (isDark ? '#888' : '#999') }}>{optLabel}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: isDark ? '#E5E7EB' : '#1a2a3a' }}>{opt}</Text>
                        {practiceSubmitted && isCorrectOpt && <Ionicons name="checkmark-circle" size={18} color="#22C55E" />}
                        {practiceSubmitted && isSelected && !isCorrectOpt && <Ionicons name="close-circle" size={18} color="#EF4444" />}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })() : (
              // 主观题：直接显示答案
              <View className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-[#2A2A2A] border border-[#444]' : 'bg-gray-50 border border-gray-200'}`}>
                <Text className={`text-xs font-semibold mb-1 ${subText}`}>参考答案</Text>
                <Text className={`text-sm leading-5 ${textColor}`}>{practiceItem.question.answer}</Text>
              </View>
            )}

            {/* 解析（答题后显示） */}
            {practiceSubmitted && practiceItem.question.explanation ? (
              <View className={`rounded-xl p-3 mb-4 ${isDark ? 'bg-blue-950 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
                <Text className={`text-xs font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>解析</Text>
                <Text className={`text-sm leading-5 ${isDark ? 'text-blue-200' : 'text-blue-700'}`}>{practiceItem.question.explanation}</Text>
              </View>
            ) : null}

            {/* 答题结果反馈 */}
            {practiceSubmitted && (practiceItem.question.type === 'single_choice' || practiceItem.question.type === 'multiple_choice') && (
              <View className={`rounded-xl p-3 mb-4 flex-row items-center gap-3 ${
                selectedOption === (practiceItem.question.answer || '').trim().toUpperCase()
                  ? (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200')
                  : (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')
              }`}>
                <Ionicons
                  name={selectedOption === (practiceItem.question.answer || '').trim().toUpperCase() ? 'checkmark-circle' : 'close-circle'}
                  size={22}
                  color={selectedOption === (practiceItem.question.answer || '').trim().toUpperCase() ? '#22C55E' : '#EF4444'}
                />
                <Text className={`text-sm font-semibold ${selectedOption === (practiceItem.question.answer || '').trim().toUpperCase() ? 'text-green-500' : 'text-red-500'}`}>
                  {selectedOption === (practiceItem.question.answer || '').trim().toUpperCase() ? '回答正确！' : `正确答案是 ${(practiceItem.question.answer || '').trim().toUpperCase()}`}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* 底部操作区 */}
          <View className="px-5 pb-6 gap-3">
            {!practiceSubmitted && (practiceItem.question.type === 'single_choice' || practiceItem.question.type === 'multiple_choice') ? (
              <Pressable
                onPress={handlePracticeSubmit}
                disabled={!selectedOption}
                className={`py-4 rounded-xl items-center ${selectedOption ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-200'}`}
              >
                <Text className={`font-semibold ${selectedOption ? 'text-white' : subText}`}>提交答案</Text>
              </Pressable>
            ) : (
              <View className="flex-row gap-3">
                <Pressable
                  disabled={practiceQIdx === 0}
                  onPress={() => {
                    const prev = practiceQIdx - 1;
                    setPracticeQIdx(prev); setPracticeItem(items[prev]);
                    setSelectedOption(null); setPracticeSubmitted(false);
                  }}
                  className={`flex-1 py-3.5 rounded-xl items-center ${practiceQIdx === 0 ? (isDark ? 'bg-[#2A2A2A]' : 'bg-gray-100') : (isDark ? 'bg-[#333]' : 'bg-gray-200')}`}
                >
                  <Text className={`font-semibold text-sm ${subText}`}>上一题</Text>
                </Pressable>
                <Pressable
                  onPress={handlePracticeNext}
                  className={`flex-1 py-3.5 rounded-xl items-center ${practiceQIdx >= items.length - 1 ? 'bg-green-600' : 'bg-[#2C5F8A]'}`}
                >
                  <Text className="font-semibold text-sm text-white">
                    {practiceQIdx >= items.length - 1 ? `完成 (${practiceScore.correct}/${practiceScore.total})` : '下一题'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}
