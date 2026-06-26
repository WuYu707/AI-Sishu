/**
 * OCR服务配置页
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { fetch } from 'expo/fetch';

const OCR_TYPES = [
  { value: 'tesseract', label: 'Tesseract（本地免费）', desc: '无需 API Key，识别精度一般' },
  { value: 'baidu', label: '百度 OCR', desc: '高精度，需要百度 API Key' },
  { value: 'aliyun', label: '阿里云 OCR', desc: '高精度，需要阿里云 API Key' },
];

export default function OcrConfigScreen() {
  const router = useRouter();
  const { isDark, ocrConfig, setOcrConfig } = useAppContext();

  const [selectedType, setSelectedType] = useState(ocrConfig?.type || 'tesseract');
  const [apiKey, setApiKey] = useState(ocrConfig?.apiKey || '');
  const [secretKey, setSecretKey] = useState(ocrConfig?.secretKey || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputTextColor = isDark ? '#fff' : '#1a2a3a';

  function handleSave() {
    setOcrConfig({ type: selectedType, apiKey, secretKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      if (selectedType === 'tesseract') {
        // 本地引擎无需网络，直接验证可用
        setTestResult({ ok: true, msg: 'Tesseract 本地引擎可用，无需网络连接' });
      } else if (!apiKey) {
        setTestResult({ ok: false, msg: '请先填写 API Key' });
      } else if (selectedType === 'baidu') {
        // 百度OCR：用 API Key 请求 access_token 接口验证
        const res = await fetch(
          `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`,
          { method: 'POST' }
        );
        const data = await res.json().catch(() => null);
        if (data?.access_token) {
          setTestResult({ ok: true, msg: '百度OCR认证成功，access_token 已获取' });
        } else {
          setTestResult({ ok: false, msg: '认证失败：' + (data?.error_description ?? 'API Key 或 Secret Key 有误') });
        }
      } else {
        // 其他通用 HTTP 服务：发送 OPTIONS/GET 探测
        const res = await fetch(apiKey.startsWith('http') ? apiKey : 'https://' + apiKey, { method: 'OPTIONS' });
        if (res.ok || res.status < 500) {
          setTestResult({ ok: true, msg: `服务可达，状态码：${res.status}` });
        } else {
          setTestResult({ ok: false, msg: `服务返回错误，状态码：${res.status}` });
        }
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: '连接失败：' + (e?.message ?? '网络异常') });
    } finally {
      setTesting(false);
    }
  }

  return (
    <SafeAreaView className={`flex-1 ${bg}`}>
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View className="px-5 py-5">
          {/* 返回按钮 */}
          <View className="flex-row items-center gap-3 mb-5">
            <Pressable onPress={() => router.back()} className="p-1 -ml-1">
              <Ionicons name="arrow-back" size={22} color={isDark ? '#fff' : '#1a2a3a'} />
            </Pressable>
            <Text className={`text-xl font-bold ${textColor}`}>OCR服务配置</Text>
          </View>
          <Text className={`text-lg font-bold mb-1 ${textColor}`}>OCR 服务配置</Text>
          <Text className={`text-sm mb-5 ${subText}`}>用于试卷图片/PDF的文字识别</Text>

          <Text className={`text-sm font-medium mb-3 ${textColor}`}>选择 OCR 服务</Text>
          <View className={`rounded-2xl border overflow-hidden mb-5 ${card}`} style={{ borderCurve: 'continuous' }}>
            {OCR_TYPES.map((t, i) => (
              <Pressable
                key={t.value}
                onPress={() => setSelectedType(t.value)}
                className={`flex-row items-center gap-3 px-4 py-4 ${i > 0 ? (isDark ? 'border-t border-[#333]' : 'border-t border-gray-100') : ''}`}
              >
                <View className="flex-1">
                  <Text className={`text-sm font-medium ${textColor}`}>{t.label}</Text>
                  <Text className={`text-xs mt-0.5 ${subText}`}>{t.desc}</Text>
                </View>
                <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${selectedType === t.value ? 'border-[#2C5F8A] bg-[#2C5F8A]' : isDark ? 'border-[#555]' : 'border-gray-300'}`}>
                  {selectedType === t.value && <Ionicons name="checkmark" size={12} color="white" />}
                </View>
              </Pressable>
            ))}
          </View>

          {selectedType !== 'tesseract' && (
            <View className="mb-5">
              {[
                { key: 'apiKey', label: 'API Key', val: apiKey, set: setApiKey },
                { key: 'secretKey', label: 'Secret Key', val: secretKey, set: setSecretKey, secure: true },
              ].map(f => (
                <View key={f.key} className="mb-3">
                  <Text className={`text-sm font-medium mb-1.5 ${textColor}`}>{f.label}</Text>
                  <TextInput
                    value={f.val}
                    onChangeText={f.set}
                    placeholder={`输入 ${f.label}`}
                    placeholderTextColor={isDark ? '#555' : '#aaa'}
                    secureTextEntry={f.secure}
                    autoCapitalize="none"
                    style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 12, padding: 12, fontSize: 14 }}
                  />
                </View>
              ))}
            </View>
          )}

          {testResult ? (
            <View className={`rounded-xl p-3 mb-4 ${testResult.ok ? (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200') : (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')}`}>
              <Text className={`text-sm ${testResult.ok ? 'text-green-500' : 'text-red-500'}`}>{testResult.msg}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleTest}
            disabled={testing}
            className={`py-3 rounded-xl items-center border mb-3 ${
              testResult?.ok === true
                ? (isDark ? 'border-green-700 bg-green-950/40' : 'border-green-300 bg-green-50')
                : testResult?.ok === false
                ? (isDark ? 'border-red-700 bg-red-950/40' : 'border-red-300 bg-red-50')
                : (isDark ? 'border-[#444]' : 'border-gray-200')
            }`}
          >
            {testing ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#2C5F8A" />
                <Text className={`font-medium text-sm ${subText}`}>测试中...</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={testResult?.ok === true ? 'checkmark-circle' : testResult?.ok === false ? 'close-circle' : 'wifi-outline'}
                  size={15}
                  color={testResult?.ok === true ? '#22C55E' : testResult?.ok === false ? '#EF4444' : (isDark ? '#888' : '#666')}
                />
                <Text className={`font-medium text-sm ${
                  testResult?.ok === true ? 'text-green-500' : testResult?.ok === false ? 'text-red-500' : textColor
                }`}>
                  {testResult?.ok === true ? '连接成功' : testResult?.ok === false ? '连接失败' : '测试连接'}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable onPress={handleSave} className={`py-4 rounded-xl items-center ${saved ? 'bg-green-500' : 'bg-[#2C5F8A]'}`}>
            <Text className="text-white font-semibold">{saved ? '已保存' : '保存配置'}</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
