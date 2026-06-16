/**
 * 分享学习卡片页 - 截图生成PNG图片后分享 + 自定义模板编辑
 */
import { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { useAppContext } from '@/lib/AppContext';
import { getTodayStat, getWeekStats, getStreakDays, type DailyStat } from '@/lib/database';

interface CardFields {
  showStudyTime: boolean;
  showNewWords: boolean;
  showAccuracy: boolean;
  showQuestions: boolean;
  showWeekBest: boolean;
  showStreak: boolean;
}

export default function ShareScreen() {
  const router = useRouter();
  const { isDark, studyLanguage } = useAppContext();
  const cardRef = useRef<ViewShot>(null);

  const [todayStat, setTodayStat] = useState<DailyStat | null>(null);
  const [weekBest, setWeekBest] = useState({ minutes: 0, accuracy: 0 });
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [isShareError, setIsShareError] = useState(false);
  const [streakDays, setStreakDays] = useState(0);
  const [themeIdx, setThemeIdx] = useState(0);

  // 自定义模板
  const [showEditModal, setShowEditModal] = useState(false);
  const [cardTitle, setCardTitle] = useState('AI 私塾');
  const [cardSubtitle, setCardSubtitle] = useState('今日学习战报');
  const [cardSignature, setCardSignature] = useState('AI私塾 · 专注学习');
  const [cardFields, setCardFields] = useState<CardFields>({
    showStudyTime: true, showNewWords: true, showAccuracy: true,
    showQuestions: true, showWeekBest: true, showStreak: true,
  });
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubtitle, setDraftSubtitle] = useState('');
  const [draftSignature, setDraftSignature] = useState('');
  const [draftFields, setDraftFields] = useState<CardFields>({ ...cardFields });

  const THEMES = [
    { name: '深海蓝', bg: '#2C5F8A', accent: 'rgba(255,255,255,0.15)', text: 'white', sub: 'rgba(186,230,253,0.85)' },
    { name: '森林绿', bg: '#2E6B5C', accent: 'rgba(255,255,255,0.15)', text: 'white', sub: 'rgba(167,243,208,0.85)' },
    { name: '暖橙色', bg: '#C0532A', accent: 'rgba(255,255,255,0.15)', text: 'white', sub: 'rgba(254,215,170,0.85)' },
  ];
  const theme = THEMES[themeIdx];

  const LANG_LABEL: Record<string, string> = {
    en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语', es: '西班牙语', pt: '葡萄牙语', ru: '俄语',
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    const today = await getTodayStat();
    const week = await getWeekStats(7);
    const bestMin = week.length ? Math.max(...week.map(d => d.study_minutes || 0)) : 0;
    const bestAcc = week.length ? Math.max(...week.map(d => d.accuracy || 0)) : 0;
    setTodayStat(today);
    setWeekBest({ minutes: bestMin, accuracy: bestAcc });
    getStreakDays().then(setStreakDays).catch(() => {});
  }

  async function handleShare() {
    setSharing(true); setShareMsg(''); setIsShareError(false);
    try {
      const uri = await cardRef.current?.capture?.();
      if (!uri) throw new Error('截图失败，请稍后重试');
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) throw new Error('当前设备不支持分享');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '分享学习战报' });
      setShareMsg('分享成功！'); setIsShareError(false);
    } catch (e: any) {
      setShareMsg(e?.message ?? '分享失败，请稍后重试'); setIsShareError(true);
    } finally { setSharing(false); }
  }

  function openEditModal() {
    setDraftTitle(cardTitle); setDraftSubtitle(cardSubtitle);
    setDraftSignature(cardSignature); setDraftFields({ ...cardFields });
    setShowEditModal(true);
  }

  function applyDraft() {
    setCardTitle(draftTitle.trim() || 'AI 私塾');
    setCardSubtitle(draftSubtitle.trim() || '今日学习战报');
    setCardSignature(draftSignature.trim() || 'AI私塾 · 专注学习');
    setCardFields({ ...draftFields });
    setShowEditModal(false);
  }

  function toggleDraftField(key: keyof CardFields) {
    setDraftFields(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const modalBg = isDark ? '#2A2A2A' : '#FFFFFF';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputText = isDark ? '#fff' : '#1a2a3a';

  const dataItems = [
    cardFields.showStudyTime && { label: '学习时长', value: `${todayStat?.study_minutes ?? 0}`, unit: '分钟', icon: '⏱' },
    cardFields.showNewWords && { label: '新词', value: `${todayStat?.new_words ?? 0}`, unit: '个', icon: '📖' },
    cardFields.showAccuracy && { label: '正确率', value: `${Math.round(todayStat?.accuracy ?? 0)}`, unit: '%', icon: '✅' },
    cardFields.showQuestions && { label: '试题', value: `${todayStat?.question_count ?? 0}`, unit: '题', icon: '📝' },
  ].filter(Boolean) as { label: string; value: string; unit: string; icon: string }[];

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View className="px-5 py-5">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => router.back()} className="p-1 -ml-1">
                <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
              </Pressable>
              <Text className={`text-xl font-bold ${textColor}`}>分享学习卡片</Text>
            </View>
            <Pressable
              onPress={openEditModal}
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl border ${isDark ? 'bg-[#2A2A2A] border-[#444]' : 'bg-white border-gray-200'}`}
            >
              <Ionicons name="create-outline" size={14} color="#2C5F8A" />
              <Text className="text-xs text-[#2C5F8A] font-medium">编辑模板</Text>
            </Pressable>
          </View>
          <Text className={`text-sm mb-3 ${subText}`}>生成图片后可保存或分享给好友</Text>

          {/* 主题切换 */}
          <View className="flex-row items-center gap-2 mb-5">
            <Text className={`text-xs ${subText}`}>卡片主题：</Text>
            {THEMES.map((t, i) => (
              <Pressable
                key={t.name}
                onPress={() => setThemeIdx(i)}
                style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.bg, borderWidth: themeIdx === i ? 2 : 0, borderColor: 'white', boxShadow: themeIdx === i ? '0 0 0 2px ' + t.bg : 'none' }}
              />
            ))}
            <Text className={`text-xs font-medium ml-1 ${subText}`}>{theme.name}</Text>
          </View>

          {/* 可截图的卡片区域 */}
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1.0 }} style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 24 }}>
            <View style={{ backgroundColor: theme.bg, padding: 24, borderRadius: 24 }}>
              {/* 标题栏 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View>
                  <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>{cardTitle}</Text>
                  <Text style={{ color: theme.sub, fontSize: 12, marginTop: 2 }}>{cardSubtitle}</Text>
                </View>
                <View style={{ backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: theme.text, fontSize: 12 }}>{new Date().toLocaleDateString('zh-CN')}</Text>
                </View>
              </View>

              {/* 连续打卡 + 语言徽章 */}
              {cardFields.showStreak && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  <View style={{ backgroundColor: theme.accent, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 14 }}>🔥</Text>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>连续 {streakDays} 天</Text>
                  </View>
                  <View style={{ backgroundColor: theme.accent, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 14 }}>🌍</Text>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{LANG_LABEL[studyLanguage] || studyLanguage}</Text>
                  </View>
                </View>
              )}

              {/* 数据卡片（动态显示） */}
              {dataItems.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  {dataItems.map(item => (
                    <View key={item.label} style={{ flex: 1, minWidth: 120, backgroundColor: theme.accent, borderRadius: 16, padding: 14 }}>
                      <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
                        <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>{item.value}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginLeft: 3 }}>{item.unit}</Text>
                      </View>
                      <Text style={{ color: theme.sub, fontSize: 11, marginTop: 2 }}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 本周最佳 */}
              {cardFields.showWeekBest && (
                <View style={{ backgroundColor: theme.accent, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Text style={{ fontSize: 16 }}>🏆</Text>
                  <Text style={{ color: theme.text, fontSize: 12, flex: 1 }}>
                    本周最佳 · {weekBest.minutes} 分钟 / {Math.round(weekBest.accuracy)}% 正确率
                  </Text>
                  {streakDays >= 7 && (
                    <View style={{ backgroundColor: 'rgba(255,215,0,0.25)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#FFD700', fontSize: 11, fontWeight: '700' }}>⭐ {streakDays}天</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: theme.sub, fontSize: 11 }}>坚持打卡第 {streakDays} 天</Text>
                <Text style={{ color: theme.sub, fontSize: 11 }}>{cardSignature}</Text>
              </View>
            </View>
          </ViewShot>

          {shareMsg ? (
            <View className={`rounded-xl p-3 mb-4 ${isShareError
              ? (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')
              : (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200')}`}>
              <Text className={`text-sm ${isShareError ? 'text-red-500' : 'text-green-600'}`}>{shareMsg}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleShare}
            disabled={sharing}
            className={`py-4 rounded-xl items-center ${sharing ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
          >
            {sharing ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#aaa" />
                <Text className={subText}>生成截图中...</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons name="share-social-outline" size={18} color="white" />
                <Text className="text-white font-semibold">立即分享</Text>
              </View>
            )}
          </Pressable>

          <Text className={`text-xs text-center mt-3 ${subText}`}>将生成 PNG 图片，可保存至相册或直接分享</Text>
        </View>
      </ScrollView>

      {/* 自定义模板编辑弹窗 */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: modalBg, maxHeight: '85%' }}>
            <View className="flex-row items-center justify-between mb-5">
              <Text className={`text-lg font-bold ${textColor}`}>自定义卡片模板</Text>
              <Pressable onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={22} color={isDark ? '#aaa' : '#666'} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text className={`text-xs font-semibold mb-3 ${subText}`}>卡片文字</Text>
              <View className={`rounded-xl border p-4 mb-4 gap-3 ${isDark ? 'bg-[#333] border-[#444]' : 'bg-gray-50 border-gray-200'}`}>
                <View>
                  <Text className={`text-xs mb-1 ${subText}`}>主标题</Text>
                  <TextInput
                    value={draftTitle} onChangeText={setDraftTitle}
                    placeholder="AI 私塾" placeholderTextColor={isDark ? '#555' : '#aaa'}
                    style={{ backgroundColor: inputBg, color: inputText, borderRadius: 8, padding: 10, fontSize: 14 }}
                  />
                </View>
                <View>
                  <Text className={`text-xs mb-1 ${subText}`}>副标题</Text>
                  <TextInput
                    value={draftSubtitle} onChangeText={setDraftSubtitle}
                    placeholder="今日学习战报" placeholderTextColor={isDark ? '#555' : '#aaa'}
                    style={{ backgroundColor: inputBg, color: inputText, borderRadius: 8, padding: 10, fontSize: 14 }}
                  />
                </View>
                <View>
                  <Text className={`text-xs mb-1 ${subText}`}>底部署名</Text>
                  <TextInput
                    value={draftSignature} onChangeText={setDraftSignature}
                    placeholder="AI私塾 · 专注学习" placeholderTextColor={isDark ? '#555' : '#aaa'}
                    style={{ backgroundColor: inputBg, color: inputText, borderRadius: 8, padding: 10, fontSize: 14 }}
                  />
                </View>
              </View>

              <Text className={`text-xs font-semibold mb-3 ${subText}`}>显示内容</Text>
              <View className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#333] border-[#444]' : 'bg-gray-50 border-gray-200'}`}>
                {([
                  { key: 'showStreak' as const, label: '🔥 连续打卡天数' },
                  { key: 'showStudyTime' as const, label: '⏱ 学习时长' },
                  { key: 'showNewWords' as const, label: '📖 新词数量' },
                  { key: 'showAccuracy' as const, label: '✅ 正确率' },
                  { key: 'showQuestions' as const, label: '📝 试题数量' },
                  { key: 'showWeekBest' as const, label: '🏆 本周最佳' },
                ]).map((item, i, arr) => (
                  <View key={item.key} className={`flex-row items-center justify-between px-4 py-3 ${i < arr.length - 1 ? `border-b ${isDark ? 'border-[#444]' : 'border-gray-200'}` : ''}`}>
                    <Text className={`text-sm ${textColor}`}>{item.label}</Text>
                    <Switch
                      value={draftFields[item.key]}
                      onValueChange={() => toggleDraftField(item.key)}
                      trackColor={{ false: isDark ? '#555' : '#ccc', true: '#2C5F8A' }}
                      thumbColor="white"
                    />
                  </View>
                ))}
              </View>

              <View className="flex-row gap-3 mt-6 mb-2">
                <Pressable
                  onPress={() => setShowEditModal(false)}
                  className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}
                >
                  <Text className={`font-semibold text-sm ${subText}`}>取消</Text>
                </Pressable>
                <Pressable onPress={applyDraft} className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]">
                  <Text className="text-white font-semibold text-sm">应用修改</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
