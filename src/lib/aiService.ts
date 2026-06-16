/**
 * AI服务调用工具（在线API + 本地大模型 HTTP 端点，统一路由）
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

/** 本地大模型配置（Ollama / LM Studio HTTP 服务 或 设备端 llama.rn 推理） */
export interface LocalModelConfig {
  enabled: boolean;
  endpoint: string;       // HTTP 模式：服务地址，如 http://127.0.0.1:11434/v1
  model: string;          // HTTP 模式：模型名
  apiKey: string;         // HTTP 模式：API Key（Ollama 可留空）
  priority: 'local_first' | 'online_first' | 'online_only';
  /** 当前激活的子模式：http 服务 或 设备端文件 */
  localSubMode?: 'http' | 'file';
  /** 文件模式：激活文件的本地路径 */
  localFilePath?: string;
  /** 文件模式：从文件名解析出的模型名（HTTP 回退用） */
  localFileModel?: string;
  /** 文件模式 HTTP 回退：推理服务地址（Ollama localhost） */
  fileEndpoint?: string;
  /** 文件模式 HTTP 回退：API Key */
  fileApiKey?: string;
  // ── 推理引擎硬件配置 ──────────────────────────────────────────────────
  /** 计算后端：auto=优先GPU | gpu=强制GPU | cpu=纯CPU */
  computeBackend?: 'auto' | 'gpu' | 'cpu';
  /** GPU 卸载层数（0=纯CPU，99=最大GPU，仅 gpu/auto 模式有效） */
  nGpuLayers?: number;
  /** CPU 推理线程数（1~8，默认 4） */
  nThreads?: number;
  /** KV Cache 上下文长度（token 数，越大越耗内存，默认 2048） */
  contextSize?: number;
}

/**
 * 判断本地 AI 是否可用（兼容 HTTP 模式和文件模式）
 * 用于替换各页面中 `localAiConfig?.enabled && localAiConfig.endpoint` 的判断
 */
export function isLocalAiAvailable(cfg: LocalModelConfig | null | undefined): boolean {
  if (!cfg?.enabled) return false;
  if (cfg.localSubMode === 'file') {
    // 文件模式：有文件路径即视为可用（可能走 llama.rn 或 HTTP 回退）
    return !!(cfg.localFilePath && cfg.localFileModel);
  }
  // HTTP 模式：需要 endpoint + model
  return !!(cfg.endpoint && cfg.model);
}

/** 将 AiConfig 转为统一的调用参数 */
function configToCallParams(cfg: AiConfig): { endpoint: string; model: string; apiKey: string } {
  // endpoint 可能是 base URL（如 https://api.openai.com/v1）或完整 chat path
  const ep = cfg.endpoint.endsWith('/chat/completions')
    ? cfg.endpoint
    : cfg.endpoint.replace(/\/$/, '') + '/chat/completions';
  return { endpoint: ep, model: cfg.model, apiKey: cfg.api_key_enc };
}

/** 将 LocalModelConfig 转为统一的调用参数（自动识别 http/file 子模式） */
function localToCallParams(cfg: LocalModelConfig): { endpoint: string; model: string; apiKey: string } {
  const isFileMode = cfg.localSubMode === 'file' && cfg.localFilePath && cfg.localFileModel;
  if (isFileMode) {
    // 文件模式：使用 fileEndpoint + localFileModel
    const base = (cfg.fileEndpoint || 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
    const ep = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
    return { endpoint: ep, model: cfg.localFileModel!, apiKey: cfg.fileApiKey || '' };
  }
  // HTTP 服务模式
  const ep = cfg.endpoint.endsWith('/chat/completions')
    ? cfg.endpoint
    : cfg.endpoint.replace(/\/$/, '') + '/chat/completions';
  return { endpoint: ep, model: cfg.model, apiKey: cfg.apiKey };
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

    // 120 秒超时，防止请求永久挂起
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
 * 优先匹配 ```json 代码块，回退到非贪婪匹配
 */
function extractJsonArray(text: string): any[] | null {
  // 优先匹配 ```json ... ``` 代码块
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { /* fall through */ }
  }
  // 回退：非贪婪匹配 [...]
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
 * 统一 AI 路由调用：
 * - file 模式 → 优先 llama.rn 本地推理，未加载则尝试 HTTP 回退
 * - local_first  → 先试本地，失败则降级到在线
 * - online_first → 先试在线，失败则降级到本地
 * - online_only  → 仅用在线
 * - 无在线配置且无本地配置 → 返回错误
 */
export async function callAI(
  onlineConfig: AiConfig | null,
  localConfig: LocalModelConfig | null,
  messages: AiMessage[],
  maxTokens: number = 1000
): Promise<AiResponse> {
  const isFileMode = localConfig?.localSubMode === 'file';
  const localEnabled = isLocalAiAvailable(localConfig);
  const priority = localConfig?.priority ?? 'local_first';

  // ── 文件模式：优先 llama.rn，不可用则 HTTP 回退 ──
  if (localEnabled && isFileMode) {
    const { isModelReady, runLocalInference } = await import('@/lib/localInference');
    if (isModelReady(localConfig!.localFilePath)) {
      const res = await runLocalInference(messages, maxTokens);
      if (res.success) return res;
      // llama.rn 失败，尝试 HTTP 回退
      if (localConfig!.fileEndpoint && localConfig!.localFileModel) {
        const lp = localToCallParams(localConfig!);
        const httpRes = await doFetch(lp.endpoint, lp.model, lp.apiKey, messages, maxTokens, '本地文件 HTTP 回退');
        if (httpRes.success) return httpRes;
      }
      // 两者都失败，降级在线
      if (onlineConfig && priority !== 'online_only') {
        const op = configToCallParams(onlineConfig);
        return doFetch(op.endpoint, op.model, op.apiKey, messages, maxTokens, '在线AI（降级）');
      }
      return { ...res, error: `本地推理失败（${res.error}）` };
    }
    // 模型未加载：提示用户先加载
    return {
      success: false,
      text: '',
      error: '本地模型未加载，请在「AI 配置→本地模型文件」中点击「加载模型」',
    };
  }

  if (priority === 'online_only' || !localEnabled) {
    // 仅在线 / 本地未启用
    if (!onlineConfig) return { success: false, text: '', error: '请先配置 AI 服务（在线或本地）' };
    const p = configToCallParams(onlineConfig);
    return doFetch(p.endpoint, p.model, p.apiKey, messages, maxTokens, '在线AI');
  }

  if (priority === 'local_first') {
    // 先本地（HTTP 模式），失败降级在线
    const lp = localToCallParams(localConfig!);
    const localRes = await doFetch(lp.endpoint, lp.model, lp.apiKey, messages, maxTokens, '本地模型');
    if (localRes.success) return localRes;
    if (!onlineConfig) return { ...localRes, error: `本地模型失败（${localRes.error}），且未配置在线 AI` };
    const op = configToCallParams(onlineConfig);
    return doFetch(op.endpoint, op.model, op.apiKey, messages, maxTokens, '在线AI（降级）');
  }

  // online_first：先在线，失败降级本地
  if (onlineConfig) {
    const op = configToCallParams(onlineConfig);
    const onlineRes = await doFetch(op.endpoint, op.model, op.apiKey, messages, maxTokens, '在线AI');
    if (onlineRes.success) return onlineRes;
    const lp = localToCallParams(localConfig!);
    return doFetch(lp.endpoint, lp.model, lp.apiKey, messages, maxTokens, '本地模型（降级）');
  }
  // 仅本地可用（HTTP 模式）
  const lp = localToCallParams(localConfig!);
  return doFetch(lp.endpoint, lp.model, lp.apiKey, messages, maxTokens, '本地模型');
}

/**
 * 兼容旧调用：直接用在线配置，不走路由
 */
export async function callOnlineAI(
  config: AiConfig,
  messages: AiMessage[],
  maxTokens: number = 1000
): Promise<AiResponse> {
  return callAI(config, null, messages, maxTokens);
}

/**
 * 离线模式简单模拟（基础单词/短句功能演示）
 */
export function offlineWordLookup(word: string): AiResponse {
  return {
    success: true,
    text: JSON.stringify({
      word,
      phonetic: `[/${word.toLowerCase()}/]`,
      meaning: `（离线模式）"${word}" 的基础释义`,
      example: `This is an example sentence with "${word}".`,
    }),
  };
}

/**
 * 生成单词的音标、释义、例句（批量）
 */
export async function generateWordInfo(
  words: string[],
  config: AiConfig | null,
  targetLanguage: string = 'Chinese',
  localConfig?: LocalModelConfig | null
): Promise<{ word: string; phonetic: string; meaning: string; example: string }[]> {
  const prompt = `请为以下单词生成音标、中文释义和英文例句，以JSON数组格式返回，每项格式：{"word":"...","phonetic":"...","meaning":"...","example":"..."}。单词列表：${words.join(', ')}`;
  const res = await callAI(config, localConfig ?? null, [
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
  localConfig?: LocalModelConfig | null
): Promise<string> {
  const res = await callAI(config, localConfig ?? null, [
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
  localConfig?: LocalModelConfig | null
): Promise<string> {
  const res = await callAI(config, localConfig ?? null, [
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
  localConfig?: LocalModelConfig | null
): Promise<string> {
  const res = await callAI(config, localConfig ?? null, [
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
  localConfig?: LocalModelConfig | null
): Promise<{ content: string; options: string[]; answer: string } | null> {
  const res = await callAI(config, localConfig ?? null, [
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
 * 从OCR文本中用AI解析题目（返回TempQuestion数组JSON）
 */
export async function parseQuestionsFromText(
  ocrText: string,
  config: AiConfig | null,
  localConfig?: LocalModelConfig | null
): Promise<{ content: string; type: string; options: string[]; answer: string; explanation: string }[]> {
  const res = await callAI(config, localConfig ?? null, [
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
  localConfig?: LocalModelConfig | null
): Promise<string[]> {
  const unmastered = words.filter(w => !w.mastered).sort((a, b) => a.review_count - b.review_count);
  // 优先推荐未掌握且复习次数少的
  return unmastered.slice(0, 10).map(w => w.word);
}
