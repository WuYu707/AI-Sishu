/**
 * 外观设置页 - 深色/浅色/跟随系统
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';

export default function AppearanceScreen() {
  const router = useRouter();
  const { isDark, themeMode, setThemeMode } = useAppContext();

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  const OPTIONS = [
    { value: 'light', label: '浅色模式', icon: 'sunny-outline', desc: '始终使用浅色主题' },
    { value: 'dark', label: '深色模式', icon: 'moon-outline', desc: '始终使用深色主题' },
    { value: 'system', label: '跟随系统', icon: 'phone-portrait-outline', desc: '跟随手机系统设置自动切换' },
  ] as const;

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
    <ScrollView className={`flex-1 ${bg}`} contentInsetAdjustmentBehavior="automatic">
      <View className="px-5 py-5">
          {/* 返回按钮 */}
          <View className="flex-row items-center gap-3 mb-5">
            <Pressable onPress={() => router.back()} className="p-1 -ml-1">
              <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
            </Pressable>
            <Text className={`text-xl font-bold ${textColor}`}>外观设置</Text>
          </View>
        <Text className={`text-lg font-bold mb-1 ${textColor}`}>外观设置</Text>
        <Text className={`text-sm mb-6 ${subText}`}>选择应用的颜色主题</Text>

        <View className={`rounded-2xl border overflow-hidden ${card}`} style={{ borderCurve: 'continuous' }}>
          {OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.value}
              onPress={() => setThemeMode(opt.value)}
              className={`flex-row items-center gap-3 px-4 py-4 ${i > 0 ? (isDark ? 'border-t border-[#333]' : 'border-t border-gray-100') : ''}`}
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: themeMode === opt.value ? '#2C5F8A18' : isDark ? '#333' : '#F3F4F6' }}>
                <Ionicons name={opt.icon} size={20} color={themeMode === opt.value ? '#2C5F8A' : (isDark ? '#888' : '#666')} />
              </View>
              <View className="flex-1">
                <Text className={`text-sm font-medium ${textColor}`}>{opt.label}</Text>
                <Text className={`text-xs mt-0.5 ${subText}`}>{opt.desc}</Text>
              </View>
              <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${themeMode === opt.value ? 'border-[#2C5F8A] bg-[#2C5F8A]' : isDark ? 'border-[#555]' : 'border-gray-300'}`}>
                {themeMode === opt.value && <Ionicons name="checkmark" size={12} color="white" />}
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
