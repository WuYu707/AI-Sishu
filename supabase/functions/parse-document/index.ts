// parse-document Edge Function — 支持从 DOCX / PDF 中提取纯文本
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * 从 DOCX 字节流提取文本（解压 ZIP → 读取 word/document.xml → 提取 w:t 标签）
 */
async function extractDocxText(bytes: Uint8Array): Promise<string> {
  // 使用 DecompressionStream 逐 ZIP entry 提取
  // Deno 内置了 fflate 兼容的原生 ZIP 解析能力通过 fetch + blob URL；
  // 这里用纯文本扫描 w:t 的轻量实现（无需第三方库）
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  // 查找 word/document.xml 的压缩段落
  // ZIP local file header signature: PK\x03\x04
  // 遍历寻找 "word/document.xml" entry
  const entries = parseZipEntries(bytes);
  const docEntry = entries.find(e =>
    e.name === "word/document.xml" || e.name.endsWith("/word/document.xml")
  );
  if (!docEntry) {
    // 退化：直接从原始字节中提取可读 XML 片段
    const fallback = extractWtTags(text);
    return fallback || "（无法解析文档内容）";
  }

  const xmlText = new TextDecoder("utf-8", { fatal: false }).decode(docEntry.data);
  return extractWtTags(xmlText);
}

/** 从 XML 字符串提取所有 <w:t> 标签内容 */
function extractWtTags(xml: string): string {
  const lines: string[] = [];
  const regex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;
  let line = "";
  // 也处理段落换行 <w:p>
  const paraParts = xml.split(/<w:p[ >]/);
  for (const para of paraParts) {
    line = "";
    let m: RegExpExecArray | null;
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    while ((m = re.exec(para)) !== null) {
      line += m[1];
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.join("\n");
}

/** 极简 ZIP 解析器（只处理 stored / deflate entries） */
function parseZipEntries(data: Uint8Array): Array<{ name: string; data: Uint8Array }> {
  const results: Array<{ name: string; data: Uint8Array }> = [];
  let i = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  while (i < data.length - 4) {
    // Local file header: PK\x03\x04
    if (view.getUint32(i, true) !== 0x04034b50) {
      i++;
      continue;
    }
    const compression = view.getUint16(i + 8, true);
    const compressedSize = view.getUint32(i + 18, true);
    const uncompressedSize = view.getUint32(i + 22, true);
    const fileNameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const nameBytes = data.slice(i + 30, i + 30 + fileNameLen);
    const name = new TextDecoder().decode(nameBytes);
    const dataStart = i + 30 + fileNameLen + extraLen;
    const compressedData = data.slice(dataStart, dataStart + compressedSize);

    if (compression === 0) {
      // Stored — uncompressed
      results.push({ name, data: compressedData });
    } else if (compression === 8) {
      // Deflate
      try {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(compressedData);
        writer.close();

        const chunks: Uint8Array[] = [];
        let totalLen = 0;
        // 同步读取不可用，标记需要异步处理；此处用标志跳过，调用方将异步处理
        results.push({ name, data: new Uint8Array(0) }); // placeholder
        // 注：真正的解压在 extractDocxText 中通过异步完成
        i = dataStart + compressedSize;
        continue;
      } catch {
        /* ignore decompression errors */
      }
    }

    i = dataStart + compressedSize;
  }
  return results;
}

/**
 * 异步 DOCX 文本提取（使用 DecompressionStream 处理 deflate entries）
 */
async function extractDocxTextAsync(bytes: Uint8Array): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 0;

  while (i < bytes.length - 4) {
    if (view.getUint32(i, true) !== 0x04034b50) { i++; continue; }

    const compression = view.getUint16(i + 8, true);
    const compressedSize = view.getUint32(i + 18, true);
    const fileNameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const nameBytes = bytes.slice(i + 30, i + 30 + fileNameLen);
    const name = new TextDecoder().decode(nameBytes);
    const dataStart = i + 30 + fileNameLen + extraLen;
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

    if (name === "word/document.xml" || name.endsWith("/word/document.xml")) {
      let xmlBytes: Uint8Array;
      if (compression === 0) {
        xmlBytes = compressedData;
      } else if (compression === 8) {
        try {
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          writer.write(compressedData);
          writer.close();
          const chunks: Uint8Array[] = [];
          const reader = ds.readable.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const total = chunks.reduce((s, c) => s + c.length, 0);
          xmlBytes = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) { xmlBytes.set(c, offset); offset += c.length; }
        } catch {
          return "（DOCX 解压失败）";
        }
      } else {
        return "（不支持的压缩格式）";
      }
      const xmlText = new TextDecoder("utf-8", { fatal: false }).decode(xmlBytes);
      return extractWtTags(xmlText);
    }

    i = dataStart + compressedSize;
  }
  return "（未找到文档内容）";
}

/**
 * 从 PDF 字节流提取文本（基础文本流：BT...ET 块中的 Tj / TJ 操作符）
 */
function extractPdfText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const lines: string[] = [];

  // 匹配 BT...ET 文本块
  const btEtRe = /BT([\s\S]*?)ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btEtRe.exec(raw)) !== null) {
    const block = btMatch[1];
    // 提取 (text) Tj 和 [(text)...] TJ
    const tjRe = /\(([^)]*)\)\s*Tj/g;
    const tjArrRe = /\[([^\]]*)\]\s*TJ/g;
    let m: RegExpExecArray | null;

    let blockText = "";
    while ((m = tjRe.exec(block)) !== null) {
      blockText += decodePdfString(m[1]) + " ";
    }
    while ((m = tjArrRe.exec(block)) !== null) {
      const inner = m[1];
      const strRe = /\(([^)]*)\)/g;
      let sm: RegExpExecArray | null;
      while ((sm = strRe.exec(inner)) !== null) {
        blockText += decodePdfString(sm[1]);
      }
      blockText += " ";
    }
    if (blockText.trim()) lines.push(blockText.trim());
  }

  return lines.join("\n") || "（无法提取PDF文本，请使用图片OCR模式）";
}

/** 简单 PDF 字符串解码（处理 \n \r \t 等转义） */
function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  let fileBase64: string;
  let fileType: string;

  try {
    const body = await req.json();
    fileBase64 = body.file;   // base64 编码的文件内容
    fileType = (body.type || "").toLowerCase(); // "docx" | "pdf"
    if (!fileBase64) throw new Error("Missing file");
    if (!fileType) throw new Error("Missing type");
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: `Invalid request: ${(e as Error).message}` }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    // Base64 → Uint8Array
    const binaryStr = atob(fileBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    let extractedText = "";
    if (fileType === "docx" || fileType.includes("word") || fileType.includes("openxml")) {
      extractedText = await extractDocxTextAsync(bytes);
    } else if (fileType === "pdf") {
      extractedText = extractPdfText(bytes);
    } else {
      return new Response(JSON.stringify({ error: `不支持的文件类型: ${fileType}` }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ text: extractedText, chars: extractedText.length }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: `文档解析失败: ${(e as Error).message}` }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
