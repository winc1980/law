// GitHub のトークンを手に入れて、そのタブのあいだだけ持っておく。
//
// GitHub Pages は静的なので、OAuth の token 交換をこちらで行う先がない。
// Device Flow なら client_secret は要らないが、github.com/login/oauth/access_token は
// CORS を許していないため、ブラウザからは叩けない。そこで小さな中継を1つだけ挟む
// （auth/ にコードと立てかたがある）。中継が未設定のビルドでは、個人アクセストークンを
// 貼ってもらう経路に落ちる。

import { AUTH } from './config';

const STORE_KEY = 'winc-law:github-token';

/** sessionStorage に置く。タブを閉じれば消えるので、共用の端末でも残らない。 */
export function readToken(): string {
  try {
    return sessionStorage.getItem(STORE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveToken(token: string): void {
  try {
    sessionStorage.setItem(STORE_KEY, token);
  } catch {
    // プライベートウィンドウなどで書けないことがある。その回だけ使えれば足りる。
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    // 同上
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface DeviceCode {
  deviceCode: string;
  /** 利用者が GitHub の画面に打ち込む文字列。 */
  userCode: string;
  verificationUri: string;
  /** ポーリングの間隔（秒）。 */
  interval: number;
  expiresIn: number;
}

interface Relay {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  interval?: number;
  expires_in?: number;
  access_token?: string;
  error?: string;
  error_description?: string;
}

async function relay(path: string, body: Record<string, string>): Promise<Relay> {
  let response: Response;
  try {
    response = await fetch(`${AUTH.endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('認証の中継に接続できませんでした。通信の状態を確かめてください。');
  }

  const payload = (await response.json().catch(() => null)) as Relay | null;
  if (!payload) throw new AuthError(`認証の中継から応答がありませんでした。（${response.status}）`);
  return payload;
}

const MESSAGES: Record<string, string> = {
  authorization_pending: '', // まだ承認されていないだけ。待つ。
  slow_down: '',
  expired_token: '時間切れです。もう一度やり直してください。',
  access_denied: '承認が取り消されました。',
  incorrect_device_code: '認証のやりとりが壊れました。もう一度やり直してください。',
  unsupported_grant_type: '認証の中継の設定が正しくありません。管理者に連絡してください。',
};

export async function requestDeviceCode(): Promise<DeviceCode> {
  const payload = await relay('/device/code', { client_id: AUTH.clientId });

  if (payload.error || !payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new AuthError(
      MESSAGES[payload.error ?? ''] ||
        `認証を始められませんでした。（${payload.error_description ?? payload.error ?? '応答が不正です'}）`,
    );
  }

  return {
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    interval: Math.max(payload.interval ?? 5, 1),
    expiresIn: payload.expires_in ?? 900,
  };
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new AuthError('中止しました。'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });

/** 利用者が GitHub 側で承認するまで待つ。承認されたらトークンを返す。 */
export async function waitForToken(code: DeviceCode, signal: AbortSignal): Promise<string> {
  let interval = code.interval * 1000;
  const deadline = Date.now() + code.expiresIn * 1000;

  while (Date.now() < deadline) {
    await wait(interval, signal);

    const payload = await relay('/device/token', {
      client_id: AUTH.clientId,
      device_code: code.deviceCode,
    });

    if (payload.access_token) return payload.access_token;

    if (payload.error === 'slow_down') {
      // GitHub の指示どおり間隔を延ばす。従わないと弾かれ続ける。
      interval = Math.max((payload.interval ?? 0) * 1000, interval + 5000);
      continue;
    }
    if (payload.error === 'authorization_pending') continue;

    throw new AuthError(
      MESSAGES[payload.error ?? ''] ||
        `承認を受け取れませんでした。（${payload.error_description ?? payload.error ?? '不明'}）`,
    );
  }

  throw new AuthError('時間切れです。もう一度やり直してください。');
}
