/**
 * 「智」Tab - AI学习中心
 */
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { SafeAreaView } from 'react-native-safe-area-context';

const AI_FEATURES = [
  {
    icon: 'mic-outline' as const,
    title: '口语陪练',
    desc: '跟读评测，获得发音纠正反馈',
    color: '#2C5F8A',
    route: '/ai-study/oral' as const,
  },
  {
    icon: 'create-outline' as const,
    title: '语法纠错',
    desc: '输入文本，AI 检查语法错误',
    color: '#E67E22',
    route: '/ai-study/grammar' as const,
  },
  {
    icon: 'document-text-outline' as const,
    title: '写作批改',
    desc: '提交写作，获得专业批改建议',
    color: '#2E6B5C',
    route: '/ai-study/writing' as const,
  },
  {
    icon: 'refresh-circle-outline' as const,
    title: '动态复习推荐',
    desc: '基于掌握度，AI 推荐复习单词',
    color: '#9333EA',
    route: '/ai-study/review-recommend' as const,
  },
];

export default function AiTab() {
  const router = useRouter();
  const { isDark, activeAiConfig } = useAppContext();
  const hasAnyAi = !!activeAiConfig;

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
    <ScrollView className={`flex-1 ${bg}`} contentInsetAdjustmentBehavior="automatic">
      <View className="px-5 pt-4 pb-4">
        <Text className={`text-2xl font-bold ${textColor}`}>AI 学习中心</Text>
        <Text className={`text-sm mt-1 ${subText}`}>借助 AI 提升你的学习效率</Text>
      </View>

      {/* AI配置提示 */}
      {!hasAnyAi && (
        <Pressable
          onPress={() => router.push('/(app)/(tabs)/profile')}
          className={`mx-5 mb-4 rounded-2xl p-4 ${isDark ? 'bg-yellow-900 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} border`}
          style={{ borderCurve: 'continuous' }}
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="warning-outline" size={18} color="#F59E0B" />
            <Text className={`text-sm font-medium ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
              未配置 AI 服务
            </Text>
          </View>
          <Text className={`text-xs mt-1 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
            前往「我」→「AI服务配置」添加 API Key，才能使用 AI 功能。
          </Text>
        </Pressable>
      )}

      {/* 功能卡片 */}
      <View className="px-5 gap-3 pb-10">
        {AI_FEATURES.map(feat => (
          <Pressable
            key={feat.title}
            onPress={() => router.push(feat.route)}
            className={`rounded-2xl border p-5 ${card}`}
            style={{ borderCurve: 'continuous', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.06)' }] }}
          >
            <View className="flex-row items-center gap-4">
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center"
                style={{ backgroundColor: feat.color + '18' }}
              >
                <Ionicons name={feat.icon} size={28} color={feat.color} />
              </View>
              <View className="flex-1">
                <Text className={`text-base font-semibold ${textColor}`}>{feat.title}</Text>
                <Text className={`text-sm mt-1 ${subText}`}>{feat.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isDark ? '#555' : '#ccc'} />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
