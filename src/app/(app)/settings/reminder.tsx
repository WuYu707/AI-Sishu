/**
 * 学习提醒设置页
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Switch, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getSetting, setSetting } from '@/lib/database';

export default function ReminderScreen() {
  const router = useRouter();
  const { isDark } = useAppContext();

  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [saved, setSaved] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  // 初始化：加载持久化配置 + 检查系统权限
  useEffect(() => {
    async function init() {
      try {
        const raw = await getSetting('reminder_config', '');
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'denied') setPermDenied(true);
        if (raw) {
          const cfg = JSON.parse(raw);
          setHour(cfg.hour ?? 20);
          setMinute(cfg.minute ?? 0);
          // 只有权限已授予才恢复开关状态
          if (status === 'granted' && cfg.enabled) setEnabled(true);
        }
      } catch {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'denied') setPermDenied(true);
      }
    }
    init();
  }, []);

  async function handleToggle(val: boolean) {
    if (!val) {
      setEnabled(false);
      await setSetting('reminder_config', JSON.stringify({ enabled: false, hour, minute })).catch(() => {});
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      setPermDenied(false);
      setEnabled(true);
    } else {
      setPermDenied(true);
      setEnabled(false);
    }
  }

  async function handleSave() {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (enabled) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📚 学习提醒',
          body: '该学习了！坚持每日打卡，进步看得见',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        },
      });
    }
    // 持久化配置，保存后开关状态不变
    await setSetting('reminder_config', JSON.stringify({ enabled, hour, minute })).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
    <ScrollView className={`flex-1 ${bg}`} contentInsetAdjustmentBehavior="automatic">
      <View className="px-5 py-5">
        {/* 返回按钮 */}
        <View className="flex-row items-center gap-3 mb-5">
          <Pressable onPress={() => router.back()} className="p-1 -ml-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
          <Text className={`text-xl font-bold ${textColor}`}>学习提醒</Text>
        </View>
        <Text className={`text-lg font-bold mb-1 ${textColor}`}>学习提醒</Text>
        <Text className={`text-sm mb-5 ${subText}`}>设置每日学习提醒，养成学习好习惯</Text>

        {/* 权限被拒绝提示 */}
        {permDenied && (
          <Pressable
            onPress={() => Linking.openSettings()}
            className={`rounded-xl p-3 mb-4 flex-row gap-2 items-center ${isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200'}`}
          >
            <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
            <Text className={`flex-1 text-xs leading-4 ${isDark ? 'text-red-300' : 'text-red-700'}`}>
              通知权限已被拒绝，点击前往系统设置开启权限
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#EF4444" />
          </Pressable>
        )}

        <View className={`rounded-2xl border p-4 mb-5 ${card}`} style={{ borderCurve: 'continuous' }}>
          <View className="flex-row items-center justify-between">
            <View>
              <Text className={`text-base font-semibold ${textColor}`}>开启学习提醒</Text>
              <Text className={`text-xs mt-0.5 ${subText}`}>每天在设定时间推送提醒</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              trackColor={{ false: isDark ? '#444' : '#E5E7EB', true: '#2C5F8A' }}
              thumbColor="white"
            />
          </View>
        </View>

        {enabled && (
          <>
            {/* 当前时间大字显示 */}
            <View className="items-center mb-6">
              <Text className="text-5xl font-bold" style={{ color: '#2C5F8A' }}>{timeStr}</Text>
            </View>

            {/* 小时滚轮 */}
            <Text className={`text-xs font-medium mb-2 ${subText}`}>小时</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row gap-2">
                {Array.from({ length: 24 }, (_, i) => i).map(h => (
                  <Pressable
                    key={h}
                    onPress={() => setHour(h)}
                    className={`w-11 h-11 rounded-xl items-center justify-center ${h === hour ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
                  >
                    <Text className={`text-sm font-bold ${h === hour ? 'text-white' : subText}`}>{String(h).padStart(2, '0')}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* 分钟滚轮（0-59 全量） */}
            <Text className={`text-xs font-medium mb-2 ${subText}`}>分钟</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
              <View className="flex-row gap-2">
                {Array.from({ length: 60 }, (_, i) => i).map(m => (
                  <Pressable
                    key={m}
                    onPress={() => setMinute(m)}
                    className={`w-11 h-11 rounded-xl items-center justify-center ${m === minute ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
                  >
                    <Text className={`text-sm font-bold ${m === minute ? 'text-white' : subText}`}>{String(m).padStart(2, '0')}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <Pressable onPress={handleSave} className={`py-4 rounded-xl items-center ${saved ? 'bg-green-500' : 'bg-[#2C5F8A]'}`}>
          <Text className="text-white font-semibold">{saved ? '✓ 已保存' : '保存设置'}</Text>
        </Pressable>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
