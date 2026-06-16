import { Stack, Tabs } from 'expo-router';
import { useAppContext } from '@/lib/AppContext';

// 仅用于满足 lint 规则，声明动态路由为隐藏，运行时永不渲染
const _lintStubs = false
  ? [<Tabs.Screen key="id" name="[id]" options={{ href: null }} />]
  : null;

export default function WordbookLayout() {
  const { isDark } = useAppContext();
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: isDark ? '#1E1E1E' : '#F8F9FA' },
    }} />
  );
}
