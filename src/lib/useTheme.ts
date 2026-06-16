/**
 * 统一主题变量 Hook
 * 消除各页面重复的主题 class 定义
 */
import { useAppContext } from '@/lib/AppContext';

export function useTheme() {
  const { isDark } = useAppContext();
  return {
    isDark,
    bg: isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]',
    card: isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100',
    textColor: isDark ? 'text-white' : 'text-[#1a2a3a]',
    subText: isDark ? 'text-gray-400' : 'text-gray-500',
    inputBg: isDark ? '#2A2A2A' : '#FFFFFF',
    headerIconColor: isDark ? '#fff' : '#1a2a3a',
  };
}
