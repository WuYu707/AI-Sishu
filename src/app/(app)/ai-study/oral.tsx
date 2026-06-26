/**
 * 口语陪练页 - 跟读评测 + 自由对话（录音→语音识别→AI→TTS）
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { fetch } from 'expo/fetch';
import { useAppContext } from '@/lib/AppContext';
import { correctGrammar, callAI, type AiMessage } from '@/lib/aiService';
import { supabase } from '@/client/supabase';

const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

const PRESET_SENTENCES = [
  { text: 'The weather is beautiful today.', translation: '今天天气真好。', level: '初级' },
  { text: 'I would like to make a reservation for two people.', translation: '我想为两个人预订。', level: '中级' },
  { text: 'What are your plans for the weekend?', translation: '你周末有什么计划？', level: '初级' },
  { text: 'Could you please explain the terms and conditions of this contract?', translation: '能否请您解释一下这份合同的条款和条件？', level: '高级' },
  { text: 'Technology has profoundly transformed the way we communicate and learn.', translation: '技术深刻改变了我们交流和学习的方式。', level: '高级' },
  { text: 'The research findings suggest a significant correlation between exercise and mental health.', translation: '研究结果表明运动与心理健康之间存在显著相关性。', level: '高级' },
];

const CHAT_TOPICS = [
  { key: 'daily', label: '日常聊天', prompt: '你是一位友好的英语对话伙伴，进行轻松的日常话题对话。用简单自然的英语回复，并在末尾附上中文翻译。' },
  { key: 'travel', label: '旅行场景', prompt: '你是一位旅行场景英语对话练习助手。模拟旅行中的场景（订房、问路、购票等），用自然英语对话，并在末尾附上中文翻译。' },
  { key: 'shopping', label: '购物对话', prompt: '你是一位购物场景英语对话练习助手。模拟购物场景（询价、选购、结账等），用自然英语对话，并在末尾附上中文翻译。' },
  { key: 'interview', label: '面试英语', prompt: '你是一位专业的英语面试练习助手。模拟职场英语面试场景，给出面试官式的问题和专业反馈，并在末尾附上中文翻译。' },
  { key: 'restaurant', label: '餐厅点餐', prompt: '你是一位餐厅服务员角色扮演助手。模拟餐厅点餐场景：问候、推荐菜品、点餐、用餐反馈、结账等。用自然英语对话，并在末尾附上中文翻译。' },
  { key: 'doctor', label: '看医生', prompt: '你是一位医生角色扮演助手。模拟看医生场景：描述症状、医生询问、诊断建议、开药等。用自然英语对话，并在末尾附上中文翻译。' },
  { key: 'hotel', label: '酒店入住', prompt: '你是一位酒店前台角色扮演助手。模拟酒店入住场景：预订确认、办理入住、询问设施、退房等。用自然英语对话，并在末尾附上中文翻译。' },
  { key: 'airport', label: '机场出行', prompt: '你是一位机场工作人员角色扮演助手。模拟机场场景：值机、安检、登机、延误处理、行李查询等。用自然英语对话，并在末尾附上中文翻译。' },
];

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function OralScreen() {
  const router = useRouter();
  const { isDark, activeAiConfig } = useAppContext();
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  // 模式切换：跟读评测 | 自由对话
  const [activeTab, setActiveTab] = useState<'eval' | 'chat'>('eval');

  // ── 跟读评测状态 ──
  const [selectedSentence, setSelectedSentence] = useState(PRESET_SENTENCES[0]);
  const [customSentence, setCustomSentence] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [evalLoading, setEvalLoading] = useState(false);
  const [transcript, setTranscript] = useState('');

  // ── 自由对话状态 ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatTopic, setChatTopic] = useState(CHAT_TOPICS[0]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // ── 共用录音状态 ──
  const [isRecording, setIsRecording] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#2A2A2A' : '#FFFFFF';

  const targetSentence = useCustom ? customSentence : selectedSentence.text;

  useEffect(() => {
    requestRecordingPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  // 停止 TTS + 清理录音计时器
  useEffect(() => {
    return () => {
      Speech.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    if (!hasPermission) { setErrorMsg('需要麦克风权限，请在设置中开启'); return; }
    setErrorMsg('');
    if (activeTab === 'eval') setTranscript('');
    Speech.stop();
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch (e: any) {
      setErrorMsg('录音启动失败：' + (e?.message || ''));
    }
  }

  async function stopRecordingAndRecognize(): Promise<string> {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setRecognizing(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('录音文件不存在');
      const fileResponse = await fetch(uri);
      const rawBuffer = await fileResponse.arrayBuffer();
      const len = rawBuffer.byteLength;
      const speech = arrayBufferToBase64(rawBuffer);
      const format = uri.endsWith('.webm') ? 'wav' : 'm4a';
      const { data, error } = await supabase.functions.invoke('short-speech-recognition', {
        body: { speech, len, format, rate: 16000, cuid: 'app-oral-user' },
      });
      if (error) throw error;
      if (data?.err_no !== 0) throw new Error(data?.err_msg || '语音识别失败');
      return data.result?.[0] ?? '';
    } catch (e: any) {
      setErrorMsg('语音识别失败：' + (e?.message || '请检查录音质量'));
      return '';
    } finally {
      setRecognizing(false);
    }
  }

  // ── 跟读评测：停止录音 ──
  async function stopRecordingEval() {
    const text = await stopRecordingAndRecognize();
    setTranscript(text);
  }

  // ── 自由对话：停止录音后直接发送给 AI ──
  async function stopRecordingChat() {
    const text = await stopRecordingAndRecognize();
    if (!text.trim()) return;
    await sendChatMessage(text);
  }

  // ── 自由对话：发送消息 ──
  async function sendChatMessage(userText: string) {
    const hasAi = !!activeAiConfig;
    if (!hasAi) { setErrorMsg('请先配置AI服务'); return; }
    setErrorMsg('');
    const userMsg: ChatMessage = { role: 'user', content: userText };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatLoading(true);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const systemPrompt = chatTopic.prompt;
      const aiMessages: AiMessage[] = [
        { role: 'system', content: systemPrompt },
        ...newHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];
      const res = await callAI(activeAiConfig, aiMessages, 600);
      if (!res.success) throw new Error(res.error || 'AI对话失败');
      const assistantMsg: ChatMessage = { role: 'assistant', content: res.text };
      setChatMessages(prev => [...prev, assistantMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 150);
      // TTS 朗读 AI 回复（取英文部分，即中文翻译前的内容）
      const englishPart = res.text.split('\n')[0].trim();
      if (englishPart) {
        setTtsPlaying(true);
        Speech.speak(englishPart, {
          language: 'en-US',
          rate: 0.9,
          onDone: () => setTtsPlaying(false),
          onError: () => setTtsPlaying(false),
        });
      }
    } catch (e: any) {
      setErrorMsg('AI对话失败：' + (e?.message || ''));
    } finally {
      setChatLoading(false);
    }
  }

  // ── 跟读评测提交 ──
  async function handleEvaluate() {
    if (!targetSentence.trim()) { setErrorMsg('请选择或输入目标句子'); return; }
    if (!transcript.trim()) { setErrorMsg('请先完成录音，获取识别结果'); return; }
    const hasAi = !!activeAiConfig;
    if (!hasAi) { setErrorMsg('请先配置AI服务'); return; }
    setErrorMsg(''); setEvalLoading(true); setFeedback('');
    try {
      const prompt = `请对比以下目标句子和用户的跟读内容，给出内容准确度评分（满分100），并提供具体改进建议和正确发音提示。\n目标句子：${targetSentence}\n用户跟读（语音识别结果）：${transcript}\n请用简洁清晰的格式输出：评分、主要差异、改进建议。`;
      const res = await correctGrammar(prompt, activeAiConfig);
      setFeedback(res);
    } catch (e: any) {
      setErrorMsg('AI评测失败：' + (e?.message || ''));
    } finally {
      setEvalLoading(false);
    }
  }

  const isRecordingOrRecognizing = isRecording || recognizing;

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      {/* 标题 + Tab 切换 */}
      <View className="px-5 pt-5 pb-3">
        <View className="flex-row items-center gap-3 mb-4">
          <Pressable onPress={() => router.back()} className="p-1 -ml-1">
            <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
          </Pressable>
          <Text className={`text-xl font-bold ${textColor}`}>口语陪练</Text>
          {hasPermission === false && (
            <View className="ml-auto flex-row items-center gap-1">
              <Ionicons name="mic-off-outline" size={14} color="#EF4444" />
              <Text className="text-red-500 text-xs">无麦克风权限</Text>
            </View>
          )}
        </View>
        <View className={`flex-row rounded-xl p-1 ${isDark ? 'bg-[#2A2A2A]' : 'bg-gray-100'}`}>
          {([['eval', '跟读评测'], ['chat', '自由对话']] as const).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => { setActiveTab(key); setErrorMsg(''); }}
              className={`flex-1 py-2 rounded-lg items-center ${activeTab === key ? 'bg-[#2C5F8A]' : ''}`}
            >
              <Text className={`text-sm font-medium ${activeTab === key ? 'text-white' : subText}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ══════════════ 跟读评测 Tab ══════════════ */}
      {activeTab === 'eval' && (
        <ScrollView className="flex-1" contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
          <View className="px-5 pb-8">
            <View className="flex-row gap-2 mb-4">
              {['预设句子', '自定义句子'].map((label, i) => (
                <Pressable
                  key={label}
                  onPress={() => setUseCustom(i === 1)}
                  className={`flex-1 py-2 rounded-xl items-center ${useCustom === (i === 1) ? 'bg-[#2C5F8A]' : isDark ? 'bg-[#2A2A2A] border border-[#444]' : 'bg-white border border-gray-200'}`}
                >
                  <Text className={`text-xs font-medium ${useCustom === (i === 1) ? 'text-white' : subText}`}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {!useCustom ? (
              <>
                <Text className={`text-sm font-medium mb-2 ${textColor}`}>选择句子</Text>
                {PRESET_SENTENCES.map((s, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setSelectedSentence(s)}
                    className={`rounded-xl border p-3 mb-2 ${selectedSentence.text === s.text ? 'bg-[#2C5F8A] border-[#2C5F8A]' : card}`}
                    style={{ borderCurve: 'continuous' }}
                  >
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.level === '初级' ? 'bg-green-100 text-green-600' : s.level === '中级' ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'}`}>{s.level}</Text>
                    </View>
                    <Text className={`text-sm font-medium ${selectedSentence.text === s.text ? 'text-white' : textColor}`}>{s.text}</Text>
                    <Text className={`text-xs mt-1 ${selectedSentence.text === s.text ? 'text-blue-200' : subText}`}>{s.translation}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <View className="mb-4">
                <Text className={`text-sm font-medium mb-2 ${textColor}`}>自定义句子</Text>
                <TextInput
                  value={customSentence}
                  onChangeText={setCustomSentence}
                  placeholder="输入您想练习的句子..."
                  placeholderTextColor={isDark ? '#555' : '#aaa'}
                  style={{ backgroundColor: inputBg, color: isDark ? '#fff' : '#1a2a3a', borderRadius: 12, padding: 12, fontSize: 14, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E7EB' }}
                  multiline
                />
              </View>
            )}

            {targetSentence ? (
              <View className={`rounded-xl border p-4 mb-5 ${card}`} style={{ borderCurve: 'continuous' }}>
                <Text className={`text-xs ${subText} mb-1`}>目标句子</Text>
                <Text className="text-lg font-semibold text-[#2C5F8A]">{targetSentence}</Text>
              </View>
            ) : null}

            <View className={`rounded-2xl border p-5 mb-4 items-center ${card}`} style={{ borderCurve: 'continuous' }}>
              <Text className={`text-sm font-medium mb-4 ${textColor}`}>点击麦克风开始录音</Text>
              <Pressable
                onPress={isRecording ? stopRecordingEval : startRecording}
                disabled={recognizing}
                style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: isRecording ? '#EF4444' : '#2C5F8A', alignItems: 'center', justifyContent: 'center' }}
              >
                {recognizing
                  ? <ActivityIndicator size="large" color="white" />
                  : <Ionicons name={isRecording ? 'stop' : 'mic'} size={36} color="white" />
                }
              </Pressable>
              <Text className={`text-xs mt-3 ${subText}`}>
                {recognizing ? '识别中...' : isRecording ? `录音中 ${recordSeconds}s（点击停止）` : '点击开始录音'}
              </Text>
              {transcript ? (
                <View className={`w-full mt-4 rounded-xl p-3 ${isDark ? 'bg-[#333]' : 'bg-gray-50'}`}>
                  <Text className={`text-xs ${subText} mb-1`}>语音识别结果</Text>
                  <Text className={`text-sm font-medium ${textColor}`}>{transcript}</Text>
                </View>
              ) : null}
              {!isRecording && !recognizing && (
                <TextInput
                  value={transcript}
                  onChangeText={setTranscript}
                  placeholder="识别结果将自动填入，也可手动输入..."
                  placeholderTextColor={isDark ? '#555' : '#bbb'}
                  multiline
                  style={{ color: isDark ? '#888' : '#999', fontSize: 11, textAlign: 'center', minWidth: 200, marginTop: 8 }}
                />
              )}
            </View>

            {errorMsg ? <Text className="text-red-500 text-xs mb-3">{errorMsg}</Text> : null}

            <Pressable
              onPress={handleEvaluate}
              disabled={evalLoading || !transcript.trim()}
              className={`py-4 rounded-xl items-center mb-5 ${evalLoading || !transcript.trim() ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#E67E22]'}`}
            >
              {evalLoading
                ? <View className="flex-row items-center gap-2"><ActivityIndicator size="small" color="#aaa" /><Text className={subText}>AI 评测中...</Text></View>
                : <View className="flex-row items-center gap-2"><Ionicons name="star-outline" size={16} color={transcript.trim() ? 'white' : (isDark ? '#666' : '#aaa')} /><Text className={transcript.trim() ? 'text-white font-semibold' : subText}>AI 评测发音</Text></View>
              }
            </Pressable>

            {feedback ? (
              <View className={`rounded-2xl border p-4 ${card}`} style={{ borderCurve: 'continuous' }}>
                <View className="flex-row items-center gap-2 mb-3">
                  <Ionicons name="star" size={18} color="#E67E22" />
                  <Text className={`text-sm font-bold ${textColor}`}>发音评测报告</Text>
                </View>
                <Text className={`text-sm leading-6 ${textColor}`}>{feedback}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      )}

      {/* ══════════════ 自由对话 Tab ══════════════ */}
      {activeTab === 'chat' && (
        <View className="flex-1">
          {/* 话题选择栏 */}
          <View className="px-5 pb-2">
            <Pressable
              onPress={() => setShowTopicPicker(p => !p)}
              className={`flex-row items-center justify-between rounded-xl border px-4 py-2.5 ${card}`}
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="chatbubbles-outline" size={16} color="#2C5F8A" />
                <Text className={`text-sm font-medium ${textColor}`}>{chatTopic.label}</Text>
              </View>
              <View className="flex-row items-center gap-2">
                {ttsPlaying && (
                  <View className="flex-row items-center gap-1 mr-1">
                    <ActivityIndicator size="small" color="#2C5F8A" />
                    <Text className="text-xs text-[#2C5F8A]">朗读中</Text>
                  </View>
                )}
                <Pressable onPress={() => { setChatMessages([]); setErrorMsg(''); }} className="mr-2">
                  <Text className="text-xs text-[#E67E22]">清空对话</Text>
                </Pressable>
                <Ionicons name={showTopicPicker ? 'chevron-up' : 'chevron-down'} size={14} color={isDark ? '#aaa' : '#666'} />
              </View>
            </Pressable>
            {showTopicPicker && (
              <View className={`rounded-xl border mt-1 overflow-hidden ${isDark ? 'bg-[#2A2A2A] border-[#444]' : 'bg-white border-gray-100'}`}>
                {CHAT_TOPICS.map(t => (
                  <Pressable
                    key={t.key}
                    onPress={() => { setChatTopic(t); setShowTopicPicker(false); setChatMessages([]); }}
                    className={`px-4 py-3 flex-row items-center gap-2 ${chatTopic.key === t.key ? 'bg-[#2C5F8A]' : ''}`}
                  >
                    <Text className={`text-sm ${chatTopic.key === t.key ? 'text-white font-semibold' : textColor}`}>{t.label}</Text>
                    {chatTopic.key === t.key && <Ionicons name="checkmark" size={14} color="white" />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* 对话历史 */}
          <ScrollView
            ref={chatScrollRef}
            className="flex-1 px-5"
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            {chatMessages.length === 0 ? (
              <View className="items-center py-12 gap-3">
                <Ionicons name="chatbubble-ellipses-outline" size={48} color={isDark ? '#444' : '#ddd'} />
                <Text className={`text-sm ${subText}`}>按住麦克风按钮开始对话</Text>
                <Text className={`text-xs ${subText}`}>当前主题：{chatTopic.label}</Text>
              </View>
            ) : (
              <View className="py-2 gap-3">
                {chatMessages.map((msg, i) => (
                  <View key={i} className={`flex-row ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <View
                      style={{ maxWidth: '80%', borderRadius: 16, padding: 12,
                        backgroundColor: msg.role === 'user' ? '#2C5F8A' : (isDark ? '#2A2A2A' : '#fff'),
                        borderWidth: msg.role === 'assistant' ? 1 : 0,
                        borderColor: isDark ? '#333' : '#E5E7EB',
                      }}
                    >
                      <Text style={{ color: msg.role === 'user' ? '#fff' : (isDark ? '#fff' : '#1a2a3a'), fontSize: 14, lineHeight: 20 }}>
                        {msg.content}
                      </Text>
                    </View>
                  </View>
                ))}
                {chatLoading && (
                  <View className="flex-row justify-start">
                    <View style={{ backgroundColor: isDark ? '#2A2A2A' : '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: isDark ? '#333' : '#E5E7EB' }}>
                      <ActivityIndicator size="small" color="#2C5F8A" />
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* 错误提示 */}
          {errorMsg ? <Text className="text-red-500 text-xs px-5 pb-1">{errorMsg}</Text> : null}

          {/* 录音按钮区 */}
          <View className={`px-5 py-4 items-center border-t ${isDark ? 'border-[#333]' : 'border-gray-100'}`}>
            <Text className={`text-xs mb-3 ${subText}`}>
              {isRecordingOrRecognizing
                ? (recognizing ? '识别中，请稍候...' : `录音中 ${recordSeconds}s，松开停止`)
                : '按住麦克风，说话后松开发送'}
            </Text>
            <Pressable
              onLongPress={() => { if (!isRecording && !recognizing && !chatLoading) startRecording(); }}
              onPressOut={isRecording ? stopRecordingChat : undefined}
              disabled={recognizing || chatLoading}
              style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: isRecording ? '#EF4444' : (recognizing || chatLoading ? '#94A3B8' : '#2C5F8A'),
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {recognizing || chatLoading
                ? <ActivityIndicator size="large" color="white" />
                : <Ionicons name={isRecording ? 'stop' : 'mic'} size={32} color="white" />
              }
            </Pressable>
            <Text className={`text-xs mt-2 ${subText}`}>长按录音 · 松开发送</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
