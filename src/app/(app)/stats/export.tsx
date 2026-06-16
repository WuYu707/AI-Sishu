/**
 * 导出学习报告页
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getDailyStats } from '@/lib/database';

// Web 环境：Blob 触发下载
function downloadTextOnWeb(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Format = 'csv' | 'txt';
type Range = '7' | '30' | '90';

export default function ExportScreen() {
  const router = useRouter();
  const { isDark } = useAppContext();

  const [format, setFormat] = useState<Format>('csv');
  const [range, setRange] = useState<Range>('7');
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  async function handleExport() {
    setLoading(true);
    setResultMsg('');
    setIsError(false);
    try {
      const data = await getDailyStats(Number(range));
      // 按日期升序
      const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

      let content = '';
      let filename = '';

      if (format === 'csv') {
        filename = `AI私塾学习报告_近${range}天_${Date.now()}.csv`;
        const header = '日期,学习时长(分钟),新词数,正确率(%),完成题数';
        const rows = sorted.map(d =>
          `${d.date},${d.study_minutes},${d.new_words},${Math.round(d.accuracy)},${d.question_count}`
        );
        // 统计摘要
        const totalMin = sorted.reduce((s, d) => s + (d.study_minutes || 0), 0);
        const totalWords = sorted.reduce((s, d) => s + (d.new_words || 0), 0);
        const totalQ = sorted.reduce((s, d) => s + (d.question_count || 0), 0);
        const avgAcc = sorted.length ? Math.round(sorted.reduce((s, d) => s + (d.accuracy || 0), 0) / sorted.length) : 0;
        content = [
          header,
          ...rows,
          '',
          `汇总,${totalMin},${totalWords},${avgAcc},${totalQ}`,
        ].join('\n');
      } else {
        filename = `AI私塾学习报告_近${range}天_${Date.now()}.txt`;
        const totalMin = sorted.reduce((s, d) => s + (d.study_minutes || 0), 0);
        const totalWords = sorted.reduce((s, d) => s + (d.new_words || 0), 0);
        const totalQ = sorted.reduce((s, d) => s + (d.question_count || 0), 0);
        const avgAcc = sorted.length ? Math.round(sorted.reduce((s, d) => s + (d.accuracy || 0), 0) / sorted.length) : 0;
        const studyDays = sorted.filter(d => d.study_minutes > 0).length;

        content = [
          '═══ AI私塾 学习报告 ═══',
          `报告周期：近 ${range} 天（${sorted[0]?.date || '—'} ~ ${sorted[sorted.length - 1]?.date || '—'}）`,
          `生成时间：${new Date().toLocaleString('zh-CN')}`,
          '',
          '【总体摘要】',
          `  有效学习天数：${studyDays} 天`,
          `  累计学习时长：${totalMin} 分钟（约 ${(totalMin / 60).toFixed(1)} 小时）`,
          `  新增单词总数：${totalWords} 个`,
          `  完成题目总数：${totalQ} 题`,
          `  平均正确率：${avgAcc}%`,
          '',
          '【每日明细】',
          ...sorted.map(d =>
            `  ${d.date}  时长:${d.study_minutes}min  新词:${d.new_words}  正确率:${Math.round(d.accuracy)}%  题数:${d.question_count}`
          ),
          '',
          '━━━━━━━━━━━━━━━━',
          'AI私塾 · 专注高效学习',
        ].join('\n');
      }

      if (!content || sorted.length === 0) {
        setResultMsg('暂无学习数据，无法生成报告');
        setIsError(true);
        setLoading(false);
        return;
      }

      if (process.env.EXPO_OS === 'web') {
        downloadTextOnWeb(content, filename, format === 'csv' ? 'text/csv' : 'text/plain');
        setResultMsg('报告已下载：' + filename);
      } else {
        const path = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(path, {
          mimeType: format === 'csv' ? 'text/csv' : 'text/plain',
          dialogTitle: '导出学习报告',
        });
        setResultMsg('报告已生成，请选择保存或分享方式');
      }
    } catch (e: any) {
      setResultMsg('导出失败：' + (e?.message || '请稍后重试'));
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
    <ScrollView className={`flex-1 ${bg}`} contentInsetAdjustmentBehavior="automatic">
      <View className="px-5 py-5">
          {/* 返回按钮 */}
          <View className="flex-row items-center gap-3 mb-5">
            <Pressable onPress={() => router.back()} className="p-1 -ml-1">
              <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
            </Pressable>
            <Text className={`text-xl font-bold ${textColor}`}>导出学习报告</Text>
          </View>
        <Text className={`text-lg font-bold mb-1 ${textColor}`}>导出学习报告</Text>
        <Text className={`text-sm mb-6 ${subText}`}>将学习统计数据导出为文件，可保存或分享</Text>

        {/* 时间范围 */}
        <Text className={`text-sm font-medium mb-3 ${textColor}`}>时间范围</Text>
        <View className="flex-row gap-3 mb-6">
          {([['7', '近7天'], ['30', '近30天'], ['90', '近90天']] as [Range, string][]).map(([v, label]) => (
            <Pressable
              key={v}
              onPress={() => setRange(v)}
              className={`flex-1 py-3 rounded-xl items-center border ${range === v ? 'bg-[#2C5F8A] border-[#2C5F8A]' : card}`}
            >
              <Text className={`text-sm font-medium ${range === v ? 'text-white' : subText}`}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 导出格式 */}
        <Text className={`text-sm font-medium mb-3 ${textColor}`}>导出格式</Text>
        <View className={`rounded-2xl border overflow-hidden mb-6 ${card}`} style={{ borderCurve: 'continuous' }}>
          {([
            { value: 'csv', label: 'CSV（表格）', desc: '可用 Excel / Numbers 打开，便于进一步分析', icon: 'grid-outline' },
            { value: 'txt', label: '文本报告', desc: '人类可读的纯文本格式，包含摘要和每日明细', icon: 'document-text-outline' },
          ] as { value: Format; label: string; desc: string; icon: string }[]).map((opt, i) => (
            <Pressable
              key={opt.value}
              onPress={() => setFormat(opt.value)}
              className={`flex-row items-center gap-3 px-4 py-4 ${i > 0 ? (isDark ? 'border-t border-[#333]' : 'border-t border-gray-100') : ''}`}
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: format === opt.value ? '#2C5F8A18' : isDark ? '#333' : '#F3F4F6' }}>
                <Ionicons name={opt.icon as any} size={20} color={format === opt.value ? '#2C5F8A' : (isDark ? '#888' : '#666')} />
              </View>
              <View className="flex-1">
                <Text className={`text-sm font-medium ${textColor}`}>{opt.label}</Text>
                <Text className={`text-xs mt-0.5 ${subText}`}>{opt.desc}</Text>
              </View>
              <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${format === opt.value ? 'border-[#2C5F8A] bg-[#2C5F8A]' : isDark ? 'border-[#555]' : 'border-gray-300'}`}>
                {format === opt.value && <Ionicons name="checkmark" size={12} color="white" />}
              </View>
            </Pressable>
          ))}
        </View>

        {resultMsg ? (
          <View className={`rounded-xl p-3 mb-4 ${isError ? (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200') : (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200')}`}>
            <Text className={isError ? 'text-red-500 text-xs' : 'text-green-600 text-xs'}>{resultMsg}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleExport}
          disabled={loading}
          className={`py-4 rounded-xl items-center ${loading ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
        >
          {loading
            ? <View className="flex-row items-center gap-2"><ActivityIndicator size="small" color="#aaa" /><Text className={subText}>生成报告中...</Text></View>
            : <View className="flex-row items-center gap-2">
                <Ionicons name="download-outline" size={16} color="white" />
                <Text className="text-white font-semibold">生成并导出报告</Text>
              </View>
          }
        </Pressable>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
