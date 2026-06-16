/**
 * 备份与恢复页
 */
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { exportDatabaseBackup, importDatabaseBackup, addLog, getBackupSummary, type BackupSummary } from '@/lib/database';
import { fetch } from 'expo/fetch';

// Web 环境：用 Blob + <a> 触发文件下载（绕开 expo-file-system 的 OPFS 依赖）
function downloadJsonOnWeb(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type BackupMethod = 'local' | 'webdav' | 'smb';

export default function BackupScreen() {
  const router = useRouter();
  const { isDark } = useAppContext();

  const [method, setMethod] = useState<BackupMethod>('local');
  const [webdavUrl, setWebdavUrl] = useState('');
  const [webdavUser, setWebdavUser] = useState('');
  const [webdavPass, setWebdavPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [summary, setSummary] = useState<BackupSummary | null>(null);

  // 页面加载时查询各表数据量，让用户一眼看到"将备份哪些数据"
  useEffect(() => {
    getBackupSummary().then(setSummary).catch(() => {});
  }, []);

  const bg = isDark ? 'bg-[#1E1E1E]' : 'bg-[#F8F9FA]';
  const card = isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100';
  const textColor = isDark ? 'text-white' : 'text-[#1a2a3a]';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? '#333' : '#F3F4F6';
  const inputTextColor = isDark ? '#fff' : '#1a2a3a';

  function setStatus(msg: string, error = false) {
    setStatusMsg(msg);
    setIsError(error);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      if (method === 'webdav') {
        if (!webdavUrl.trim()) {
          setTestResult({ ok: false, msg: '请填写 WebDAV 地址' });
          return;
        }
        const url = webdavUrl.replace(/\/$/, '') + '/';
        const headers: Record<string, string> = { 'Content-Type': 'application/xml' };
        if (webdavUser) {
          headers['Authorization'] = 'Basic ' + btoa(`${webdavUser}:${webdavPass}`);
        }
        const res = await fetch(url, { method: 'PROPFIND', headers });
        if (res.ok || res.status === 207) {
          setTestResult({ ok: true, msg: 'WebDAV 连接成功（' + res.status + '）' });
        } else {
          setTestResult({ ok: false, msg: 'WebDAV 连接失败，状态码：' + res.status });
        }
      } else if (method === 'smb') {
        // SMB 无法直接在移动端测试，给出提示
        setTestResult({ ok: true, msg: 'SMB 协议测试：请确认网络已连接到同一局域网，并通过文件管理器验证访问权限。' });
      } else {
        setTestResult({ ok: true, msg: '本地存储可用' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: '连接失败：' + (e?.message ?? '网络异常，请检查地址和网络') });
    } finally {
      setTesting(false);
    }
  }

  async function handleBackup() {
    setLoading(true);
    setStatus('');
    try {
      // 1. 导出数据
      const data = await exportDatabaseBackup();
      const json = JSON.stringify(data, null, 2);
      const filename = `AI私塾备份_${new Date().toISOString().slice(0, 10)}.json`;
      // 备份内容摘要，用于成功提示
      const s = await getBackupSummary();
      const summaryLine = `词本${s.wordbooks}个·单词${s.words}条·题库${s.papers}套·题目${s.questions}道·记录${s.answers}条·统计${s.stats}天`;

      // ── Web 环境：直接 Blob 下载，完全绕开 FileSystem ──
      if (process.env.EXPO_OS === 'web') {
        if (method === 'webdav') {
          // WebDAV 走原有 PUT 逻辑
          if (!webdavUrl || !webdavUser) {
            setStatus('请填写 WebDAV 服务器地址和用户名', true);
            setLoading(false);
            return;
          }
          const headers = {
            Authorization: 'Basic ' + btoa(`${webdavUser}:${webdavPass}`),
            'Content-Type': 'application/json',
          };
          const uploadPath = webdavUrl.replace(/\/$/, '') + '/' + filename;
          const res = await fetch(uploadPath, { method: 'PUT', headers, body: json });
          if (!res.ok) throw new Error('上传失败，HTTP ' + res.status);
          setStatus(`✅ 备份已上传至 WebDAV\n文件：${filename}\n包含：${summaryLine}`);
          await addLog('info', 'WebDAV备份成功', filename).catch(() => {});
        } else {
          // Web 本地备份：触发文件下载
          downloadJsonOnWeb(json, filename);
          setStatus(`✅ 备份已下载\n文件：${filename}\n包含：${summaryLine}`);
          await addLog('info', 'Web本地备份成功', filename).catch(() => {});
        }
        return;
      }

      // ── Native（iOS / Android）环境 ──
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      const path = cacheDir + filename;

      // 2. 写入本地缓存
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });

      if (method === 'local') {
        // 3a. 尝试原生分享（iOS/Android 真机优先）
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(path, { dialogTitle: '保存备份文件', mimeType: 'application/json' });
          setStatus(`✅ 备份成功！请选择保存位置\n文件：${filename}\n包含：${summaryLine}`);
          await addLog('info', '本地备份成功', filename).catch(() => {});
        } else {
          // 3b. 原生分享不可用时，用 WebBrowser 打开文件
          await WebBrowser.openBrowserAsync(path);
          setStatus(`✅ 备份已生成：${filename}\n包含：${summaryLine}\n已在浏览器中打开，可长按另存`);
          await addLog('info', '本地备份成功（WebBrowser）', filename).catch(() => {});
        }
      } else if (method === 'webdav') {
        if (!webdavUrl || !webdavUser) {
          setStatus('请填写 WebDAV 服务器地址和用户名', true);
          setLoading(false);
          return;
        }
        const headers = {
          Authorization: 'Basic ' + btoa(`${webdavUser}:${webdavPass}`),
          'Content-Type': 'application/json',
        };
        const uploadPath = webdavUrl.replace(/\/$/, '') + '/' + filename;
        const res = await fetch(uploadPath, { method: 'PUT', headers, body: json });
        if (!res.ok) throw new Error('上传失败，HTTP ' + res.status);
        setStatus(`✅ 备份已上传至 WebDAV\n文件：${filename}`);
        await addLog('info', 'WebDAV备份成功', filename).catch(() => {});
      } else {
        setStatus('SMB 备份：备份文件已写入缓存目录，请手动复制到 SMB 网络共享目录');
      }
    } catch (e: any) {
      const msg = e?.message || '未知错误';
      await addLog('error', '备份失败', msg).catch(() => {});
      setStatus('❌ 备份失败：' + msg, true);
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    setShowRestoreConfirm(false);
    setLoading(true);
    setStatus('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) { setLoading(false); return; }
      const assetUri = result.assets[0].uri;
      // Web 上 FileSystem 不支持 blob URI，改用 fetch 读取
      const content = process.env.EXPO_OS === 'web'
        ? await (await fetch(assetUri)).text()
        : await FileSystem.readAsStringAsync(assetUri);
      const data = JSON.parse(content);
      await importDatabaseBackup(data);
      await addLog('info', '数据恢复成功', '').catch(() => {});
      setStatus('数据恢复成功！请重启应用以刷新数据');
    } catch (e: any) {
      await addLog('error', '数据恢复失败', e?.message || '').catch(() => {});
      setStatus('恢复失败：' + (e?.message || '备份文件格式错误'), true);
    } finally {
      setLoading(false);
    }
  }

  const METHODS: { value: BackupMethod; label: string; icon: any }[] = [
    { value: 'local', label: '本地备份', icon: 'phone-portrait-outline' },
    { value: 'webdav', label: 'WebDAV', icon: 'cloud-outline' },
    { value: 'smb', label: 'SMB', icon: 'server-outline' },
  ];

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
            <Text className={`text-xl font-bold ${textColor}`}>备份与恢复</Text>
          </View>
          <Text className={`text-lg font-bold mb-1 ${textColor}`}>备份与恢复</Text>
          <Text className={`text-sm mb-4 ${subText}`}>将学习数据（词本、题库、记录）导出备份，支持跨设备恢复</Text>

          {/* 备份内容预览卡片 —— 让用户一眼看清备份了哪些数据 */}
          <View className={`rounded-2xl border p-4 mb-5 ${isDark ? 'bg-[#2A2A2A] border-[#333]' : 'bg-white border-gray-100'}`} style={{ borderCurve: 'continuous' }}>
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="server-outline" size={16} color="#2C5F8A" />
              <Text className={`text-sm font-semibold ${textColor}`}>当前数据库内容</Text>
              <Text className={`text-xs ${subText}`}>（备份将包含以下全部数据）</Text>
            </View>
            {summary ? (
              <View className="flex-row flex-wrap gap-x-4 gap-y-2">
                {[
                  { icon: 'book-outline',        label: '词本',   val: summary.wordbooks },
                  { icon: 'text-outline',         label: '单词',   val: summary.words },
                  { icon: 'document-text-outline',label: '题库',   val: summary.papers },
                  { icon: 'help-circle-outline',  label: '题目',   val: summary.questions },
                  { icon: 'checkmark-done-outline',label: '答题记录',val: summary.answers },
                  { icon: 'bar-chart-outline',    label: '学习天数',val: summary.stats },
                  { icon: 'chatbubble-outline',   label: '自定义格言',val: summary.mottos },
                ].map(item => (
                  <View key={item.label} className="flex-row items-center gap-1.5" style={{ minWidth: '44%' }}>
                    <Ionicons name={item.icon as any} size={13} color={isDark ? '#666' : '#aaa'} />
                    <Text className={`text-xs ${subText}`}>{item.label}</Text>
                    <Text className={`text-xs font-semibold ${item.val > 0 ? 'text-[#2C5F8A]' : (isDark ? 'text-gray-600' : 'text-gray-300')}`}>
                      {item.val}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#2C5F8A" />
                <Text className={`text-xs ${subText}`}>统计中...</Text>
              </View>
            )}
          </View>

          {/* 备份方式 */}
          <Text className={`text-sm font-medium mb-2 ${textColor}`}>备份方式</Text>
          <View className="flex-row gap-2 mb-5">
            {METHODS.map(m => (
              <Pressable
                key={m.value}
                onPress={() => setMethod(m.value)}
                className={`flex-1 py-3 rounded-xl items-center gap-1 border ${method === m.value ? 'bg-[#2C5F8A] border-[#2C5F8A]' : card}`}
              >
                <Ionicons name={m.icon} size={18} color={method === m.value ? 'white' : (isDark ? '#888' : '#666')} />
                <Text className={`text-xs font-medium ${method === m.value ? 'text-white' : subText}`}>{m.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* WebDAV 表单 */}
          {method === 'webdav' && (
            <View className="mb-5">
              {[
                { key: 'url', label: 'WebDAV 地址', placeholder: 'https://dav.example.com', val: webdavUrl, set: setWebdavUrl },
                { key: 'user', label: '用户名', placeholder: 'username', val: webdavUser, set: setWebdavUser },
                { key: 'pass', label: '密码', placeholder: '••••••', val: webdavPass, set: setWebdavPass, secure: true },
              ].map(f => (
                <View key={f.key} className="mb-3">
                  <Text className={`text-sm font-medium mb-1.5 ${textColor}`}>{f.label}</Text>
                  <TextInput
                    value={f.val}
                    onChangeText={f.set}
                    placeholder={f.placeholder}
                    placeholderTextColor={isDark ? '#555' : '#aaa'}
                    secureTextEntry={f.secure}
                    autoCapitalize="none"
                    style={{ backgroundColor: inputBg, color: inputTextColor, borderRadius: 12, padding: 12, fontSize: 14 }}
                  />
                </View>
              ))}
            </View>
          )}

          {method === 'smb' && (
            <View className={`rounded-xl p-3 mb-5 ${isDark ? 'bg-[#2A2A2A] border border-[#444]' : 'bg-gray-50 border border-gray-200'}`}>
              <Text className={`text-xs leading-5 ${subText}`}>
                SMB 备份说明：请先使用「本地备份」生成备份文件，然后通过手机的文件管理器将文件复制到 SMB 网络共享目录。
              </Text>
            </View>
          )}

          {/* 测试连接按钮 */}
          {(method === 'webdav' || method === 'smb') && (
            <>
              <Pressable
                onPress={handleTestConnection}
                disabled={testing || loading}
                className={`py-3 rounded-xl items-center border mb-3 ${
                  testResult?.ok === true
                    ? (isDark ? 'border-green-700 bg-green-950/40' : 'border-green-400 bg-green-50')
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
                      size={16}
                      color={testResult?.ok === true ? '#22C55E' : testResult?.ok === false ? '#EF4444' : (isDark ? '#aaa' : '#555')}
                    />
                    <Text className={`font-medium text-sm ${
                      testResult?.ok === true ? 'text-green-500' : testResult?.ok === false ? 'text-red-500' : textColor
                    }`}>
                      {testResult?.ok === true ? '连接成功' : testResult?.ok === false ? '连接失败' : '测试连接'}
                    </Text>
                  </View>
                )}
              </Pressable>
              {testResult && (
                <View className={`rounded-xl p-3 mb-3 ${testResult.ok
                  ? (isDark ? 'bg-green-950 border border-green-800' : 'bg-green-50 border border-green-200')
                  : (isDark ? 'bg-red-950 border border-red-800' : 'bg-red-50 border border-red-200')
                }`}>
                  <Text className={`text-xs ${testResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                    {testResult.msg}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* 操作按钮 */}
          <Pressable
            onPress={handleBackup}
            disabled={loading}
            className={`py-4 rounded-xl items-center mb-3 ${loading ? (isDark ? 'bg-[#333]' : 'bg-gray-200') : 'bg-[#2C5F8A]'}`}
          >
            {loading
              ? <View className="flex-row items-center gap-2"><ActivityIndicator size="small" color="#aaa" /><Text className={`font-semibold ${subText}`}>正在备份...</Text></View>
              : <View className="flex-row items-center gap-2"><Ionicons name="cloud-upload-outline" size={16} color="white" /><Text className="text-white font-semibold">立即备份</Text></View>
            }
          </Pressable>

          {/* 备份结果提示 —— 紧跟按钮下方，字号更大、更显眼 */}
          {statusMsg ? (
            <View className={`rounded-xl p-4 mb-3 border ${isError
              ? (isDark ? 'bg-red-950 border-red-800' : 'bg-red-50 border-red-200')
              : (isDark ? 'bg-green-950 border-green-800' : 'bg-green-50 border-green-200')
            }`}>
              <Text className={`text-sm font-medium leading-5 ${isError ? 'text-red-500' : 'text-green-600'}`}>
                {statusMsg}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => setShowRestoreConfirm(true)}
            disabled={loading}
            className={`py-4 rounded-xl items-center border ${isDark ? 'border-[#444] bg-[#2A2A2A]' : 'border-gray-200 bg-white'}`}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="cloud-download-outline" size={16} color={isDark ? '#aaa' : '#666'} />
              <Text className={`font-semibold ${subText}`}>从备份恢复</Text>
            </View>
          </Pressable>

          <Text className={`text-xs text-center mt-4 ${subText}`}>⚠ 恢复操作将覆盖当前所有数据，请谨慎操作</Text>

          {/* 确认弹窗 - 用内联方式代替Alert */}
          {showRestoreConfirm && (
            <View className={`mt-4 rounded-2xl border p-4 ${isDark ? 'bg-red-950 border-red-800' : 'bg-red-50 border-red-200'}`}>
              <Text className="text-red-500 font-semibold text-sm mb-2">⚠ 确认恢复备份？</Text>
              <Text className="text-red-400 text-xs mb-4">恢复操作将覆盖当前所有数据，此操作不可撤销！</Text>
              <View className="flex-row gap-3">
                <Pressable onPress={() => setShowRestoreConfirm(false)} className={`flex-1 py-2 rounded-xl items-center ${isDark ? 'bg-[#333]' : 'bg-gray-100'}`}>
                  <Text className={`font-medium text-sm ${subText}`}>取消</Text>
                </Pressable>
                <Pressable onPress={handleRestore} className="flex-1 py-2 rounded-xl items-center bg-red-500">
                  <Text className="text-white font-semibold text-sm">确认恢复</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
