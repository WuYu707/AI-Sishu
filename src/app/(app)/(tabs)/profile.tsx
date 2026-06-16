import { SafeAreaView } from 'react-native-safe-area-context';
/**
 * 「我」Tab - 学习统计与设置导航（含热力图 + 复习预测日历）
 */
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import {
  getTodayStat, getWeekStats, getCumulativeStats, resetTodayStat,
  getDailyStatsHeatmap, getReviewForecast,
  type DailyStat, type AchievementStats
} from '@/lib/database';
import { APP_VERSION } from '@/lib/version';

interface StatsData {
  todayMinutes: number;
  todayWords: number;
  todayAccuracy: number;
  todayQuestions: number;
  weekData: DailyStat[];
  weekBestAccuracy: number;
  weekBestMinutes: number;
  totalStudyDays: number;
}

const SETTINGS_ITEMS = [
  { icon: 'cloud-upload-outline' as const, title: '备份与恢复', route: '/settings/backup', color: '#2C5F8A', desc: 'WebDAV / 本地备份' },
  { icon: 'hardware-chip-outline' as const, title: 'AI服务配置', route: '/settings/ai-config', color: '#7C3AED', desc: '在线AI / 本地大模型' },
  { icon: 'scan-outline' as const, title: 'OCR服务配置', route: '/settings/ocr-config', color: '#0891B2', desc: '试卷识别设置' },
  { icon: 'text-outline' as const, title: '首页文案设置', route: '/settings/motto', color: '#E67E22', desc: '励志文案 / API拉取' },
  { icon: 'moon-outline' as const, title: '外观设置', route: '/settings/appearance', color: '#374151', desc: '主题模式 / 深色/浅色' },
  { icon: 'notifications-outline' as const, title: '学习提醒', route: '/settings/reminder', color: '#DC2626', desc: '每日学习推送提醒' },
  { icon: 'document-text-outline' as const, title: '日志导出', route: '/settings/logs', color: '#6B7280', desc: '错误日志 / 操作记录' },
];

export default function ProfileTab() {
  const router = useRouter();
  const { isDark, activeAiConfig } = useAppContext();

  const [stats, setStats] = useState<StatsData>({
    todayMinutes: 0, todayWords: 0, todayAccuracy: 0, todayQuestions: 0,
    weekData: [], weekBestAccuracy: 0, weekBestMinutes: 0, totalStudyDays: 0,
  });
  const [periodTab, setPeriodTab] = useState<'week' | 'month'>('week');
  const [achievement, setAchievement] = useState<AchievementStats>({ streakDays: 0, totalMinutes: 0, totalWords: 0, totalQuestions: 0 });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [heatmap, setHeatmap] = useState<{ date: string; value: number }[]>([]);
  const [forecast, setForecast] = useState<{ date: string; count: number }[]>([]);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  useFocusEffect(
    useCallback(() => {
      loadStats(periodTab);
    }, [periodTab])
  );

  async function loadStats(period: 'week' | 'month') {
    const days = period === 'week' ? 7 : 30;
    try {
      const [today, week, achievement, heatmap, forecast] = await Promise.all([
        getTodayStat(),
        getWeekStats(days),
        getCumulativeStats(),
        getDailyStatsHeatmap(84),
        getReviewForecast(7),
      ]);
      const bestAcc = week.length ? Math.max(...week.map(d => d.accuracy || 0)) : 0;
      const bestMin = week.length ? Math.max(...week.map(d => d.study_minutes || 0)) : 0;
      const studyDays = week.filter(d => (d.study_minutes || 0) > 0).length;

      setStats({
        todayMinutes: today?.study_minutes || 0,
        todayWords: today?.new_words || 0,
        todayAccuracy: today?.accuracy || 0,
        todayQuestions: today?.question_count || 0,
        weekData: week,
        weekBestAccuracy: bestAcc,
        weekBestMinutes: bestMin,
        totalStudyDays: studyDays,
      });
      setAchievement(achievement);
      setHeatmap(heatmap);
      setForecast(forecast);
    } catch (e) {
      console.warn('[Profile] loadStats error:', e);
    }
  }

  async function handleResetToday() {
    setResetting(true);
    await resetTodayStat();
    await loadStats(periodTab);
    setResetting(false);
    setShowResetConfirm(false);
  }

  // 简单柱状图
  const maxMinutes = Math.max(...stats.weekData.map(d => d.study_minutes || 0), 1);
  const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
    <ScrollView className={`flex-1 ${bg}`} contentInsetAdjustmentBehavior="automatic">
      <View className="px-5 pt-4 pb-4">
        <Text className={`text-2xl font-bold ${textColor}`}>我的</Text>
        <Text className={`text-sm mt-1 ${subText}`}>学习记录 · 个人设置</Text>
      </View>

      {/* 今日摘要 */}
      <View className="px-5 mb-5">
        <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous', boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
          <View className="flex-row items-center justify-between mb-3">
            <Text className={`text-sm font-bold ${textColor}`}>今日学习</Text>
            <View className="flex-row items-center gap-3">
              <Text className={`text-xs ${subText}`}>{new Date().toLocaleDateString('zh-CN')}</Text>
              <Pressable
                onPress={() => setShowResetConfirm(true)}
                className={`px-2.5 py-1 rounded-lg flex-row items-center gap-1 ${isDark ? 'bg-red-900/40' : 'bg-red-50'}`}
              >
                <Ionicons name="refresh-outline" size={12} color="#EF4444" />
                <Text className="text-red-500 text-xs font-medium">重置今日</Text>
              </Pressable>
            </View>
          </View>
          <View className="flex-row">
            {[
              { label: '学习时长', value: `${stats.todayMinutes}分`, color: '#2C5F8A' },
              { label: '新词', value: `${stats.todayWords}个`, color: '#2E6B5C' },
              { label: '正确率', value: `${stats.todayAccuracy}%`, color: '#E67E22' },
              { label: '试题', value: `${stats.todayQuestions}题`, color: '#9333EA' },
            ].map(item => (
              <View key={item.label} className="flex-1 items-center">
                <Text className="text-xl font-bold" style={{ color: item.color }}>{item.value}</Text>
                <Text className={`text-xs mt-1 ${subText}`}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 重置今日确认弹窗 */}
      {showResetConfirm && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, alignItems: 'center', justifyContent: 'center' }}>
          <View className={`mx-6 rounded-2xl p-6 ${isDark ? 'bg-[#2A2A2A]' : 'bg-white'}`} style={{ borderCurve: 'continuous', width: '80%' }}>
            <View className="items-center mb-4">
              <View className="w-12 h-12 rounded-full bg-red-100 items-center justify-center mb-3">
                <Ionicons name="refresh-outline" size={24} color="#EF4444" />
              </View>
              <Text className={`text-base font-bold ${textColor}`}>重置今日学习记录</Text>
              <Text className={`text-xs text-center mt-2 ${subText}`}>
                此操作将清空今日的学习时长、新词数、试题数和正确率统计，历史数据不受影响。
              </Text>
            </View>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setShowResetConfirm(false)}
                className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-medium ${subText}`}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleResetToday}
                disabled={resetting}
                className="flex-1 py-3 rounded-xl items-center bg-red-500"
              >
                {resetting
                  ? <ActivityIndicator size="small" color="white" />
                  : <Text className="text-white text-sm font-semibold">确认重置</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* 周期切换 + 图表 */}
      <View className="px-5 mb-5">
        <View className="flex-row gap-2 mb-3">
          {(['week', 'month'] as const).map(p => (
            <Pressable
              key={p}
              onPress={() => setPeriodTab(p)}
              className={`px-4 py-1.5 rounded-full ${periodTab === p ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#333]' : 'bg-gray-200'}`}
            >
              <Text className={`text-xs font-medium ${periodTab === p ? 'text-white' : subText}`}>
                {p === 'week' ? '近7天' : '近30天'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
          <Text className={`text-xs font-semibold mb-3 ${subText}`}>
            学习时长（分钟）· {periodTab === 'week' ? '近7天' : '近30天'}
          </Text>
          {stats.weekData.length > 0 ? (
            <View className="flex-row items-end justify-between" style={{ height: 80 }}>
              {stats.weekData.map((d, i) => {
                const pct = (d.study_minutes || 0) / maxMinutes;
                return (
                  <View key={i} className="flex-1 items-center mx-0.5">
                    <View
                      className="w-full rounded-t-sm"
                      style={{ height: Math.max(pct * 60, 2), backgroundColor: pct > 0 ? '#2C5F8A' : (isDark ? '#333' : '#E5E7EB') }}
                    />
                    {periodTab === 'week' && (
                      <Text className={`text-xs mt-1 ${subText}`} style={{ fontSize: 10 }}>
                        {weekDays[i % 7]}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="items-center py-4">
              <Text className={`text-xs ${subText}`}>暂无学习记录</Text>
            </View>
          )}
        </View>
      </View>

      {/* 学习热力图 */}
      <View className="px-5 mb-5">
        <Text className={`text-sm font-bold mb-3 ${textColor}`}>学习热力图 · 近12周</Text>
        <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
          {heatmap.length === 0 ? (
            <View className="items-center py-3">
              <Text className={`text-xs ${subText}`}>暂无学习记录</Text>
            </View>
          ) : (() => {
            // 按周分组（每列=1周，7行=周一到周日）
            const COLS = 12;
            const totalCells = COLS * 7;
            const padded = [...Array(Math.max(0, totalCells - heatmap.length)).fill({ date: '', value: -1 }), ...heatmap].slice(-totalCells);
            const cols: { date: string; value: number }[][] = [];
            for (let c = 0; c < COLS; c++) cols.push(padded.slice(c * 7, c * 7 + 7));
            const colors = isDark
              ? ['#2A2A2A', '#1a3a2a', '#1a4a30', '#1a6040', '#22C55E']
              : ['#F1F5F9', '#DCFCE7', '#86EFAC', '#4ADE80', '#22C55E'];
            return (
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {cols.map((col, ci) => (
                  <View key={ci} style={{ flex: 1, gap: 3 }}>
                    {col.map((cell, ri) => (
                      <View
                        key={ri}
                        style={{ aspectRatio: 1, borderRadius: 2, backgroundColor: cell.value < 0 ? 'transparent' : colors[cell.value] }}
                      />
                    ))}
                  </View>
                ))}
              </View>
            );
          })()}
          <View className="flex-row items-center justify-end gap-1 mt-2">
            <Text className={`text-xs ${subText}`}>少</Text>
            {(isDark ? ['#2A2A2A', '#1a3a2a', '#1a4a30', '#1a6040', '#22C55E'] : ['#F1F5F9', '#DCFCE7', '#86EFAC', '#4ADE80', '#22C55E']).map((c, i) => (
              <View key={i} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
            ))}
            <Text className={`text-xs ${subText}`}>多</Text>
          </View>
        </View>
      </View>

      {/* 复习预测日历 */}
      <View className="px-5 mb-5">
        <Text className={`text-sm font-bold mb-3 ${textColor}`}>复习预测 · 未来7天</Text>
        <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
          {forecast.length === 0 ? (
            <View className="items-center py-3">
              <Text className={`text-xs ${subText}`}>暂无待复习词汇</Text>
            </View>
          ) : (
            <View className="flex-row gap-1.5">
              {forecast.map((f, i) => {
                const d = new Date(f.date + 'T12:00:00');
                const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
                const isToday = i === 0;
                const hasWords = f.count > 0;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 10, color: isToday ? '#2C5F8A' : isDark ? '#666' : '#aaa', fontWeight: isToday ? '700' : '400' }}>
                      {isToday ? '今' : `周${weekDay}`}
                    </Text>
                    <View style={{
                      width: '100%', aspectRatio: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isToday ? '#2C5F8A' : hasWords ? (isDark ? '#1a2a3a' : '#EFF6FF') : (isDark ? '#2A2A2A' : '#F8F9FA'),
                      borderWidth: 1, borderColor: isToday ? '#2C5F8A' : hasWords ? (isDark ? '#2C5F8A40' : '#BFDBFE') : (isDark ? '#333' : '#E5E7EB'),
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isToday ? '#fff' : hasWords ? '#2C5F8A' : isDark ? '#555' : '#ccc' }}>
                        {f.count > 0 ? f.count : '·'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 9, color: isDark ? '#555' : '#aaa' }}>
                      {d.getMonth() + 1}/{d.getDate()}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <Text className={`text-xs mt-3 ${subText}`}>显示当日及未来到期需复习的单词数</Text>
        </View>
      </View>

      {/* 排行榜 */}
      <View className="px-5 mb-5">
        <Text className={`text-sm font-bold mb-3 ${textColor}`}>个人排行榜</Text>
        {stats.totalStudyDays < 3 ? (
          <View className={`rounded-2xl border p-4 items-center ${card}`} style={{ borderCurve: 'continuous' }}>
            <Ionicons name="trophy-outline" size={32} color={isDark ? '#555' : '#ccc'} />
            <Text className={`text-sm mt-2 text-center ${subText}`}>数据不足，继续学习解锁排行榜</Text>
          </View>
        ) : (
          <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
            {[
              { label: '周最高学习量', value: `${stats.weekBestMinutes} 分钟`, icon: 'time-outline', color: '#2C5F8A' },
              { label: '周最佳正确率', value: `${stats.weekBestAccuracy}%`, icon: 'checkmark-circle-outline', color: '#2E6B5C' },
            ].map((item, i) => (
              <View key={i} className={`flex-row items-center gap-3 ${i > 0 ? 'mt-3 pt-3 border-t ' + (isDark ? 'border-[#333]' : 'border-gray-100') : ''}`}>
                <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: item.color + '18' }}>
                  <Ionicons name={item.icon as any} size={20} color={item.color} />
                </View>
                <View className="flex-1">
                  <Text className={`text-xs ${subText}`}>{item.label}</Text>
                  <Text className={`text-base font-bold mt-0.5 ${textColor}`}>{item.value}</Text>
                </View>
                <Ionicons name="trophy" size={16} color="#F59E0B" />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 成就指标卡片 */}
      <View className="px-5 mb-5">
        <Text className={`text-sm font-bold mb-3 ${textColor}`}>累计成就</Text>
        <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous', boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] }}>
          <View className="flex-row mb-3">
            {/* 连续打卡 */}
            <View className="flex-1 items-center">
              <View className="w-12 h-12 rounded-full items-center justify-center mb-1.5" style={{ backgroundColor: '#E67E2218' }}>
                <Text style={{ fontSize: 22 }}>🔥</Text>
              </View>
              <Text className="text-2xl font-bold" style={{ color: '#E67E22' }}>{achievement.streakDays}</Text>
              <Text className={`text-xs mt-0.5 text-center ${subText}`}>连续打卡天</Text>
            </View>
            <View className={`w-px mx-2 ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`} />
            {/* 累计学习 */}
            <View className="flex-1 items-center">
              <View className="w-12 h-12 rounded-full items-center justify-center mb-1.5" style={{ backgroundColor: '#2C5F8A18' }}>
                <Text style={{ fontSize: 22 }}>⏱</Text>
              </View>
              <Text className="text-2xl font-bold" style={{ color: '#2C5F8A' }}>
                {achievement.totalMinutes >= 60 ? `${Math.floor(achievement.totalMinutes / 60)}h` : `${achievement.totalMinutes}m`}
              </Text>
              <Text className={`text-xs mt-0.5 text-center ${subText}`}>累计学习</Text>
            </View>
            <View className={`w-px mx-2 ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`} />
            {/* 累计单词 */}
            <View className="flex-1 items-center">
              <View className="w-12 h-12 rounded-full items-center justify-center mb-1.5" style={{ backgroundColor: '#2E6B5C18' }}>
                <Text style={{ fontSize: 22 }}>📖</Text>
              </View>
              <Text className="text-2xl font-bold" style={{ color: '#2E6B5C' }}>{achievement.totalWords}</Text>
              <Text className={`text-xs mt-0.5 text-center ${subText}`}>累计单词</Text>
            </View>
            <View className={`w-px mx-2 ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`} />
            {/* 累计试题 */}
            <View className="flex-1 items-center">
              <View className="w-12 h-12 rounded-full items-center justify-center mb-1.5" style={{ backgroundColor: '#9333EA18' }}>
                <Text style={{ fontSize: 22 }}>✏️</Text>
              </View>
              <Text className="text-2xl font-bold" style={{ color: '#9333EA' }}>{achievement.totalQuestions}</Text>
              <Text className={`text-xs mt-0.5 text-center ${subText}`}>累计试题</Text>
            </View>
          </View>
          {achievement.streakDays >= 7 && (
            <View className={`rounded-xl p-2.5 flex-row items-center gap-2 ${isDark ? 'bg-orange-900/30' : 'bg-orange-50'}`}>
              <Text style={{ fontSize: 16 }}>🏅</Text>
              <Text className={`text-xs font-medium ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>
                坚持打卡 {achievement.streakDays} 天！继续保持！
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 分享卡片 & 导出报告 */}
      <View className="px-5 mb-5 flex-row gap-3">
        <Pressable
          onPress={() => router.push('/stats/share')}
          className={`flex-1 rounded-2xl border p-4 items-center gap-2 ${card}`}
          style={{ borderCurve: 'continuous' }}
        >
          <Ionicons name="share-social-outline" size={24} color="#2C5F8A" />
          <Text className={`text-xs font-medium ${textColor}`}>分享学习卡片</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/stats/export')}
          className={`flex-1 rounded-2xl border p-4 items-center gap-2 ${card}`}
          style={{ borderCurve: 'continuous' }}
        >
          <Ionicons name="download-outline" size={24} color="#2E6B5C" />
          <Text className={`text-xs font-medium ${textColor}`}>导出学习报告</Text>
        </Pressable>
      </View>

      {/* 设置列表 */}
      <View className="px-5 mb-8">
        <Text className={`text-sm font-bold mb-3 ${textColor}`}>设置</Text>
        <View className={`rounded-2xl border overflow-hidden ${card}`} style={{ borderCurve: 'continuous' }}>
          {SETTINGS_ITEMS.map((item, i) => (
            <Pressable
              key={item.title}
              onPress={() => router.push(item.route as any)}
              className={`flex-row items-center gap-3 px-4 py-3.5 ${
                i > 0 ? (isDark ? 'border-t border-[#333]' : 'border-t border-gray-100') : ''
              }`}
            >
              <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: item.color + '18' }}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <View className="flex-1">
                <Text className={`text-sm font-medium ${textColor}`}>{item.title}</Text>
                <Text className={`text-xs mt-0.5 ${subText}`}>{item.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={isDark ? '#555' : '#ccc'} />
            </Pressable>
          ))}
        </View>

        {/* AI状态 */}
        <View className="mt-4">
          <View className={`rounded-xl border p-3 ${card}`} style={{ borderCurve: 'continuous' }}>
            <Text className={`text-xs ${subText}`}>AI 服务状态</Text>
            <Text className={`text-sm font-bold mt-0.5 ${activeAiConfig ? 'text-green-500' : 'text-red-500'}`}>
              {activeAiConfig ? '已配置' : '未配置'}
            </Text>
          </View>
        </View>

        {/* 关于信息 */}
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: isDark ? '#666666' : '#999999' }}>
            版本 v{APP_VERSION}  |  © wuyu
          </Text>
        </View>

      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
