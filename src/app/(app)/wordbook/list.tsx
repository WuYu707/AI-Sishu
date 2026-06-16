/**
 * 词本管理列表页
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppContext } from '@/lib/AppContext';
import {
  getWordbooks, createWordbook, updateWordbook, deleteWordbook,
  exportWordbookCsv, type Wordbook
} from '@/lib/database';
import Svg, { Circle } from 'react-native-svg';

/** 环形进度条组件 */
function CircularProgress({ pct, size = 52, isDark }: { pct: number; size?: number; isDark: boolean }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(pct / 100, 1) * circ;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={isDark ? '#333' : '#E5E7EB'} strokeWidth={5} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="#2C5F8A" strokeWidth={5} fill="none"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#2C5F8A' }}>{Math.round(pct)}%</Text>
    </View>
  );
}

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


export default function WordbookListScreen() {
  const router = useRouter();
  const { isDark } = useAppContext();

  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [editItem, setEditItem] = useState<Wordbook | null>(null);
  const [editName, setEditName] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? 'bg-[#333] text-white' : 'bg-gray-100 text-[#1a2a3a]';
  const modalBg = isDark ? '#2A2A2A' : '#FFFFFF';

  useFocusEffect(
    useCallback(() => {
      loadWordbooks();
    }, [])
  );

  async function loadWordbooks() {
    setLoading(true);
    try {
      const list = await getWordbooks();
      setWordbooks(list);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await createWordbook(newName.trim(), 'auto');
    setNewName('');
    setShowCreate(false);
    loadWordbooks();
  }

  async function handleEdit() {
    if (!editItem || !editName.trim()) return;
    await updateWordbook(editItem.id, editName.trim());
    setEditItem(null);
    loadWordbooks();
  }

  async function handleDelete(id: number) {
    await deleteWordbook(id);
    setExpandedId(null);
    loadWordbooks();
  }

  async function handleExportCsv(id: number, name: string) {
    try {
      const csv = await exportWordbookCsv(id);
      if (process.env.EXPO_OS === 'web') {
        downloadTextOnWeb(csv, `${name}_单词表.csv`, 'text/csv');
      } else {
        const path = FileSystem.cacheDirectory + `${name}_单词表.csv`;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: '导出词本' });
      }
    } catch (e: any) {
      // silent
    }
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      {/* 顶部操作栏 */}
      <View className="px-5 py-3 flex-row items-center gap-3">
        <Pressable onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
        </Pressable>
        <Text className={`text-base font-bold flex-1 ${textColor}`}>词本管理</Text>
        <Text className={`text-sm ${subText}`}>共 {wordbooks.length} 个</Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => router.push('/wordbook/import')}
            className={`px-3 py-2 rounded-xl border flex-row items-center gap-1 ${isDark ? 'bg-[#2A2A2A] border-[#444]' : 'bg-white border-gray-200'}`}
          >
            <Ionicons name="cloud-upload-outline" size={14} color={isDark ? '#aaa' : '#666'} />
            <Text className={`text-xs font-medium ${subText}`}>导入</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowCreate(true)}
            className="bg-[#2C5F8A] px-3 py-2 rounded-xl flex-row items-center gap-1"
          >
            <Ionicons name="add" size={14} color="white" />
            <Text className="text-white text-xs font-semibold">新建</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2C5F8A" />
        </View>
      ) : wordbooks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="library-outline" size={64} color={isDark ? '#555' : '#ccc'} />
          <Text className={`text-base font-semibold mt-4 ${textColor}`}>还没有词本</Text>
          <Text className={`text-sm text-center mt-2 ${subText}`}>新建一个词本，或导入 TXT/CSV 文件开始学习</Text>
          <Pressable
            onPress={() => setShowCreate(true)}
            className="mt-6 bg-[#2C5F8A] px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-semibold">新建词本</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={wordbooks}
          keyExtractor={item => item.id.toString()}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => {
            const total = item.word_count || 0;
            const mastered = item.mastered_count || 0;
            const progress = total > 0 ? mastered / total : 0;
            const isExpanded = expandedId === item.id;

            return (
              <View
                className={`rounded-2xl border p-4 ${card}`}
                style={{ borderCurve: 'continuous', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.06)' }] }}
              >
                <View className="flex-row items-center justify-between">
                  <View style={{ flex: 1, marginRight: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CircularProgress pct={Math.round(progress * 100)} isDark={isDark} />
                    <View style={{ flex: 1 }}>
                      <Text className={`text-base font-semibold ${textColor}`}>{item.name}</Text>
                      <Text className={`text-xs mt-0.5 ${subText}`}>
                        共 {total} 词 · 已掌握 {mastered}
                      </Text>
                      <View className={`h-1 rounded-full mt-1.5 ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}>
                        <View className="h-1 rounded-full bg-[#2C5F8A]" style={{ width: `${Math.round(progress * 100)}%` }} />
                      </View>
                    </View>
                  </View>
                  <View className="flex-row gap-2 items-center">
                    <Pressable
                      onPress={() => router.push({ pathname: '/wordbook/[id]', params: { id: item.id, name: item.name } })}
                      className="bg-[#2C5F8A] px-3 py-2 rounded-xl"
                    >
                      <Text className="text-white text-xs font-semibold">学习</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setExpandedId(isExpanded ? null : item.id)}
                      className={`p-2 rounded-xl ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
                    >
                      <Ionicons name="ellipsis-horizontal" size={16} color={isDark ? '#aaa' : '#666'} />
                    </Pressable>
                  </View>
                </View>

                {isExpanded && (
                  <View className={`mt-3 pt-3 border-t flex-row gap-2 ${isDark ? 'border-[#444]' : 'border-gray-100'}`}>
                    <Pressable
                      onPress={() => { setEditItem(item); setEditName(item.name); setExpandedId(null); }}
                      className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1 ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}
                    >
                      <Ionicons name="create-outline" size={14} color={isDark ? '#aaa' : '#666'} />
                      <Text className={`text-xs font-medium ${subText}`}>编辑</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { handleExportCsv(item.id, item.name); setExpandedId(null); }}
                      className="flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1 bg-blue-50"
                    >
                      <Ionicons name="download-outline" size={14} color="#2C5F8A" />
                      <Text className="text-xs font-medium text-[#2C5F8A]">导出</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { handleDelete(item.id); }}
                      className="flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1 bg-red-50"
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      <Text className="text-xs font-medium text-red-500">删除</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* 新建词本弹窗 */}
      <Modal visible={showCreate} transparent animationType="fade">
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1 items-center justify-center px-8 bg-black/40">
          <View className="w-full rounded-2xl p-6" style={{ backgroundColor: modalBg }}>
            <Text className={`text-lg font-bold mb-4 ${textColor}`}>新建词本</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="词本名称（如：托福词汇）"
              placeholderTextColor={isDark ? '#666' : '#aaa'}
              className={`rounded-xl px-4 py-3 text-sm mb-4 ${inputBg}`}
              autoFocus
              onSubmitEditing={handleCreate}
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => { setShowCreate(false); setNewName(''); }}
                className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}
              >
                <Text className={`font-semibold text-sm ${subText}`}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]"
              >
                <Text className="text-white font-semibold text-sm">创建</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 编辑词本弹窗 */}
      <Modal visible={!!editItem} transparent animationType="fade">
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1 items-center justify-center px-8 bg-black/40">
          <View className="w-full rounded-2xl p-6" style={{ backgroundColor: modalBg }}>
            <Text className={`text-lg font-bold mb-4 ${textColor}`}>编辑词本</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="词本名称"
              placeholderTextColor={isDark ? '#666' : '#aaa'}
              className={`rounded-xl px-4 py-3 text-sm mb-4 ${inputBg}`}
              autoFocus
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setEditItem(null)}
                className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}
              >
                <Text className={`font-semibold text-sm ${subText}`}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleEdit}
                className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]"
              >
                <Text className="text-white font-semibold text-sm">保存</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
