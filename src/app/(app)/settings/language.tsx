/**
 * 学习语言切换页
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import type { StudyLanguage } from '@/lib/AppContext';

const LANGUAGES = [
  { code: 'en', label: '英语', flag: '🇺🇸', desc: 'English' },
  { code: 'ja', label: '日语', flag: '🇯🇵', desc: '日本語' },
  { code: 'ko', label: '韩语', flag: '🇰🇷', desc: '한국어' },
  { code: 'fr', label: '法语', flag: '🇫🇷', desc: 'Français' },
  { code: 'de', label: '德语', flag: '🇩🇪', desc: 'Deutsch' },
  { code: 'es', label: '西班牙语', flag: '🇪🇸', desc: 'Español' },
  { code: 'pt', label: '葡萄牙语', flag: '🇵🇹', desc: 'Português' },
  { code: 'ru', label: '俄语', flag: '🇷🇺', desc: 'Русский' },
];

export default function LanguageScreen() {
  const router = useRouter();
  const { isDark, studyLanguage, setStudyLanguage } = useAppContext();

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
    <ScrollView className={`flex-1 ${bg}`} contentInsetAdjustmentBehavior="automatic">
      <View className="px-5 py-5">
          {/* 返回按钮 */}
          <View className="flex-row items-center gap-3 mb-5">
            <Pressable onPress={() => router.back()} className="p-1 -ml-1">
              <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
            </Pressable>
            <Text className={`text-xl font-bold ${textColor}`}>学习语言</Text>
          </View>
        <Text className={`text-lg font-bold mb-1 ${textColor}`}>学习语言</Text>
        <Text className={`text-sm mb-2 ${subText}`}>选择您当前的目标学习语言</Text>
        <View className={`rounded-xl p-3 mb-5 ${isDark ? 'bg-blue-950 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
          <Text className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
            切换语言后，词本、题库和学习记录将按语言独立存储，互不干扰
          </Text>
        </View>

        <View className={`rounded-2xl border overflow-hidden ${card}`} style={{ borderCurve: 'continuous' }}>
          {LANGUAGES.map((lang, i) => (
            <Pressable
              key={lang.code}
              onPress={() => setStudyLanguage(lang.code as StudyLanguage)}
              className={`flex-row items-center gap-3 px-4 py-4 ${i > 0 ? (isDark ? 'border-t border-[#333]' : 'border-t border-gray-100') : ''}`}
            >
              <Text style={{ fontSize: 28 }}>{lang.flag}</Text>
              <View className="flex-1">
                <Text className={`text-sm font-medium ${textColor}`}>{lang.label}</Text>
                <Text className={`text-xs ${subText}`}>{lang.desc}</Text>
              </View>
              {studyLanguage === lang.code && (
                <View className="w-6 h-6 rounded-full bg-[#2C5F8A] items-center justify-center">
                  <Ionicons name="checkmark" size={14} color="white" />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
