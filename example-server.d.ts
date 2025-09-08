import type { WebAuthnCredential } from '@simplewebauthn/server';

export interface User {
  id: string; // 稳定随机ID（Base64URL / UUID）
  username: string; // 展示用，可重复
}

export interface StoredCredential extends WebAuthnCredential {
  userId: string;
  createdAt: string;
  lastUsedAt?: string;
  aaguid?: string;
  backedUp?: boolean;
  deviceType?: 'singleDevice' | 'multiDevice';
}

declare module 'express-session' {
  interface SessionData {
    currentChallenge?: string;
    requestId?: string; // 可选：关联一次认证请求
    userId?: string; // 注册成功后即视为已登录
    pendingUserId?: string; // 注册过程中的临时用户ID
  }
}

