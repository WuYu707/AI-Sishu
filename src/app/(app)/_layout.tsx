import { Stack } from 'expo-router';
import { useAppContext } from '@/lib/AppContext';

export default function AppLayout() {
  const { isDark } = useAppContext();
  const headerStyle = {
    backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
  };
  const headerTintColor = isDark ? '#fff' : '#1a2a3a';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle,
        headerTintColor,
      }}
    >
      {/* 主 Tab 导航 */}
      <Stack.Screen name="(tabs)" />

      {/* 词本子页 */}
      <Stack.Screen name="wordbook/list" />
      <Stack.Screen name="wordbook/[id]" />
      <Stack.Screen name="wordbook/import" />
      <Stack.Screen name="wordbook/review" />

      {/* 练习子页 */}
      <Stack.Screen name="practice/[id]" />
      <Stack.Screen name="practice/import" />
      <Stack.Screen name="practice/wrong-answers" />

      {/* AI 学习子页 */}
      <Stack.Screen name="ai-study/grammar" />
      <Stack.Screen name="ai-study/writing" />
      <Stack.Screen name="ai-study/oral" />
      <Stack.Screen name="ai-study/review-recommend" />

      {/* 统计子页 */}
      <Stack.Screen name="stats/share" />
      <Stack.Screen name="stats/export" />

      {/* 设置子页 */}
      <Stack.Screen name="settings/ai-config" />
      <Stack.Screen name="settings/backup" />
      <Stack.Screen name="settings/appearance" />
      <Stack.Screen name="settings/language" />
      <Stack.Screen name="settings/motto" />
      <Stack.Screen name="settings/ocr-config" />
      <Stack.Screen name="settings/reminder" />
      <Stack.Screen name="settings/logs" />
    </Stack>
  );
}
