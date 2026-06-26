/**
 * AI服务调用工具（在线API）
 * 所有AI调用统一通过此模块
 */
import { AiConfig, addLog } from '@/lib/database';
import { fetch } from 'expo/fetch';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiResponse {
  success: boolean;
  text: string;
  error?: string;
}

/** 将 AiConfig 转为统一的调用参数 */
function configToCallParams(cfg: AiConfig): { endpoint: string; model: string; apiKey: string } {
  const ep = cfg.endpoint.endsWith('/chat/completions')
    ? cfg.endpoint
    : cfg.endpoint.replace(/\/$/, '') + '/chat/completions';
  return { endpoint: ep, model: cfg.model, apiKey: cfg.api_key_enc };
}

/** 底层 HTTP 请求，调用任意 OpenAI 兼容端点 */
async function doFetch(
  endpoint: string,
  model: string,
  apiKey: string,
  messages: AiMessage[],
  maxTokens: number,
  label: string
): Promise<AiResponse> {
  try {
    const sanitized = messages.map(m => ({
      ...m,
      content: m.content
        .replace(/\b1[3-9]\d{9}\b/g, '***')
        .replace(/\b\d{18}\b/g, '***'),
    }));
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages: sanitized, max_tokens: maxTokens, temperature: 0.7 }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errText = '';
      try { errText = await response.text(); } catch { /* ignore */ }
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = data?.choices?.[0]?.message?.content || '';
    return { success: true, text };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? '请求超时（120秒），请检查网络或AI服务' : (e?.message || '网络错误');
    await addLog('error', `${label}调用失败`, e?.message || String(e)).catch(() => {});
    return { success: false, text: '', error: msg };
  }
}

/**
 * 从 AI 响应文本中稳健提取 JSON（数组或对象）
 */
function extractJsonArray(text: string): any[] | null {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { /* fall through */ }
  }
  const bracket = text.match(/\[[\s\S]*?\]/);
  if (bracket) {
    try { return JSON.parse(bracket[0]); } catch { /* fall through */ }
  }
  return null;
}

function extractJsonObject(text: string): any | null {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { /* fall through */ }
  }
  const brace = text.match(/\{[\s\S]*?\}/);
  if (brace) {
    try { return JSON.parse(brace[0]); } catch { /* fall through */ }
  }
  return null;
}

/**
 * 统一 AI 路由调用（仅在线）
 */
export async function callAI(
  onlineConfig: AiConfig | null,
  messages: AiMessage[],
  maxTokens: number = 1000
): Promise<AiResponse> {
  if (!onlineConfig) return { success: false, text: '', error: '请先配置 AI 服务' };
  const p = configToCallParams(onlineConfig);
  return doFetch(p.endpoint, p.model, p.apiKey, messages, maxTokens, '在线AI');
}

/**
 * 生成单词的音标、释义、例句（批量）
 */
export async function generateWordInfo(
  words: string[],
  config: AiConfig | null,
  targetLanguage: string = 'Chinese',
): Promise<{ word: string; phonetic: string; meaning: string; example: string }[]> {
  const prompt = `请为以下单词生成音标、中文释义和英文例句，以JSON数组格式返回，每项格式：{"word":"...","phonetic":"...","meaning":"...","example":"..."}。单词列表：${words.join(', ')}`;
  const res = await callAI(config, [
    { role: 'system', content: '你是一个专业的语言学习助手，只返回JSON格式，不要加任何其他内容。' },
    { role: 'user', content: prompt },
  ], 2000);

  if (!res.success) return words.map(w => ({ word: w, phonetic: '', meaning: '', example: '' }));

  try {
    const parsed = extractJsonArray(res.text);
    if (parsed) return parsed;
  } catch {}
  return words.map(w => ({ word: w, phonetic: '', meaning: '', example: '' }));
}

/**
 * 生成助记故事
 */
export async function generateMnemonicStory(
  word: string,
  meaning: string,
  config: AiConfig | null,
): Promise<string> {
  const res = await callAI(config, [
    { role: 'system', content: '你是一个创意语言学习助手，生成简短有趣的助记故事帮助记忆单词。' },
    { role: 'user', content: `请为单词"${word}"（意思：${meaning}）生成一个50字以内的有趣中文助记故事。` },
  ], 200);
  return res.success ? res.text : '暂时无法生成故事，请稍后重试。';
}

/**
 * 语法纠错
 */
export async function correctGrammar(
  text: string,
  config: AiConfig | null,
): Promise<string> {
  const res = await callAI(config, [
    { role: 'system', content: '你是一个专业的英语语法纠错助手，请用中文指出错误并给出修正建议。' },
    { role: 'user', content: `请检查以下文本的语法错误并提供纠正建议：\n\n${text}` },
  ], 500);
  return res.success ? res.text : `纠错失败：${res.error}`;
}

/**
 * 写作批改
 */
export async function correctWriting(
  text: string,
  config: AiConfig | null,
): Promise<string> {
  const res = await callAI(config, [
    { role: 'system', content: '你是一个专业的英语写作批改老师，从语法、用词、结构等方面提供详细批改意见，用中文回复。' },
    { role: 'user', content: `请批改以下写作内容：\n\n${text}` },
  ], 1500);
  return res.success ? res.text : `批改失败：${res.error}`;
}

/**
 * 生成相似题
 */
export async function generateSimilarQuestion(
  originalContent: string,
  originalAnswer: string,
  config: AiConfig | null,
): Promise<{ content: string; options: string[]; answer: string } | null> {
  const res = await callAI(config, [
    { role: 'system', content: '你是一个出题老师，根据原题生成一道类似的新题目，以JSON格式返回：{"content":"题目内容","options":["A.选项","B.选项","C.选项","D.选项"],"answer":"A"}' },
    { role: 'user', content: `原题：${originalContent}\n正确答案：${originalAnswer}\n请生成一道类似的新题目。` },
  ], 500);

  if (!res.success) return null;
  try {
    const parsed = extractJsonObject(res.text);
    if (parsed) return parsed;
  } catch {}
  return null;
}

/**
 * 从OCR文本中用AI解析题目
 */
export async function parseQuestionsFromText(
  ocrText: string,
  config: AiConfig | null,
): Promise<{ content: string; type: string; options: string[]; answer: string; explanation: string }[]> {
  const res = await callAI(config, [
    {
      role: 'system',
      content: '你是一个专业的试题解析助手。从给定文本中识别并提取所有题目，以JSON数组格式返回，每项格式：{"content":"题目内容","type":"single_choice|multiple_choice|fill_in_blank|true_false|short_answer","options":["A.内容","B.内容"],"answer":"A","explanation":"解析（若有）"}。只返回JSON数组，不要其他内容。',
    },
    { role: 'user', content: `请从以下文本中提取所有题目：\n\n${ocrText.slice(0, 4000)}` },
  ], 3000);

  if (!res.success) return [];
  try {
    const parsed = extractJsonArray(res.text);
    if (parsed) return parsed;
  } catch {}
  return [];
}

/**
 * AI动态复习推荐
 */
export async function getReviewRecommendation(
  words: { word: string; mastered: boolean; review_count: number }[],
  config: AiConfig | null,
): Promise<string[]> {
  const unmastered = words.filter(w => !w.mastered).sort((a, b) => a.review_count - b.review_count);
  return unmastered.slice(0, 10).map(w => w.word);
}
