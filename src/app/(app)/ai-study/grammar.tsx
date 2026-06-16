/**
 * 语法纠错页 - 支持切换本地/在线模型
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { correctGrammar, isLocalAiAvailable } from '@/lib/aiService';

export default function GrammarScreen() {
  const router = useRouter();
  const { isDark, activeAiConfig, localAiConfig } = useAppContext();

  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [useLocal, setUseLocal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#2A2A2A' : '#FFFFFF';
  const inputText_ = isDark ? '#fff' : '#1a2a3a';

  async function handleCheck() {
    if (!inputText.trim()) { setErrorMsg('请输入要检查的文本'); return; }
    const hasAi = activeAiConfig || isLocalAiAvailable(localAiConfig);
    if (!hasAi) {
      setErrorMsg('请先配置在线AI服务或启用本地大模型');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    setResult('');
    try {
      const res = await correctGrammar(inputText, activeAiConfig, localAiConfig);
      setResult(res);
    } catch (e: any) {
      setErrorMsg('纠错失败，请稍后重试：' + (e?.message || ''));
    } finally {
      setLoading(false);
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
            <Text className={`text-xl font-bold ${textColor}`}>语法纠错</Text>
          </View>
          {/* 模型切换 */}
          <View className="flex-row gap-2 mb-5">
            {[
              { label: '在线API', value: false, available: !!activeAiConfig },
              { label: '本地模型', value: true, available: isLocalAiAvailable(localAiConfig) },
            ].map(opt => (
              <Pressable
                key={opt.label}
                onPress={() => opt.available && setUseLocal(opt.value)}
                className={`flex-1 py-2 rounded-xl items-center border ${
                  useLocal === opt.value ? 'bg-[#2C5F8A] border-[#2C5F8A]' :
                  !opt.available ? (isDark ? 'bg-[#222] border-[#333]' : 'bg-gray-50 border-gray-200') :
                  card.includes('bg-[#2A2A2A]') ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-xs font-medium ${
                  useLocal === opt.value ? 'text-white' :
                  !opt.available ? (isDark ? 'text-gray-600' : 'text-gray-300') : subText
                }`}>
                  {opt.label}{!opt.available ? '（未配置）' : ''}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* 输入区 */}
          <Text className={`text-sm font-medium mb-2 ${textColor}`}>输入文本</Text>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="输入需要语法检查的句子或段落（建议不超过200字）..."
            placeholderTextColor={isDark ? '#555' : '#aaa'}
            multiline
            numberOfLines={6}
            style={{ backgroundColor: inputBg, color: inputText_, borderRadius: 12, padding: 14, minHeight: 120, textAlignVertical: 'top', fontSize: 14, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E7EB' }}
            className="mb-2"
          />
          <Text className={`text-xs mb-4 ${subText}`}>{inputText.length} / 200</Text>

          {errorMsg ? <Text className="text-red-500 text-xs mb-3">{errorMsg}</Text> : null}

          <Pressable
            onPress={handleCheck}
            disabled={loading}
            className={`py-4 rounded-xl items-center mb-5 ${loading ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
          >
            {loading
              ? <View className="flex-row items-center gap-2"><ActivityIndicator size="small" color="#aaa" /><Text className={`${subText}`}>AI 正在分析...</Text></View>
              : <Text className="text-white font-semibold">开始语法检查</Text>
            }
          </Pressable>

          {/* 结果 */}
          {result && (
            <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
              <View className="flex-row items-center gap-2 mb-3">
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                <Text className={`text-sm font-semibold ${textColor}`}>纠错结果</Text>
              </View>
              <Text className={`text-sm leading-6 ${textColor}`}>{result}</Text>
            </View>
          )}

          {!result && !loading && (
            <View className="items-center py-6">
              <Ionicons name="document-text-outline" size={40} color={isDark ? '#444' : '#ddd'} />
              <Text className={`text-sm mt-3 text-center ${subText}`}>输入文本后点击「开始语法检查」</Text>
              <Text className={`text-xs mt-1 text-center ${subText}`}>AI 将分析语法错误并给出修改建议</Text>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
