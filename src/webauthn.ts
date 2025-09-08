import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// export async function silentGet(): Promise<Credential | null> {
//   if (!('credentials' in navigator) || !('get' in navigator.credentials!)) return null;
//   try {
//     // @ts-ignore: mediation is supported by Credential Management API where available
//     const cred = await navigator.credentials.get({ mediation: 'silent', publicKey: {} as any });
//     return cred as Credential | null;
//   } catch {
//     return null;
//   }
// }

export async function loginViaWebAuthn(deviceId?: string): Promise<{ verified: boolean; userId?: string } | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (deviceId) {
      headers['X-Device-ID'] = deviceId;
    }
    
    const resp = await fetch('/auth/options/quick', { headers });
    const opts = await resp.json();
    const asseResp = await startAuthentication({ optionsJSON: opts });
    const verificationResp = await fetch('/auth/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify(asseResp),
    });
    return verificationResp.json();
  } catch {
    return null;
  }
}

export async function registerViaWebAuthn(deviceId?: string): Promise<{ verified: boolean; userId?: string; loggedIn?: boolean } | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (deviceId) {
      headers['X-Device-ID'] = deviceId;
    }
    
    const optResp = await fetch('/register/options', { headers });
    const regOpts = await optResp.json();
    let attResp;
    try {
      attResp = await startRegistration({ optionsJSON: regOpts });
    } catch (e: any) {
      // 注册失败（例如 InvalidStateError，表示设备上已存在同凭证），立即尝试登录
      if (e?.name === 'InvalidStateError') {
        const login = await loginViaWebAuthn(deviceId);
        if (login?.verified) {
          return { verified: true, userId: login.userId, loggedIn: true };
        }
      }
      throw e;
    }
    const verificationResp = await fetch('/register/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify(attResp),
    });
    return verificationResp.json();
  } catch {
    return null;
  }
}

export async function confirmLoginAfterRegister(): Promise<{ loggedIn: boolean; userId?: string } | null> {
  try {
    const resp = await fetch('/auth/login-after-register', { method: 'POST' });
    return resp.json();
  } catch {
    return null;
  }
}

export async function checkSession(): Promise<{ loggedIn: boolean; userId?: string } | null> {
  try {
    const resp = await fetch('/me');
    return resp.json();
  } catch {
    return null;
  }
}

export async function supportsConditionalUI(): Promise<boolean> {
  const w = window as any;
  if (!w.PublicKeyCredential || typeof w.PublicKeyCredential.isConditionalMediationAvailable !== 'function') {
    return false;
  }
  try {
    return !!(await w.PublicKeyCredential.isConditionalMediationAvailable());
  } catch {
    return false;
  }
}

export async function conditionalAutofillLogin(): Promise<{ verified: boolean; userId?: string } | null> {
  try {
    const resp = await fetch('/auth/options/quick');
    const opts = await resp.json();
    const asseResp = await startAuthentication({ optionsJSON: opts, useAutofill: true });
    const verificationResp = await fetch('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(asseResp),
    });
    return verificationResp.json();
  } catch {
    return null;
  }
}


