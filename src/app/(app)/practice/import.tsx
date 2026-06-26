/**
 * 试题导入页 - 文件上传 + OCR识别 + AI解析题目 + 手动编辑器
 * 支持：图片(OCR)、TXT、PDF、Word(.docx)
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { fetch } from 'expo/fetch';
import { useAppContext } from '@/lib/AppContext';
import { createExamPaper, addQuestions } from '@/lib/database';
import { parseQuestionsFromText } from '@/lib/aiService';
import { supabase } from '@/client/supabase';

type QuestionType = 'single_choice' | 'multiple_choice' | 'fill_in_blank' | 'true_false' | 'short_answer';

interface TempQuestion {
  content: string;
  type: QuestionType;
  options: string[];
  answer: string;
  explanation: string;
}

const defaultQuestion = (): TempQuestion => ({
  content: '', type: 'single_choice', options: ['', '', '', ''], answer: '', explanation: '',
});

/** 将文件URI读为base64 */
async function readFileAsBase64(uri: string): Promise<string> {
  if (process.env.EXPO_OS === 'web') {
    const resp = await fetch(uri);
    const buf = await resp.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

/** 通过 accurate-ocr Edge Function 识别图片文字 */
async function callOcrViaEdgeFunction(base64Image: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('accurate-ocr', {
    body: { image: base64Image, language_type: 'CHN_ENG' },
  });
  if (error) {
    const msg = await error?.context?.text?.().catch(() => error.message);
    throw new Error(`OCR识别失败: ${msg || error.message}`);
  }
  const result = data as { words_result?: { words: string }[]; error_code?: number; error_msg?: string };
  if (result.error_code && result.error_code !== 0) throw new Error(`OCR错误: ${result.error_msg}`);
  return (result.words_result || []).map((r: { words: string }) => r.words).join('\n');
}

/** 通过 parse-document Edge Function 提取 PDF/DOCX 文本 */
async function callParseDocumentEdgeFunction(base64: string, type: 'pdf' | 'docx'): Promise<string> {
  const { data, error } = await supabase.functions.invoke('parse-document', {
    body: { file: base64, type },
  });
  if (error) {
    const msg = await error?.context?.text?.().catch(() => error.message);
    throw new Error(`文档解析失败: ${msg || error.message}`);
  }
  const result = data as { text?: string; error?: string };
  if (result.error) throw new Error(result.error);
  return result.text || '';
}

export default function PracticeImportScreen() {
  const router = useRouter();
  const { isDark, activeAiConfig } = useAppContext();

  const [step, setStep] = useState<'upload' | 'editing' | 'saving' | 'done'>('upload');
  const [paperTitle, setPaperTitle] = useState('');
  const [questions, setQuestions] = useState<TempQuestion[]>([defaultQuestion()]);
  const [processing, setProcessing] = useState(false);
  const [processStage, setProcessStage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showTitleModal, setShowTitleModal] = useState(false);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputText = isDark ? '#fff' : '#1a2a3a';
  const modalBg = isDark ? '#2A2A2A' : '#FFFFFF';

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'application/octet-stream',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const name = (asset.name || '未命名试卷').replace(/\.[^.]+$/, '');
      setPaperTitle(name);
      setErrorMsg('');

      if (!activeAiConfig) {
        setErrorMsg('未配置 AI 服务，进入手动编辑模式');
        setStep('editing');
        return;
      }

      setProcessing(true);
      try {
        let ocrText = '';
        const fileName = asset.name || '';
        const mime = asset.mimeType || '';
        const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|bmp|gif|webp)$/i.test(fileName);
        const isText = mime === 'text/plain' || /\.txt$/i.test(fileName);
        const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(fileName);
        const isDocx = mime.includes('wordprocessingml') || mime === 'application/msword'
          || /\.(docx|doc)$/i.test(fileName);

        if (isText) {
          setProcessStage('读取文本文件...');
          if (process.env.EXPO_OS === 'web') {
            ocrText = await (await fetch(asset.uri)).text();
          } else {
            ocrText = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
          }
        } else if (isImage) {
          setProcessStage('OCR识别图片文字...');
          const base64 = await readFileAsBase64(asset.uri);
          ocrText = await callOcrViaEdgeFunction(base64);
        } else if (isPdf) {
          setProcessStage('解析PDF文本内容...');
          const base64 = await readFileAsBase64(asset.uri);
          ocrText = await callParseDocumentEdgeFunction(base64, 'pdf');
        } else if (isDocx) {
          setProcessStage('解析Word文档内容...');
          const base64 = await readFileAsBase64(asset.uri);
          ocrText = await callParseDocumentEdgeFunction(base64, 'docx');
        } else {
          setErrorMsg('不支持的文件格式，请使用 图片/TXT/PDF/Word(.docx) 格式');
          setStep('editing');
          setProcessing(false);
          return;
        }

        if (!ocrText.trim()) {
          setErrorMsg('文件内容为空或无法提取文本，请手动添加题目');
          setStep('editing');
          setProcessing(false);
          return;
        }

        setProcessStage('AI解析题目...');
        const parsed = await parseQuestionsFromText(ocrText, activeAiConfig);
        if (parsed.length > 0) {
          setQuestions(parsed.map(p => ({
            content: p.content || '',
            type: (p.type as QuestionType) || 'single_choice',
            options: Array.isArray(p.options) ? p.options : ['', '', '', ''],
            answer: p.answer || '',
            explanation: p.explanation || '',
          })));
          setErrorMsg(`✅ AI 成功解析 ${parsed.length} 道题目，请检查并确认`);
        } else {
          setErrorMsg('AI未能解析出题目，已进入手动编辑模式');
        }
        setStep('editing');
      } catch (e: unknown) {
        setErrorMsg('识别失败，已进入手动编辑：' + ((e as Error)?.message || ''));
        setStep('editing');
      } finally {
        setProcessing(false);
        setProcessStage('');
      }
    } catch (e: unknown) {
      setErrorMsg('文件选择失败：' + ((e as Error)?.message || ''));
    }
  }

  function handleAddQuestion() {
    setQuestions(prev => [...prev, defaultQuestion()]);
  }

  function handleRemoveQuestion(idx: number) {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx: number, patch: Partial<TempQuestion>) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  }

  async function handleSave() {
    const validQs = questions.filter(q => q.content.trim());
    if (validQs.length === 0) { setErrorMsg('请至少添加一道题目'); return; }
    if (!paperTitle.trim()) { setShowTitleModal(true); return; }
    setStep('saving');
    try {
      const paperId = await createExamPaper(paperTitle.trim());
      await addQuestions(paperId, validQs.map((q, i) => ({
        content: q.content, type: q.type as any,
        options: JSON.stringify(q.options.filter(Boolean)),
        answer: q.answer, explanation: q.explanation, sort_order: i,
      })));
      setStep('done');
    } catch (e: any) {
      setErrorMsg('保存失败：' + (e?.message || ''));
      setStep('editing');
    }
  }

  const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
    { value: 'single_choice', label: '单选题' },
    { value: 'multiple_choice', label: '多选题' },
    { value: 'fill_in_blank', label: '填空题' },
    { value: 'true_false', label: '判断题' },
    { value: 'short_answer', label: '简答题' },
  ];

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

      {step === 'upload' && (
        <ScrollView contentInsetAdjustmentBehavior="automatic">
          <View className="px-5 py-5">
            <View className="flex-row items-center gap-3 mb-5">
              <Pressable onPress={() => router.back()} className="p-1 -ml-1">
                <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
              </Pressable>
              <Text className={`text-xl font-bold ${textColor}`}>导入试题</Text>
            </View>
            <Text className={`text-sm mb-6 ${subText}`}>上传试卷文件，自动 OCR+AI 解析题目；或手动创建题库</Text>

            {processing ? (
              <View className="items-center py-12">
                <ActivityIndicator size="large" color="#2C5F8A" />
                <Text className={`text-sm mt-4 ${textColor}`}>{processStage || 'AI 正在识别...'}</Text>
                <Text className={`text-xs mt-2 ${subText}`}>这可能需要几十秒，请耐心等待</Text>
              </View>
            ) : (
              <>
                {/* 文件识别支持说明 */}
                <View className={`rounded-xl p-3 mb-4 flex-row gap-2 ${isDark ? 'bg-blue-950 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
                  <Ionicons name="document-text-outline" size={16} color="#2C5F8A" />
                  <Text className={`flex-1 text-xs text-[#2C5F8A]`}>
                    支持 图片（自动OCR）、PDF（文本提取）、Word(.docx)（文本提取）、TXT 四种格式
                  </Text>
                </View>

                <Pressable
                  onPress={handlePickFile}
                  className={`rounded-2xl border-2 border-dashed p-8 items-center mb-4 ${isDark ? 'border-[#444]' : 'border-gray-300'}`}
                >
                  <Ionicons name="cloud-upload-outline" size={40} color={isDark ? '#555' : '#ccc'} />
                  <Text className={`text-base font-medium mt-3 ${textColor}`}>上传试卷文件</Text>
                  <Text className={`text-sm mt-1 ${subText}`}>支持 图片 / TXT / PDF / Word(.docx)</Text>
                  <Text className={`text-xs mt-2 text-[#2C5F8A]`}>自动文字提取 + AI 解析题目 →</Text>
                </Pressable>

                {errorMsg ? <Text className="text-red-500 text-xs mb-3">{errorMsg}</Text> : null}
                <View className={`h-px mb-4 ${isDark ? 'bg-[#333]' : 'bg-gray-200'}`} />
                <Pressable
                  onPress={() => setStep('editing')}
                  className={`py-4 rounded-xl items-center border ${isDark ? 'border-[#444] bg-[#2A2A2A]' : 'border-gray-200 bg-white'}`}
                >
                  <Text className={`font-semibold ${textColor}`}>手动创建题库</Text>
                  <Text className={`text-xs mt-1 ${subText}`}>直接输入题目和选项</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      )}

      {step === 'editing' && (
        <View className="flex-1">
          <View className={`px-5 py-3 flex-row items-center justify-between border-b ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
            <Text className={`text-sm font-medium ${textColor}`}>共 {questions.length} 题</Text>
            <View className="flex-row gap-2">
              <Pressable onPress={handleAddQuestion} className="bg-[#2C5F8A] px-3 py-1.5 rounded-lg flex-row items-center gap-1">
                <Ionicons name="add" size={14} color="white" />
                <Text className="text-white text-xs font-semibold">添加题目</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (!paperTitle.trim()) setShowTitleModal(true); else handleSave(); }}
                className="bg-green-600 px-3 py-1.5 rounded-lg"
              >
                <Text className="text-white text-xs font-semibold">保存</Text>
              </Pressable>
            </View>
          </View>

          {errorMsg ? (
            <View className={`mx-5 mt-2 rounded-lg p-2 ${errorMsg.startsWith('✅') ? (isDark ? 'bg-green-950' : 'bg-green-50') : (isDark ? 'bg-red-950' : 'bg-red-50')}`}>
              <Text className={`text-xs ${errorMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{errorMsg}</Text>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, paddingTop: 12 }} keyboardShouldPersistTaps="handled">
            {questions.map((q, idx) => (
              <View key={idx} className={`rounded-2xl border p-4 mb-3 ${card}`} style={{ borderCurve: 'continuous' }}>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className={`text-xs font-bold ${textColor}`}>第 {idx + 1} 题</Text>
                  <Pressable onPress={() => handleRemoveQuestion(idx)}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                  <View className="flex-row gap-2">
                    {QUESTION_TYPES.map(t => (
                      <Pressable
                        key={t.value}
                        onPress={() => updateQuestion(idx, { type: t.value })}
                        className={`px-3 py-1 rounded-full ${q.type === t.value ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#444]' : 'bg-gray-100'}`}
                      >
                        <Text className={`text-xs font-medium ${q.type === t.value ? 'text-white' : subText}`}>{t.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <TextInput
                  value={q.content}
                  onChangeText={v => updateQuestion(idx, { content: v })}
                  placeholder="题目内容..."
                  placeholderTextColor={isDark ? '#555' : '#aaa'}
                  multiline
                  style={{ backgroundColor: inputBg, color: inputText, borderRadius: 8, padding: 8, fontSize: 13, minHeight: 60, textAlignVertical: 'top', marginBottom: 8 }}
                />
                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                  q.options.map((opt, oi) => (
                    <View key={oi} className="flex-row items-center gap-2 mb-1">
                      <Text className={`text-xs font-bold w-5 ${subText}`}>{String.fromCharCode(65 + oi)}.</Text>
                      <TextInput
                        value={opt}
                        onChangeText={v => {
                          const opts = [...q.options];
                          opts[oi] = v;
                          updateQuestion(idx, { options: opts });
                        }}
                        placeholder={`选项 ${String.fromCharCode(65 + oi)}`}
                        placeholderTextColor={isDark ? '#555' : '#aaa'}
                        style={{ flex: 1, backgroundColor: inputBg, color: inputText, borderRadius: 8, padding: 6, fontSize: 12 }}
                      />
                    </View>
                  ))
                )}
                <View className="mt-2">
                  <Text className={`text-xs ${subText} mb-1`}>正确答案</Text>
                  <TextInput
                    value={q.answer}
                    onChangeText={v => updateQuestion(idx, { answer: v })}
                    placeholder="如：A 或 AB 或 正确"
                    placeholderTextColor={isDark ? '#555' : '#aaa'}
                    style={{ backgroundColor: inputBg, color: inputText, borderRadius: 8, padding: 8, fontSize: 13 }}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {step === 'saving' && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2C5F8A" />
          <Text className={`text-sm mt-4 ${textColor}`}>正在保存题库...</Text>
        </View>
      )}

      {step === 'done' && (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-full bg-green-100 items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
          </View>
          <Text className={`text-xl font-bold mb-2 ${textColor}`}>保存成功！</Text>
          <Text className={`text-sm text-center ${subText}`}>「{paperTitle}」已创建，共 {questions.filter(q => q.content).length} 道题目</Text>
          <Pressable onPress={() => router.push('/(app)/(tabs)/practice')} className="mt-8 bg-[#2C5F8A] px-8 py-4 rounded-xl">
            <Text className="text-white font-semibold">查看题库</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={showTitleModal} transparent animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="w-full rounded-2xl p-6" style={{ backgroundColor: modalBg }}>
            <Text className={`text-lg font-bold mb-4 ${textColor}`}>试卷命名</Text>
            <TextInput
              value={paperTitle}
              onChangeText={setPaperTitle}
              placeholder="如：2024年英语四级真题"
              placeholderTextColor={isDark ? '#666' : '#aaa'}
              style={{ backgroundColor: inputBg, color: inputText, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 16 }}
              autoFocus
            />
            <View className="flex-row gap-3">
              <Pressable onPress={() => setShowTitleModal(false)} className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-[#444]' : 'bg-gray-100'}`}>
                <Text className={`font-semibold ${subText}`}>取消</Text>
              </Pressable>
              <Pressable onPress={() => { setShowTitleModal(false); handleSave(); }} className="flex-1 py-3 rounded-xl items-center bg-[#2C5F8A]">
                <Text className="text-white font-semibold">确认</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
