/**
 * 日志导出页
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { getAppLogs } from '@/lib/database';

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


export default function LogsScreen() {
  const router = useRouter();
  const { isDark } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [exported, setExported] = useState(false);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  async function handleExport() {
    setLoading(true);
    try {
      const logs = await getAppLogs();
      const content = [
        `AI私塾 日志导出`,
        `导出时间：${new Date().toLocaleString('zh-CN')}`,
        `应用版本：1.0.0`,
        '=' .repeat(40),
        ...logs.map(l => `[${l.level?.toUpperCase() || 'INFO'}] ${l.created_at} - ${l.message}`)
      ].join('\n');
      if (process.env.EXPO_OS === 'web') {
        downloadTextOnWeb(content, `AI私塾_日志_${Date.now()}.txt`, 'text/plain');
      } else {
        const path = FileSystem.cacheDirectory + `AI私塾_日志_${Date.now()}.txt`;
        await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: '导出日志文件' });
      }
      setExported(true);
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
            <Text className={`text-xl font-bold ${textColor}`}>日志导出</Text>
          </View>
        <Text className={`text-lg font-bold mb-1 ${textColor}`}>日志导出</Text>
        <Text className={`text-sm mb-6 ${subText}`}>导出应用运行日志，用于排查问题或向开发者反馈</Text>

        <View className={`rounded-2xl border p-5 items-center mb-6 ${card}`} style={{ borderCurve: 'continuous' }}>
          <Ionicons name="document-text-outline" size={48} color={isDark ? '#555' : '#ccc'} />
          <Text className={`text-base font-semibold mt-3 ${textColor}`}>导出日志文件</Text>
          <Text className={`text-sm text-center mt-2 ${subText}`}>
            包含最近的操作记录、错误堆栈和性能信息
          </Text>
        </View>

        <Pressable
          onPress={handleExport}
          disabled={loading}
          className={`py-4 rounded-xl items-center ${loading ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : exported ? 'bg-green-500' : 'bg-[#2C5F8A]'}`}
        >
          {loading
            ? <View className="flex-row items-center gap-2"><ActivityIndicator size="small" color="#aaa" /><Text className={subText}>生成日志...</Text></View>
            : <View className="flex-row items-center gap-2">
                <Ionicons name={exported ? 'checkmark' : 'share-outline'} size={16} color="white" />
                <Text className="text-white font-semibold">{exported ? '导出成功' : '导出并分享日志'}</Text>
              </View>
          }
        </Pressable>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
