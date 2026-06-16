import { Stack } from 'expo-router';
import { useAppContext } from '@/lib/AppContext';

export default function StatsLayout() {
  const { isDark } = useAppContext();
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: isDark ? '#1E1E1E' : '#F8F9FA' },
    }} />
  );
}
