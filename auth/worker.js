// GitHub Device Flow の中継。
//
// 編集ページは GitHub Pages 上の静的なページなので、サーバーを持っていない。
// Device Flow なら client_secret は要らないが、github.com の2つの口は CORS を
// 許していないため、ブラウザからは叩けない。ここはそれを取り次ぐだけで、
// 秘密は持たず、何も記録しない。
//
// 立てかたは README.md を参照。

const GITHUB = {
  code: 'https://github.com/login/device/code',
  token: 'https://github.com/login/oauth/access_token',
};

/** 取り次ぎを許すページの出どころ。env.ALLOWED_ORIGINS でカンマ区切りに差し替えられる。 */
const DEFAULT_ORIGINS = ['https://winc1980.github.io'];

function allowedOrigins(env) {
  const configured = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ORIGINS;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

/** GitHub へ渡す値を絞る。余計なものを素通しさせない。 */
function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}

async function forward(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({ error: 'bad_gateway' }));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = allowedOrigins(env);
    // 開発中の localhost は env.ALLOWED_ORIGINS に足して使う
    const cors = allowed.includes(origin) ? origin : allowed[0];

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(cors) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, cors);
    }
    if (!allowed.includes(origin)) {
      return json({ error: 'origin_not_allowed' }, 403, cors);
    }
    if (!env.GITHUB_CLIENT_ID) {
      return json({ error: 'not_configured' }, 500, cors);
    }

    const payload = await request.json().catch(() => null);
    if (!payload) return json({ error: 'invalid_request' }, 400, cors);

    // client_id はこちらが持っているものに固定する。呼び出し側の指定は見ない。
    const { pathname } = new URL(request.url);

    if (pathname === '/device/code') {
      const body = { client_id: env.GITHUB_CLIENT_ID, ...pick(payload, ['scope']) };
      return json(await forward(GITHUB.code, body), 200, cors);
    }

    if (pathname === '/device/token') {
      if (!payload.device_code) return json({ error: 'invalid_request' }, 400, cors);
      const body = {
        client_id: env.GITHUB_CLIENT_ID,
        device_code: payload.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        // GitHub App として登録した場合のみ要る。OAuth App では未設定でよい。
        ...(env.GITHUB_CLIENT_SECRET ? { client_secret: env.GITHUB_CLIENT_SECRET } : {}),
      };
      return json(await forward(GITHUB.token, body), 200, cors);
    }

    return json({ error: 'not_found' }, 404, cors);
  },
};
