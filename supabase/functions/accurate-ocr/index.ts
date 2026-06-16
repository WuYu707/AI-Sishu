// accurate-ocr Edge Function — 代理调用百度通用文字识别（高精度版）
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  let image: string;
  let languageType: string | undefined;
  let detectDirection: boolean | undefined;
  let probability: boolean | undefined;

  try {
    const body = await req.json();
    image = body.image;
    if (!image) throw new Error("Missing image");
    languageType = body.language_type;
    detectDirection = body.detect_direction;
    probability = body.probability;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const params: Record<string, string> = { image };
  if (languageType) params.language_type = languageType;
  if (detectDirection !== undefined) params.detect_direction = String(detectDirection);
  if (probability !== undefined) params.probability = String(probability);

  const upstream = await fetch(
    "https://app-bmp8n1fqz9c1-api-eLMlJ2jB44g9-gateway.appmiaoda.com/rest/2.0/ocr/v1/accurate_basic",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: new URLSearchParams(params).toString(),
    }
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}`, detail: errText }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const result = await upstream.json();
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
