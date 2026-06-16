import { SafeAreaView } from 'react-native-safe-area-context';
/**
 * 「学」Tab - 首页Dashboard
 */
import { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetch } from 'expo/fetch';
import { useAppContext } from '@/lib/AppContext';
import {
  getTodayStat, getMottos, getMottoSettings, getWordsForReview, getWordbooks,
  getTodayPlan, saveTodayPlan,
  type DailyStat, type Motto, type Wordbook, type MottoSettings, type TodayPlan,
} from '@/lib/database';

const LANGUAGE_NAMES: Record<string, string> = {
  en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语', es: '西班牙语',
};

// 内置兜底文案 —— DB 为空或加载失败时使用
const FALLBACK_MOTTOS: Motto[] = [
  { id: -1, content: '知识是打开未来大门的钥匙。', is_custom: 0 },
  { id: -2, content: '学习是一场没有终点的旅行。', is_custom: 0 },
  { id: -3, content: '今日努力，明日辉煌。', is_custom: 0 },
  { id: -4, content: '积累每一个单词，构筑你的语言大厦。', is_custom: 0 },
  { id: -5, content: '坚持是成功最重要的因素。', is_custom: 0 },
  { id: -6, content: '每天进步一点点，终究收获大不同。', is_custom: 0 },
  { id: -7, content: '语言是通往世界的窗口。', is_custom: 0 },
  { id: -8, content: '专注当下，收获未来。', is_custom: 0 },
];

/** 按点号路径从对象中提取值，支持数组索引，如 "data.list[0].text" */
function extractByPath(obj: any, path: string): any {
  if (!path.trim()) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** 将提取到的值规范化为字符串数组 */
function normalizeToStringArray(val: any): string[] {
  if (val == null) return [];
  if (typeof val === 'string') return val.trim() ? [val.trim()] : [];
  if (typeof val === 'number') return [String(val)];
  if (Array.isArray(val)) return val.map((v: any) => String(v).trim()).filter(Boolean);
  return [String(val).trim()].filter(Boolean);
}

/** 解析 API 响应，支持用户自定义字段路径规则及多种内置格式 */
function parseMottoList(body: string, contentType: string, settings?: MottoSettings | null): string[] {
  const isJson = contentType.includes('application/json') || contentType.includes('text/json');
  if (isJson || body.trim().startsWith('[') || body.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(body);

      // ① 用户自定义字段路径规则（优先级最高）
      if (settings?.contentField?.trim()) {
        const contentVal = extractByPath(parsed, settings.contentField.trim());
        const contents = normalizeToStringArray(contentVal);
        if (contents.length > 0) {
          if (settings?.authorField?.trim()) {
            return contents.map((c, idx) => {
              // 若内容是数组，每项可能对应不同的 parsed 对象
              const baseObj = Array.isArray(parsed) ? parsed[idx] : parsed;
              const author = extractByPath(baseObj, settings.authorField!.trim());
              const authorStr = author != null ? String(author).trim() : '';
              return authorStr ? `${c}  —— ${authorStr}` : c;
            });
          }
          return contents;
        }
      }

      // ② 一言API内置识别：{ yiyan, nick }
      if (typeof parsed?.yiyan === 'string' && parsed.yiyan.trim()) {
        const nick = typeof parsed.nick === 'string' && parsed.nick.trim() ? `  —— ${parsed.nick.trim()}` : '';
        return [`${parsed.yiyan.trim()}${nick}`];
      }
      // ③ JSON 数组，每项可能是字符串或 { yiyan } 对象
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => {
          if (typeof item === 'string') return item.trim();
          if (typeof item?.yiyan === 'string') {
            const nick = typeof item.nick === 'string' && item.nick.trim() ? `  —— ${item.nick.trim()}` : '';
            return `${item.yiyan.trim()}${nick}`;
          }
          return String(item).trim();
        }).filter(Boolean);
      }
      if (Array.isArray(parsed?.text)) return parsed.text.map(String).filter(Boolean);
      if (Array.isArray(parsed?.mottos)) return parsed.mottos.map(String).filter(Boolean);
      if (typeof parsed?.text === 'string') return parsed.text.split('\n').map((s: string) => s.trim()).filter(Boolean);
    } catch { /* 降级为纯文本 */ }
  }
  return body.split('\n').map((s: string) => s.trim()).filter(Boolean);
}

/** 加载文案，优先级：远程API > 自定义文案 > DB内置 > 兜底常量 */
async function loadMottoList(): Promise<Motto[]> {
  // 读取用户配置
  const settings = await getMottoSettings().catch(() => null);

  // 1. 若配置了远程API，优先请求
  if (settings?.remoteUrl?.trim()) {
    try {
      const res = await fetch(settings.remoteUrl.trim());
      if (res.ok) {
        const contentType = res.headers.get('content-type') ?? '';
        const body = await res.text();
        const lines = parseMottoList(body, contentType, settings);
        if (lines.length > 0) {
          return lines.map((c, i) => ({ id: -(100 + i), content: c, is_custom: 2 }));
        }
      }
    } catch { /* 网络失败，向下降级 */ }
  }

  // 2. 若配置了自定义文案，使用它
  if (settings?.customMotto?.trim()) {
    const lines = settings.customMotto.split('\n').map((l: string) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((c: string, i: number) => ({ id: -(200 + i), content: c, is_custom: 2 }));
    }
  }

  // 3. 从数据库读取（Native 有效；Web 下 _mockDb 返回 []，继续降级）
  const dbList = await getMottos().catch(() => []);
  if (dbList.length > 0) return dbList;

  // 4. 最终兜底
  return FALLBACK_MOTTOS;
}

export default function HomeScreen() {
  const router = useRouter();
  const { isDark } = useAppContext();

  const [stats, setStats] = useState<DailyStat | null>(null);
  const [mottos, setMottos] = useState<Motto[]>(FALLBACK_MOTTOS);
  const [mottoIndex, setMottoIndex] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false); // 是否已完成过首次加载
  const [todayPlan, setTodayPlan] = useState<TodayPlan>({ wordGoal: 20, questionGoal: 10 });
  const [showPlanEdit, setShowPlanEdit] = useState(false);
  const [editWordGoal, setEditWordGoal] = useState('20');
  const [editQuestionGoal, setEditQuestionGoal] = useState('10');

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const border = isDark ? 'border-[#333]' : 'border-gray-100';

  useFocusEffect(
    useCallback(() => {
      async function load() {
        // 首次加载显示全屏 spinner，后续切换回来静默刷新
        if (!hasLoadedRef.current) {
          setLoading(true);
        }
        await Promise.allSettled([
          getTodayStat().then(setStats).catch(() => {}),
          loadMottoList().then(list => {
            setMottos(list.length >= 2 ? list : FALLBACK_MOTTOS);
          }).catch(() => { setMottos(FALLBACK_MOTTOS); }),
          getWordsForReview().then(r => setReviewCount(r.length)).catch(() => {}),
          getWordbooks().then(wbs => setWordbooks(wbs.slice(0, 3))).catch(() => {}),
          getTodayPlan().then(p => { setTodayPlan(p); setEditWordGoal(String(p.wordGoal)); setEditQuestionGoal(String(p.questionGoal)); }).catch(() => {}),
        ]);
        hasLoadedRef.current = true;
        setLoading(false);
      }
      load();
    }, [])
  );

  const currentMotto = mottos[mottoIndex % Math.max(mottos.length, 1)];

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 items-center justify-center ${bg}`}>
        <ActivityIndicator size="large" color="#2C5F8A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
    <ScrollView className={`flex-1 ${bg}`} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      {/* 顶部标题 */}
      <View className="px-5 pt-4 pb-4">
        <Text className={`text-2xl font-bold ${textColor}`}>AI私塾</Text>
        <Text className={`text-sm mt-1 ${subText}`}>{wordbooks.length > 0 ? (LANGUAGE_NAMES[wordbooks[0].language] || wordbooks[0].language || '多语言') : '开始学习'} · 今日学习</Text>
      </View>

      {/* 励志文案 */}
      {currentMotto && (
        <Pressable
          onPress={() => setMottoIndex(i => (i + 1) % Math.max(mottos.length, 1))}
          className="mx-5 mb-4 rounded-2xl p-4 bg-[#2C5F8A]"
          style={{ borderCurve: 'continuous' }}
        >
          <Text className="text-white text-sm font-medium leading-5">💡 {currentMotto.content}</Text>
          <Text className="text-blue-200 text-xs mt-1">点击切换</Text>
        </Pressable>
      )}

      {/* 今日摘要 */}
      <View className="px-5 mb-4">
        <Text className={`text-base font-semibold mb-3 ${textColor}`}>今日学习</Text>
        <View className="flex-row gap-3">
          <StatCard label="学习时长" value={`${stats?.study_minutes || 0}`} unit="分钟" icon="time-outline" color="#2C5F8A" isDark={isDark} />
          <StatCard label="新词数" value={`${stats?.new_words || 0}`} unit="个" icon="text-outline" color="#E67E22" isDark={isDark} />
        </View>
        <View className="flex-row gap-3 mt-3">
          <StatCard label="正确率" value={`${Math.round((stats?.accuracy || 0) * 100)}`} unit="%" icon="checkmark-circle-outline" color="#2E6B5C" isDark={isDark} />
          <StatCard label="试题数" value={`${stats?.question_count || 0}`} unit="题" icon="help-circle-outline" color="#9333EA" isDark={isDark} />
        </View>
      </View>

      {/* 今日计划进度 */}
      <View className="px-5 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className={`text-base font-semibold ${textColor}`}>今日计划</Text>
          <Pressable onPress={() => setShowPlanEdit(true)}>
            <Text className="text-[#2C5F8A] text-xs font-medium">调整目标</Text>
          </Pressable>
        </View>
        <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.06)' }] }}>
          {/* 单词目标 */}
          <View className="mb-3">
            <View className="flex-row items-center justify-between mb-1.5">
              <View className="flex-row items-center gap-1.5">
                <Text style={{ fontSize: 14 }}>📖</Text>
                <Text className={`text-sm font-medium ${textColor}`}>单词目标</Text>
              </View>
              <Text className={`text-xs font-semibold ${(stats?.new_words || 0) >= todayPlan.wordGoal ? 'text-green-500' : subText}`}>
                {stats?.new_words || 0} / {todayPlan.wordGoal} 个
              </Text>
            </View>
            <View className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
              <View
                className="h-2 rounded-full"
                style={{
                  width: `${Math.min(((stats?.new_words || 0) / todayPlan.wordGoal) * 100, 100)}%`,
                  backgroundColor: (stats?.new_words || 0) >= todayPlan.wordGoal ? '#22C55E' : '#2C5F8A',
                }}
              />
            </View>
          </View>
          {/* 试题目标 */}
          <View>
            <View className="flex-row items-center justify-between mb-1.5">
              <View className="flex-row items-center gap-1.5">
                <Text style={{ fontSize: 14 }}>✏️</Text>
                <Text className={`text-sm font-medium ${textColor}`}>试题目标</Text>
              </View>
              <Text className={`text-xs font-semibold ${(stats?.question_count || 0) >= todayPlan.questionGoal ? 'text-green-500' : subText}`}>
                {stats?.question_count || 0} / {todayPlan.questionGoal} 题
              </Text>
            </View>
            <View className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
              <View
                className="h-2 rounded-full"
                style={{
                  width: `${Math.min(((stats?.question_count || 0) / todayPlan.questionGoal) * 100, 100)}%`,
                  backgroundColor: (stats?.question_count || 0) >= todayPlan.questionGoal ? '#22C55E' : '#E67E22',
                }}
              />
            </View>
          </View>
        </View>
      </View>

      {/* 艾宾浩斯复习提醒 */}
      {reviewCount > 0 && (
        <Pressable
          className={`mx-5 mb-4 rounded-2xl p-4 border ${isDark ? 'bg-[#2A2A2A] border-orange-800' : 'bg-orange-50 border-orange-200'}`}
          style={{ borderCurve: 'continuous' }}
          onPress={() => router.push('/wordbook/review')}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons name="alarm-outline" size={20} color="#E67E22" />
              <View>
                <Text className={`font-semibold ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>今日复习提醒</Text>
                <Text className={`text-xs mt-0.5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                  有 {reviewCount} 个单词需要复习
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#E67E22" />
          </View>
        </Pressable>
      )}

      {/* 词本速览 */}
      <View className="px-5 mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className={`text-base font-semibold ${textColor}`}>我的词本</Text>
          <Pressable onPress={() => router.push('/wordbook/list')}>
            <Text className="text-[#2C5F8A] text-sm font-medium">全部 →</Text>
          </Pressable>
        </View>
        {wordbooks.length === 0 ? (
          <Pressable
            onPress={() => router.push('/wordbook/list')}
            className={`rounded-2xl border p-4 items-center ${card}`}
            style={{ borderCurve: 'continuous' }}
          >
            <Ionicons name="add-circle-outline" size={28} color={isDark ? '#555' : '#ccc'} />
            <Text className={`text-sm mt-2 ${subText}`}>新建词本开始学习</Text>
          </Pressable>
        ) : (
          wordbooks.map(wb => {
            const total = wb.word_count || 0;
            const mastered = wb.mastered_count || 0;
            const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
            return (
              <Pressable
                key={wb.id}
                onPress={() => router.push({ pathname: '/wordbook/[id]', params: { id: wb.id, name: wb.name } })}
                className={`rounded-2xl border p-3 mb-2 ${card}`}
                style={{ borderCurve: 'continuous' }}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className={`text-sm font-semibold ${textColor}`}>{wb.name}</Text>
                  <Text className={`text-xs ${subText}`}>{mastered}/{total}</Text>
                </View>
                <View className={`h-1.5 rounded-full ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}>
                  <View className="h-1.5 rounded-full bg-[#2C5F8A]" style={{ width: `${pct}%` }} />
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* 快捷入口 */}
      <View className="px-5 mb-8">
        <Text className={`text-base font-semibold mb-3 ${textColor}`}>快捷入口</Text>
        <View className="flex-row gap-3">
          {[
            { icon: 'library-outline' as const, label: '词本管理', color: '#2C5F8A', onPress: () => router.push('/wordbook/list') },
            { icon: 'repeat-outline' as const, label: '艾宾浩斯', color: '#E67E22', onPress: () => router.push('/wordbook/review') },
            { icon: 'cloud-upload-outline' as const, label: '导入词汇', color: '#2E6B5C', onPress: () => router.push('/wordbook/import') },
          ].map(entry => (
            <Pressable
              key={entry.label}
              onPress={entry.onPress}
              className={`flex-1 rounded-2xl p-3 ${card} border ${border} items-center`}
              style={{ borderCurve: 'continuous' }}
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center mb-1" style={{ backgroundColor: entry.color + '20' }}>
                <Ionicons name={entry.icon} size={20} color={entry.color} />
              </View>
              <Text className={`text-xs font-semibold ${textColor}`}>{entry.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>

    {/* 今日计划编辑弹窗 */}
    <Modal visible={showPlanEdit} transparent animationType="fade">
      <View className="flex-1 bg-black/40 items-center justify-center px-8">
        <View className="w-full rounded-2xl p-6" style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff' }}>
          <Text className={`text-lg font-bold mb-4 ${textColor}`}>调整今日目标</Text>
          <Text className={`text-sm mb-1 ${subText}`}>单词目标（个）</Text>
          <TextInput
            value={editWordGoal}
            onChangeText={setEditWordGoal}
            keyboardType="number-pad"
            style={{ backgroundColor: isDark ? '#333' : '#F3F4F6', color: isDark ? '#fff' : '#1a2a3a', borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 15 }}
          />
          <Text className={`text-sm mb-1 ${subText}`}>试题目标（题）</Text>
          <TextInput
            value={editQuestionGoal}
            onChangeText={setEditQuestionGoal}
            keyboardType="number-pad"
            style={{ backgroundColor: isDark ? '#333' : '#F3F4F6', color: isDark ? '#fff' : '#1a2a3a', borderRadius: 10, padding: 10, marginBottom: 16, fontSize: 15 }}
          />
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setShowPlanEdit(false)}
              className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}
            >
              <Text className={`font-semibold text-sm ${subText}`}>取消</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                const plan = { wordGoal: Math.max(1, parseInt(editWordGoal) || 20), questionGoal: Math.max(1, parseInt(editQuestionGoal) || 10) };
                setTodayPlan(plan);
                await saveTodayPlan(plan);
                setShowPlanEdit(false);
              }}
              className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]"
            >
              <Text className="text-white font-semibold text-sm">保存</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </SafeAreaView>
  );
}

function StatCard({ label, value, unit, icon, color, isDark }: {
  label: string; value: string; unit: string; icon: any; color: string; isDark: boolean;
}) {
  return (
    <View
      className={`flex-1 rounded-2xl p-3 border ${isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100'}`}
      style={{ borderCurve: 'continuous', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.06)' }] }}
    >
      <View className="flex-row items-center gap-2 mb-1">
        <Ionicons name={icon} size={16} color={color} />
        <Text className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</Text>
      </View>
      <View className="flex-row items-baseline gap-1">
        <Text className="text-2xl font-bold" style={{ color }}>{value}</Text>
        <Text className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{unit}</Text>
      </View>
    </View>
  );
}
