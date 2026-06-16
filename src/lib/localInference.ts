/**
 * 本地大模型推理引擎封装（llama.rn 单例）
 *
 * 架构：
 * - 全局单例 LlamaContext，防止重复加载
 * - 模块级状态 + 订阅者列表，供 React 层响应
 * - callAI (file 模式) 直接调用 runLocalInference()
 *
 * ⚠️ 需要 expo prebuild 才能编译原生代码（不支持 Expo Go）
 */

import * as FileSystem from 'expo-file-system/legacy';
import type { AiMessage, AiResponse } from '@/lib/aiService';

// ─── 模型加载状态 ──────────────────────────────────────────────────────────

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

let _context: any = null;           // LlamaContext 实例
let _loadedPath = '';               // 当前已加载的文件路径
let _status: ModelStatus = 'idle';
let _errorMsg = '';
let _loadProgress = 0;              // 0~100
let _loadingPromise: Promise<void> | null = null;  // 防止并发加载竞态

type StatusListener = (status: ModelStatus, error: string, progress: number) => void;
const _listeners: Set<StatusListener> = new Set();

function notifyListeners() {
  _listeners.forEach(fn => {
    try { fn(_status, _errorMsg, _loadProgress); } catch { /* 忽略 */ }
  });
}

function setStatus(s: ModelStatus, err = '', progress = _loadProgress) {
  _status = s;
  _errorMsg = err;
  _loadProgress = progress;
  notifyListeners();
}

/** 订阅模型状态变更，返回取消订阅函数 */
export function subscribeModelStatus(fn: StatusListener): () => void {
  _listeners.add(fn);
  // 立即通知当前状态
  fn(_status, _errorMsg, _loadProgress);
  return () => _listeners.delete(fn);
}

/** 当前模型状态快照 */
export function getModelSnapshot() {
  return { status: _status, error: _errorMsg, progress: _loadProgress, loadedPath: _loadedPath };
}

// ─── 模型加载选项 ──────────────────────────────────────────────────────────

export interface LoadModelOptions {
  nGpuLayers: number;   // 0=纯CPU；99=全GPU
  nThreads: number;     // CPU 线程数
  contextSize: number;  // KV Cache 上下文窗口大小
}

// ─── 加载 / 卸载 ──────────────────────────────────────────────────────────

/**
 * 加载模型文件。
 * - 若已加载相同路径且参数未变，跳过
 * - 若已加载不同模型，先卸载再加载
 */
export async function loadModel(filePath: string, opts: LoadModelOptions): Promise<void> {
  // 如果正在加载中，等待当前加载完成而非抛错
  if (_loadingPromise) return _loadingPromise;

  // 已加载相同模型，无需重加载
  if (_context && _loadedPath === filePath && _status === 'ready') return;

  // 卸载旧模型
  if (_context) await unloadModel();

  _loadingPromise = (async () => {
    setStatus('loading', '', 0);
    try {
      // ── 预检 1：确认文件存在 ───────────────────────────────────────────────
      // initLlama 内部已处理 file:// 前缀，此处用原始 URI 做检查即可
      const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      throw new Error('模型文件不存在，请重新导入 .gguf 文件');
    }

    // ── 预检 2：动态 import（若原生模块未加载会在此失败）──────────────────
    let initLlama: ((params: any, onProgress?: (p: number) => void) => Promise<any>);
    try {
      const mod = await import('llama.rn');
      initLlama = mod.initLlama;
    } catch (importErr: any) {
      throw new Error(
        'llama.rn 原生模块未能加载。请确认使用的是 expo prebuild 构建的原生包，Expo Go 不支持本地推理。\n原因：' +
        (importErr?.message ?? String(importErr))
      );
    }

    // ── 加载模型 ──────────────────────────────────────────────────────────
    // initLlama 内部已做 file:// 剥离；Android 只需传原始路径
    const initParams = {
      model: filePath,
      n_ctx: opts.contextSize,
      n_gpu_layers: opts.nGpuLayers,
      n_threads: opts.nThreads,
      use_mlock: false,
    };

    try {
      _context = await initLlama(initParams, (progress: number) => {
        // llama.rn 回调值：0~100 整数
        const pct = progress <= 1 ? Math.round(progress * 100) : Math.round(progress);
        setStatus('loading', '', Math.min(pct, 99));
      });
    } catch (gpuErr: any) {
      // GPU 加载失败时自动降级到纯 CPU 重试（Vulkan / Metal 不可用等）
      const isGpuError = opts.nGpuLayers > 0 &&
        /vulkan|gpu|metal|opencl|cuda/i.test(gpuErr?.message ?? '');
      if (isGpuError) {
        setStatus('loading', '', 0);
        _context = await initLlama(
          { ...initParams, n_gpu_layers: 0 },
          (progress: number) => {
            const pct = progress <= 1 ? Math.round(progress * 100) : Math.round(progress);
            setStatus('loading', '', Math.min(pct, 99));
          }
        );
      } else {
        throw gpuErr;
      }
    }

    _loadedPath = filePath;
    setStatus('ready', '', 100);
  } catch (e: any) {
    _context = null;
    _loadedPath = '';
    // 将底层技术错误映射为用户可读的中文提示
    const raw: string = e?.message ?? String(e);
    const friendly = mapLoadError(raw);
    setStatus('error', friendly, 0);
    throw new Error(friendly);
  } finally {
    _loadingPromise = null;
  }
  })();
  return _loadingPromise;
}

/** 将原始错误信息映射为简洁的中文提示（同时保留原始信息供调试） */
function mapLoadError(raw: string): string {
  const r = raw.toLowerCase();
  if (/jsi.*not installed|jsi binding|install.*jsi/i.test(raw))
    return `JSI 原生绑定未安装。\n请使用 expo prebuild 编译原生包后再运行，Expo Go 不支持本地推理。`;
  if (/no such file|not exist|enoent/i.test(r))
    return `模型文件不存在，请重新导入 .gguf 文件。\n(${raw})`;
  if (/out of memory|oom|enomem|failed to allocate/i.test(r))
    return `设备内存不足，无法加载此模型。\n建议：① 关闭其他应用释放内存；② 选择更小参数量的模型；③ 减小"上下文长度"设置。`;
  if (/cannot read|typeerror|undefined is not/i.test(r))
    return `原生模块调用异常，可能是构建版本不匹配。\n请尝试重新构建应用。\n(${raw})`;
  if (/permission|access denied/i.test(r))
    return `无权访问该文件，请重新导入模型。\n(${raw})`;
  if (/invalid model|bad magic|gguf/i.test(r))
    return `文件格式无效，请确认是完整的 GGUF 格式模型文件。\n(${raw})`;
  if (/context.*size|n_ctx/i.test(r))
    return `上下文长度设置过大，设备不支持。\n请在引擎设置中减小"上下文长度"后重试。\n(${raw})`;
  // 默认：原始信息
  return raw || '未知错误，请查看日志';
}

/** 卸载当前模型，释放内存 */
export async function unloadModel(): Promise<void> {
  if (!_context) {
    setStatus('idle', '', 0);
    return;
  }
  try {
    await _context.release();
  } catch (e) { console.warn('[LocalInference] release error:', e); }
  _context = null;
  _loadedPath = '';
  setStatus('idle', '', 0);
}

/** 模型是否已就绪（可选：检查特定路径） */
export function isModelReady(filePath?: string): boolean {
  if (_status !== 'ready' || !_context) return false;
  if (filePath) return _loadedPath === filePath;
  return true;
}

// ─── 消息格式转换 ──────────────────────────────────────────────────────────

/**
 * 将 OpenAI 消息数组转为 ChatML 格式字符串提示词
 * 兼容绝大多数基于 llama.cpp 的量化模型
 */
function messagesToChatML(messages: AiMessage[]): string {
  let prompt = '';
  for (const m of messages) {
    prompt += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
  }
  prompt += '<|im_start|>assistant\n';
  return prompt;
}

// ─── 推理 ──────────────────────────────────────────────────────────────────

/**
 * 执行本地推理。
 * 若模型未加载，返回错误而非 throw，保持与 callAI 统一的返回协议。
 */
export async function runLocalInference(
  messages: AiMessage[],
  maxTokens: number = 1000,
  onToken?: (token: string) => void
): Promise<AiResponse> {
  if (!_context || _status !== 'ready') {
    return {
      success: false,
      text: '',
      error: '本地模型未加载，请在"AI 配置→本地模型文件"中加载模型',
    };
  }

  try {
    // 使用 ChatML prompt 字符串格式，兼容所有 llama.rn 版本
    // （messages 接口仅部分版本支持，prompt 字符串是通用方案）
    const prompt = messagesToChatML(messages);
    const params: any = {
      prompt,
      n_predict: maxTokens,
      temperature: 0.7,
      top_p: 0.9,
      stop: ['<|im_end|>', '<|im_start|>', '</s>', '<|end|>'],
    };

    let streamedText = '';
    // 180 秒超时，防止推理永久挂起
    const completionPromise = _context.completion(
      params,
      onToken
        ? (data: { token: string }) => {
            streamedText += data.token;
            onToken(data.token);
          }
        : undefined
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('本地推理超时（180秒），请尝试减小输入长度或换用更小的模型')), 180_000)
    );
    const result = await Promise.race([completionPromise, timeoutPromise]);

    // result.text 包含本次生成内容；流式时 streamedText 累积
    const text: string = result?.text ?? streamedText;
    return { success: true, text: text.trim() };
  } catch (e: any) {
    return { success: false, text: '', error: e?.message ?? '推理失败' };
  }
}
