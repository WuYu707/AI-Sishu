/**
 * 试题练习页 - 顺序/随机/限时/竞速/闯关 五种模式 + 题目快速编辑
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import {
  getQuestions, getPracticeProgress, savePracticeProgress,
  saveAnswerRecord, updateTodayStat, addLog, updateQuestion, type Question
} from '@/lib/database';

/** 竞速分级：S/A/B/C */
function getRaceGrade(accuracy: number, totalSeconds: number): { grade: string; label: string; color: string } {
  if (accuracy >= 90 && totalSeconds <= 60) return { grade: 'S', label: '完美', color: '#FFD700' };
  if (accuracy >= 75 && totalSeconds <= 120) return { grade: 'A', label: '优秀', color: '#2C5F8A' };
  if (accuracy >= 60) return { grade: 'B', label: '良好', color: '#E67E22' };
  return { grade: 'C', label: '继续努力', color: '#EF4444' };
}

export default function PracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDark } = useAppContext();

  type PracticeMode = 'sequential' | 'random' | 'timed' | 'race' | 'dungeon';
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('sequential');
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showResume, setShowResume] = useState(false);
  const [savedProgress, setSavedProgress] = useState(0);
  const [results, setResults] = useState<{ id: number; correct: boolean }[]>([]);
  const [showSummary, setShowSummary] = useState(false);

  // ── 竞速模式 ──
  const raceStartRef = useRef<number>(0);
  const [raceTotalSec, setRaceTotalSec] = useState(0);
  const raceElapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [raceElapsed, setRaceElapsed] = useState(0);

  // ── 闯关模式 ──
  const DUNGEON_PER_LEVEL = 5;         // 每关题数
  const DUNGEON_MAX_MISS = 2;          // 每关最多错题数（超过则失败）
  const [dungeonLevel, setDungeonLevel] = useState(1);
  const [dungeonMisses, setDungeonMisses] = useState(0);  // 本关错误数
  const [dungeonFailed, setDungeonFailed] = useState(false);
  const [showDungeonLevelUp, setShowDungeonLevelUp] = useState(false);

  // ── 题目快速编辑 ──
  const [showEditQuestion, setShowEditQuestion] = useState(false);
  const [editQForm, setEditQForm] = useState({ content: '', answer: '', explanation: '' });
  const [showDungeonFail, setShowDungeonFail] = useState(false);
  const dungeonLevelStartIdx = useRef(0); // 本关起始题目索引

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 计时 effect（限时模式）
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && timerActive) {
      setTimerActive(false);
      if (!submitted) handleSubmit();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive, timeLeft]);

  // 竞速模式 interval 清理（防止导航离开后泄漏）
  useEffect(() => {
    return () => { if (raceElapsedRef.current) clearInterval(raceElapsedRef.current); };
  }, []);

  function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  async function loadData() {
    setLoading(true);
    try {
      const qs = await getQuestions(Number(id));
      setQuestions(qs);
      await addLog('info', '开始练习', `试题集ID: ${id}, 题目数: ${qs.length}`).catch(() => {});
      const progress = await getPracticeProgress(Number(id));
      const savedIdx = progress ? progress.current_index : 0;
      if (savedIdx > 0) {
        setSavedProgress(savedIdx);
        setShowResume(true);
      } else {
        setShowModeSelect(true);
      }
    } finally {
      setLoading(false);
    }
  }

  function startWithMode(mode: PracticeMode) {
    setPracticeMode(mode);
    setShowModeSelect(false);
    setCurrentIdx(0);
    setResults([]);
    setSelectedOptions([]);
    setSubmitted(false);

    if (mode === 'random') setQuestions(prev => shuffleArray(prev));
    if (mode === 'timed') { setTimeLeft(30); setTimerActive(true); }

    // 竞速模式：记录开始时间，启动秒表
    if (mode === 'race') {
      raceStartRef.current = Date.now();
      setRaceElapsed(0);
      raceElapsedRef.current = setInterval(() => {
        setRaceElapsed(Math.floor((Date.now() - raceStartRef.current) / 1000));
      }, 1000);
    }

    // 闯关模式：重置关卡
    if (mode === 'dungeon') {
      setDungeonLevel(1);
      setDungeonMisses(0);
      setDungeonFailed(false);
      dungeonLevelStartIdx.current = 0;
    }
  }

  function resume() { setCurrentIdx(savedProgress); setShowResume(false); }

  function restart() {
    setCurrentIdx(0);
    setResults([]);
    setShowResume(false);
    setShowModeSelect(true);
  }

  const current = questions[currentIdx];

  function getOptions(): string[] {
    if (!current) return [];
    try {
      const opts = JSON.parse(current.options || '[]');
      return Array.isArray(opts) ? opts : [];
    } catch { return []; }
  }

  const options = getOptions();
  const isMultiple = current?.type === 'multiple_choice';
  const isTrueFalse = current?.type === 'true_false';
  const isChoice = current?.type === 'single_choice' || isMultiple || isTrueFalse;

  function toggleOption(opt: string) {
    if (submitted) return;
    if (isMultiple) {
      setSelectedOptions(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
    } else {
      setSelectedOptions([opt]);
    }
  }

  async function handleSubmit() {
    if (!current) return;
    const selected = selectedOptions.join('');
    const correct = current.answer?.trim() === selected.trim();
    setSubmitted(true);
    const newResults = [...results, { id: current.id, correct }];
    setResults(newResults);
    await saveAnswerRecord(Number(id), current.id, selected, correct);
    await savePracticeProgress(Number(id), currentIdx + 1, {});
    await updateTodayStat({ question_count: 1 });

    // 闯关模式：答错计数
    if (practiceMode === 'dungeon' && !correct) {
      const newMisses = dungeonMisses + 1;
      setDungeonMisses(newMisses);
      if (newMisses > DUNGEON_MAX_MISS) {
        setDungeonFailed(true);
        setShowDungeonFail(true);
      }
    }
  }

  async function handleNext() {
    const nextIdx = currentIdx + 1;
    if (nextIdx < questions.length) {
      setCurrentIdx(nextIdx);
      setSelectedOptions([]);
      setSubmitted(false);
      if (practiceMode === 'timed') { setTimeLeft(30); setTimerActive(true); }

      // 闯关：检查是否过关
      if (practiceMode === 'dungeon') {
        const levelProgress = nextIdx - dungeonLevelStartIdx.current;
        if (levelProgress >= DUNGEON_PER_LEVEL && !dungeonFailed) {
          // 本关通过，进入下一关
          setDungeonLevel(prev => prev + 1);
          setDungeonMisses(0);
          dungeonLevelStartIdx.current = nextIdx;
          setShowDungeonLevelUp(true);
        }
      }
    } else {
      // 竞速：停止秒表
      if (practiceMode === 'race' && raceElapsedRef.current) {
        clearInterval(raceElapsedRef.current);
        setRaceTotalSec(Math.floor((Date.now() - raceStartRef.current) / 1000));
      }
      setShowSummary(true);
      addLog('info', '练习完成', `试题集ID: ${id}, 模式: ${practiceMode}`).catch(() => {});
    }
  }

  const correctCount = results.filter(r => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
  const raceGrade = getRaceGrade(accuracy, raceTotalSec);

  // 闯关模式：当关题序（当前关卡内第几题）
  const dungeonLevelProgress = currentIdx - dungeonLevelStartIdx.current + 1;

  async function handleSaveEditQuestion() {
    if (!current) return;
    await updateQuestion(current.id, {
      content: editQForm.content.trim() || current.content,
      answer: editQForm.answer.trim() || current.answer,
      explanation: editQForm.explanation.trim() || current.explanation,
    });
    // 就地更新内存中的题目列表
    setQuestions(prev => prev.map(q =>
      q.id === current.id
        ? { ...q, content: editQForm.content.trim() || q.content, answer: editQForm.answer.trim() || q.answer, explanation: editQForm.explanation.trim() || q.explanation }
        : q
    ));
    setShowEditQuestion(false);
  }

  if (loading) {
    return <SafeAreaView className={`flex-1 items-center justify-center ${bg}`}><ActivityIndicator size="large" color="#2C5F8A" /></SafeAreaView>;
  }

  if (questions.length === 0) {
    return (
      <SafeAreaView className={`flex-1 ${bg}`}>
        <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
          <Pressable onPress={() => router.back()} className="p-1 -ml-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className={`text-base ${textColor}`}>题库暂无题目</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      {/* 顶部：返回 + 进度条 + 模式标识 */}
      <View className="px-5 pt-3 pb-0">
        <View className="flex-row items-center gap-3 mb-2">
          <Pressable onPress={() => router.back()} className="p-1 -ml-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
          <Text className={`text-sm font-medium flex-1 ${textColor}`}>第 {currentIdx + 1} 题 / 共 {questions.length} 题</Text>

          {/* 限时模式：倒计时 */}
          {practiceMode === 'timed' && (
            <View className={`px-2 py-0.5 rounded-full mr-1 ${timeLeft <= 10 ? 'bg-red-100' : isDark ? 'bg-[#333]' : 'bg-blue-50'}`}>
              <Text className={`text-xs font-bold ${timeLeft <= 10 ? 'text-red-500' : 'text-[#2C5F8A]'}`}>⏱ {timeLeft}s</Text>
            </View>
          )}

          {/* 竞速模式：计时 */}
          {practiceMode === 'race' && (
            <View className={`px-2 py-0.5 rounded-full mr-1 ${isDark ? 'bg-[#1a2d40]' : 'bg-blue-50'}`}>
              <Text className="text-xs font-bold text-[#2C5F8A]">🏁 {raceElapsed}s</Text>
            </View>
          )}

          {/* 闯关模式：关卡 + 生命 */}
          {practiceMode === 'dungeon' && (
            <View className="flex-row items-center gap-1 mr-1">
              <Text className={`text-xs font-bold ${textColor}`}>第{dungeonLevel}关</Text>
              <Text className={`text-xs ${subText}`}>{dungeonLevelProgress}/{DUNGEON_PER_LEVEL}</Text>
              <View className="flex-row ml-1">
                {Array.from({ length: DUNGEON_MAX_MISS + 1 }).map((_, i) => (
                  <Text key={i} style={{ fontSize: 12 }}>{i < DUNGEON_MAX_MISS + 1 - dungeonMisses ? '❤️' : '🖤'}</Text>
                ))}
              </View>
            </View>
          )}

          <Text className={`text-xs ${subText}`}>{Math.round(((currentIdx + 1) / questions.length) * 100)}%</Text>
        </View>
        <View className={`h-2 rounded-full ${isDark ? 'bg-[#333]' : 'bg-gray-200'}`}>
          <View className="h-2 rounded-full bg-[#2C5F8A]" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }} />
        </View>
        {/* 闯关：关卡内进度条 */}
        {practiceMode === 'dungeon' && (
          <View className={`h-1 rounded-full mt-1 ${isDark ? 'bg-[#444]' : 'bg-orange-100'}`}>
            <View className="h-1 rounded-full bg-[#E67E22]" style={{ width: `${(dungeonLevelProgress / DUNGEON_PER_LEVEL) * 100}%` }} />
          </View>
        )}
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="px-5 pb-6">
          {/* 题目 */}
          <View className={`rounded-2xl border p-5 mb-4 ${card}`} style={{ borderCurve: 'continuous', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.06)' }] }}>
            <View className="flex-row items-center justify-between mb-2">
              <View className={`inline-flex self-start px-2 py-0.5 rounded-full ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
                <Text className={`text-xs ${subText}`}>
                  {current?.type === 'single_choice' ? '单选题' : current?.type === 'multiple_choice' ? '多选题' : current?.type === 'true_false' ? '判断题' : current?.type === 'fill_in_blank' ? '填空题' : '简答题'}
                </Text>
              </View>
              {/* 题目编辑入口 */}
              <Pressable
                onPress={() => {
                  setEditQForm({ content: current?.content || '', answer: current?.answer || '', explanation: current?.explanation || '' });
                  setShowEditQuestion(true);
                }}
                hitSlop={8}
                className={`p-1.5 rounded-lg ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
              >
                <Ionicons name="create-outline" size={14} color={isDark ? '#888' : '#999'} />
              </Pressable>
            </View>
            <Text className={`text-base leading-6 ${textColor}`}>{current?.content}</Text>
          </View>

          {/* 选项 */}
          {isChoice && (
            <View className="gap-3 mb-4">
              {(isTrueFalse ? ['正确', '错误'] : options).map((opt, oi) => {
                const optKey = isTrueFalse ? opt : String.fromCharCode(65 + oi);
                const isSelected = selectedOptions.includes(optKey);
                const isCorrect = submitted && current?.answer?.includes(optKey);
                const isWrong = submitted && isSelected && !isCorrect;
                return (
                  <Pressable
                    key={oi}
                    onPress={() => toggleOption(optKey)}
                    className={`rounded-xl border p-4 flex-row items-center gap-3 ${
                      isCorrect ? (isDark ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-400') :
                      isWrong ? (isDark ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-400') :
                      isSelected ? 'bg-[#2C5F8A] border-[#2C5F8A]' : card
                    }`}
                    style={{ borderCurve: 'continuous' }}
                  >
                    <View className={`w-7 h-7 rounded-full items-center justify-center border ${
                      isCorrect ? 'bg-green-500 border-green-500' :
                      isWrong ? 'bg-red-500 border-red-500' :
                      isSelected ? 'bg-white border-white' :
                      isDark ? 'border-[#555]' : 'border-gray-300'
                    }`}>
                      <Text className={`text-xs font-bold ${isSelected || isCorrect || isWrong ? 'text-white' : subText}`}>
                        {isTrueFalse ? (oi === 0 ? '✓' : '✗') : String.fromCharCode(65 + oi)}
                      </Text>
                    </View>
                    <Text className={`flex-1 text-sm leading-5 ${isSelected && !submitted ? 'text-white' : textColor}`}>{opt}</Text>
                    {isCorrect && <Ionicons name="checkmark-circle" size={18} color="#22C55E" />}
                    {isWrong && <Ionicons name="close-circle" size={18} color="#EF4444" />}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* 解析 */}
          {submitted && current?.explanation && (
            <View className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-blue-950 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
              <Text className={`text-xs font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>解析</Text>
              <Text className={`text-sm leading-5 ${isDark ? 'text-blue-200' : 'text-blue-700'}`}>{current.explanation}</Text>
            </View>
          )}

          {submitted && (
            <View className={`rounded-xl p-3 mb-4 flex-row items-center gap-2 ${
              results[results.length - 1]?.correct ? (isDark ? 'bg-green-900' : 'bg-green-50') : (isDark ? 'bg-red-900' : 'bg-red-50')
            }`}>
              <Ionicons
                name={results[results.length - 1]?.correct ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={results[results.length - 1]?.correct ? '#22C55E' : '#EF4444'}
              />
              <Text className={results[results.length - 1]?.correct ? 'text-green-600 font-medium text-sm' : 'text-red-500 font-medium text-sm'}>
                {results[results.length - 1]?.correct ? '回答正确！' : `回答错误，正确答案：${current?.answer}`}
              </Text>
            </View>
          )}

          {/* 操作按钮 */}
          {!submitted ? (
            <Pressable
              onPress={handleSubmit}
              disabled={selectedOptions.length === 0 && isChoice}
              className={`py-4 rounded-xl items-center ${selectedOptions.length === 0 && isChoice ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
            >
              <Text className={`font-semibold ${selectedOptions.length === 0 && isChoice ? subText : 'text-white'}`}>提交答案</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNext}
              disabled={practiceMode === 'dungeon' && dungeonFailed}
              className={`py-4 rounded-xl items-center ${practiceMode === 'dungeon' && dungeonFailed ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
            >
              <Text className={`font-semibold ${practiceMode === 'dungeon' && dungeonFailed ? subText : 'text-white'}`}>
                {currentIdx < questions.length - 1 ? '下一题' : '完成练习'}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ── 继续上次 弹窗 ── */}
      <Modal visible={showResume} transparent animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="w-full rounded-2xl p-6" style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff' }}>
            <Text className={`text-lg font-bold mb-2 ${textColor}`}>继续上次练习？</Text>
            <Text className={`text-sm mb-6 ${subText}`}>上次练习到第 {savedProgress + 1} 题</Text>
            <View className="flex-row gap-3">
              <Pressable onPress={restart} className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}>
                <Text className={`font-semibold ${subText}`}>重新开始</Text>
              </Pressable>
              <Pressable onPress={resume} className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]">
                <Text className="text-white font-semibold">继续练习</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 模式选择 ── */}
      <Modal visible={showModeSelect} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff' }}>
            <Text className={`text-xl font-bold mb-2 text-center ${textColor}`}>选择练习模式</Text>
            <Text className={`text-sm text-center mb-5 ${subText}`}>共 {questions.length} 道题目</Text>
            <View className="gap-3 mb-2">
              {([
                { mode: 'sequential' as const, icon: '📋', title: '顺序练习', desc: '按题目顺序依次作答，适合系统学习', color: '#2C5F8A' },
                { mode: 'random' as const, icon: '🔀', title: '随机练习', desc: '随机顺序作答，加强记忆效果', color: '#2C5F8A' },
                { mode: 'timed' as const, icon: '⏱', title: '限时挑战', desc: '每题 30 秒限时，挑战快速作答能力', color: '#E67E22' },
                { mode: 'race' as const, icon: '🏁', title: '竞速模式', desc: '全程计时，完成后获评 S/A/B/C 等级', color: '#E67E22' },
                { mode: 'dungeon' as const, icon: '🗡️', title: '闯关模式', desc: `每 ${DUNGEON_PER_LEVEL} 题一关，每关最多 ${DUNGEON_MAX_MISS} 次错误`, color: '#8B5CF6' },
              ] as const).map(item => (
                <Pressable
                  key={item.mode}
                  onPress={() => startWithMode(item.mode)}
                  className={`rounded-2xl p-4 border flex-row items-center gap-3 ${isDark ? 'bg-[#333] border-[#444]' : 'bg-gray-50 border-gray-200'}`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: item.color + '20' }}>
                    <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className={`text-sm font-semibold ${textColor}`}>{item.title}</Text>
                    <Text className={`text-xs mt-0.5 ${subText}`}>{item.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={isDark ? '#555' : '#ccc'} />
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => { setShowModeSelect(false); router.back(); }} className="py-3 items-center">
              <Text className={`text-sm ${subText}`}>取消，返回题库</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── 闯关：过关弹窗 ── */}
      <Modal visible={showDungeonLevelUp} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-8">
          <View className="w-full rounded-2xl p-6 items-center" style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff' }}>
            <Text style={{ fontSize: 40 }}>🎉</Text>
            <Text className={`text-xl font-bold mt-3 mb-1 ${textColor}`}>第 {dungeonLevel - 1} 关通过！</Text>
            <Text className={`text-sm mb-6 ${subText}`}>进入第 {dungeonLevel} 关，加油！</Text>
            <Pressable onPress={() => setShowDungeonLevelUp(false)} className="bg-[#2C5F8A] px-8 py-3 rounded-xl">
              <Text className="text-white font-semibold">继续挑战</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── 闯关：失败弹窗 ── */}
      <Modal visible={showDungeonFail} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-8">
          <View className="w-full rounded-2xl p-6 items-center" style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff' }}>
            <Text style={{ fontSize: 40 }}>💔</Text>
            <Text className={`text-xl font-bold mt-3 mb-1 text-red-500`}>第 {dungeonLevel} 关失败</Text>
            <Text className={`text-sm text-center mb-6 ${subText}`}>本关错误超过 {DUNGEON_MAX_MISS} 次，挑战失败</Text>
            <View className="flex-row gap-3 w-full">
              <Pressable
                onPress={() => { setShowDungeonFail(false); startWithMode('dungeon'); }}
                className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
              >
                <Text className={`font-semibold ${subText}`}>重新闯关</Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowDungeonFail(false); router.back(); }}
                className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]"
              >
                <Text className="text-white font-semibold">返回题库</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 完成总结 ── */}
      <Modal visible={showSummary} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6" style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff' }}>
            <Text className={`text-xl font-bold mb-4 text-center ${textColor}`}>🎉 练习完成！</Text>

            {/* 竞速等级展示 */}
            {practiceMode === 'race' && (
              <View className="items-center mb-5">
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: raceGrade.color, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>{raceGrade.grade}</Text>
                </View>
                <Text className={`text-base font-bold ${textColor}`}>{raceGrade.label}</Text>
                <Text className={`text-xs mt-1 ${subText}`}>用时 {raceTotalSec} 秒</Text>
              </View>
            )}

            {/* 闯关关卡数 */}
            {practiceMode === 'dungeon' && (
              <View className={`flex-row items-center justify-center gap-2 mb-4 px-4 py-2 rounded-xl ${isDark ? 'bg-[#333]' : 'bg-purple-50'}`}>
                <Text style={{ fontSize: 18 }}>🗡️</Text>
                <Text className={`text-sm font-semibold ${textColor}`}>通过 {dungeonLevel - 1} 关</Text>
              </View>
            )}

            <View className="flex-row justify-center gap-8 mb-6">
              <View className="items-center">
                <Text className="text-3xl font-bold text-[#2C5F8A]">{correctCount}</Text>
                <Text className={`text-xs mt-1 ${subText}`}>答对</Text>
              </View>
              <View className="items-center">
                <Text className="text-3xl font-bold text-red-500">{results.length - correctCount}</Text>
                <Text className={`text-xs mt-1 ${subText}`}>答错</Text>
              </View>
              <View className="items-center">
                <Text className="text-3xl font-bold text-[#E67E22]">{accuracy}%</Text>
                <Text className={`text-xs mt-1 ${subText}`}>正确率</Text>
              </View>
            </View>
            <View className="gap-3">
              <Pressable
                onPress={() => { setShowSummary(false); router.push({ pathname: '/practice/wrong-answers', params: { paperId: id } }); }}
                className={`py-3 rounded-xl items-center border ${isDark ? 'border-orange-700' : 'border-orange-300'} ${isDark ? 'bg-[#2A2A2A]' : 'bg-orange-50'}`}
              >
                <Text className="text-orange-500 font-semibold">查看错题强化</Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowSummary(false); router.push('/(app)/(tabs)/practice'); }}
                className="py-3 rounded-xl items-center bg-[#2C5F8A]"
              >
                <Text className="text-white font-semibold">返回题库</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 题目快速编辑弹窗 */}
      <Modal visible={showEditQuestion} transparent animationType="fade">
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1 items-center justify-center px-5 bg-black/40">
          <View className="w-full rounded-2xl p-5" style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff' }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className={`text-base font-bold ${textColor}`}>编辑题目</Text>
              <Pressable onPress={() => setShowEditQuestion(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={isDark ? '#aaa' : '#666'} />
              </Pressable>
            </View>
            <Text className={`text-xs font-medium mb-1 ${subText}`}>题目内容</Text>
            <TextInput
              value={editQForm.content}
              onChangeText={v => setEditQForm(f => ({ ...f, content: v }))}
              multiline
              numberOfLines={4}
              placeholder="题目内容..."
              placeholderTextColor={isDark ? '#555' : '#aaa'}
              style={{ backgroundColor: isDark ? '#333' : '#F3F4F6', color: isDark ? '#fff' : '#1a2a3a', borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 10 }}
            />
            <Text className={`text-xs font-medium mb-1 ${subText}`}>正确答案</Text>
            <TextInput
              value={editQForm.answer}
              onChangeText={v => setEditQForm(f => ({ ...f, answer: v }))}
              placeholder="正确答案..."
              placeholderTextColor={isDark ? '#555' : '#aaa'}
              style={{ backgroundColor: isDark ? '#333' : '#F3F4F6', color: isDark ? '#fff' : '#1a2a3a', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10 }}
            />
            <Text className={`text-xs font-medium mb-1 ${subText}`}>解析（选填）</Text>
            <TextInput
              value={editQForm.explanation}
              onChangeText={v => setEditQForm(f => ({ ...f, explanation: v }))}
              multiline
              numberOfLines={3}
              placeholder="题目解析..."
              placeholderTextColor={isDark ? '#555' : '#aaa'}
              style={{ backgroundColor: isDark ? '#333' : '#F3F4F6', color: isDark ? '#fff' : '#1a2a3a', borderRadius: 10, padding: 12, fontSize: 14, minHeight: 64, textAlignVertical: 'top', marginBottom: 14 }}
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setShowEditQuestion(false)}
                className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}
              >
                <Text className={`font-semibold text-sm ${subText}`}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEditQuestion}
                className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]"
              >
                <Text className="text-white font-semibold text-sm">保存修改</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
