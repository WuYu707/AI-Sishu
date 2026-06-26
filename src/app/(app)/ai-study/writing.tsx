/**
 * 写作批改页 - 批改结果以 Markdown 渲染
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-marked';
import { useAppContext } from '@/lib/AppContext';
import { correctWriting } from '@/lib/aiService';

export default function WritingScreen() {
  const router = useRouter();
  const { isDark, activeAiConfig } = useAppContext();

  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#2A2A2A' : '#FFFFFF';
  const inputTextColor = isDark ? '#fff' : '#1a2a3a';

  const hasAi = !!activeAiConfig;

  async function handleSubmit() {
    if (!inputText.trim()) { setErrorMsg('请输入写作内容'); return; }
    if (!hasAi) { setErrorMsg('请先配置在线AI服务'); return; }
    setErrorMsg('');
    setLoading(true);
    setResult('');
    try {
      const res = await correctWriting(inputText, activeAiConfig);
      setResult(res);
    } catch (e: any) {
      setErrorMsg('批改失败：' + (e?.message || '请稍后重试'));
    } finally {
      setLoading(false);
    }
  }

  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;

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
            <Text className={`text-xl font-bold ${textColor}`}>写作批改</Text>
          </View>
          {/* 提示 */}
          <View className={`rounded-xl p-3 mb-5 flex-row gap-2 ${isDark ? 'bg-blue-950 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
            <Ionicons name="information-circle-outline" size={16} color="#2C5F8A" />
            <Text className={`flex-1 text-xs leading-4 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
              建议提交 100~500 词的英文段落或作文，AI 将从语法、用词、结构等方面给出批改建议
            </Text>
          </View>

          {/* 输入 */}
          <Text className={`text-sm font-medium mb-2 ${textColor}`}>写作内容</Text>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="在此输入您的英文写作（作文、段落均可）..."
            placeholderTextColor={isDark ? '#555' : '#aaa'}
            multiline
            numberOfLines={12}
            style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 12, padding: 14, minHeight: 200, textAlignVertical: 'top', fontSize: 14, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E7EB' }}
            className="mb-2"
          />
          <View className="flex-row justify-between mb-4">
            <Text className={`text-xs ${subText}`}>{wordCount} 词 / 建议不超过 500 词</Text>
            {wordCount > 500 && (
              <Text className="text-orange-500 text-xs">⚠ 内容较长，可能影响批改效果</Text>
            )}
          </View>

          {errorMsg ? <Text className="text-red-500 text-xs mb-3">{errorMsg}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            disabled={loading || !hasAi}
            className={`py-4 rounded-xl items-center mb-5 ${!hasAi || loading ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
          >
            {loading
              ? <View className="flex-row items-center gap-2"><ActivityIndicator size="small" color="#aaa" /><Text className={subText}>AI 正在批改...</Text></View>
              : <Text className={`font-semibold ${!hasAi ? subText : 'text-white'}`}>
                  {!hasAi ? '请先配置AI服务' : '提交写作批改'}
                </Text>
            }
          </Pressable>

          {/* 批改结果 */}
          {result && (
            <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
              <View className="flex-row items-center gap-2 mb-3">
                <Ionicons name="school-outline" size={18} color="#2C5F8A" />
                <Text className={`text-sm font-bold ${textColor}`}>批改报告</Text>
              </View>
              <Markdown
                value={result}
                flatListProps={{ scrollEnabled: false }}
                styles={{
                  text: { fontSize: 14, lineHeight: 24, color: isDark ? '#E5E7EB' : '#1a2a3a' },
                  h1: { fontSize: 17, fontWeight: '700', color: isDark ? '#fff' : '#1a2a3a', marginTop: 12, marginBottom: 4 },
                  h2: { fontSize: 15, fontWeight: '700', color: isDark ? '#fff' : '#1a2a3a', marginTop: 10, marginBottom: 4 },
                  h3: { fontSize: 14, fontWeight: '700', color: '#2C5F8A', marginTop: 8, marginBottom: 2 },
                  strong: { fontWeight: '700', color: isDark ? '#fff' : '#1a2a3a' },
                  em: { fontStyle: 'italic', color: isDark ? '#ccc' : '#555' },
                  code: { backgroundColor: isDark ? '#333' : '#F3F4F6', borderRadius: 4 },
                  blockquote: { borderLeftWidth: 3, borderLeftColor: '#2C5F8A', paddingLeft: 12, marginLeft: 0, backgroundColor: isDark ? '#1a2a3a' : '#EFF6FF' },
                  li: { fontSize: 14, lineHeight: 24, color: isDark ? '#E5E7EB' : '#1a2a3a' },
                  hr: { borderColor: isDark ? '#444' : '#E5E7EB', marginVertical: 12 },
                }}
              />
            </View>
          )}

          {!result && !loading && (
            <View className="items-center py-6">
              <Ionicons name="pencil-outline" size={40} color={isDark ? '#444' : '#ddd'} />
              <Text className={`text-sm mt-3 text-center ${subText}`}>粘贴或输入英文写作，获取 AI 批改建议</Text>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
