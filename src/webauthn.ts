import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

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

export async function loginViaWebAuthn(
  deviceId?: string
): Promise<{ verified: boolean; userId?: string } | null> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (deviceId) {
      headers['X-Device-ID'] = deviceId
    }

    const resp = await fetch('/auth/options/quick', { headers })
    const opts = await resp.json()
    const asseResp = await startAuthentication({ optionsJSON: opts })
    const verificationResp = await fetch('/auth/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify(asseResp),
    })
    return verificationResp.json()
  } catch {
    return null
  }
}

export async function registerViaWebAuthn(
  deviceId?: string
): Promise<{ verified: boolean; userId?: string; loggedIn?: boolean } | null> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (deviceId) {
      headers['X-Device-ID'] = deviceId
    }

    const optResp = await fetch('/register/options', { headers })
    const regOpts = await optResp.json()
    let attResp
    try {
      attResp = await startRegistration({ optionsJSON: regOpts })
    } catch (e: any) {
      // 注册失败（例如 InvalidStateError，表示设备上已存在同凭证），立即尝试登录
      if (e?.name === 'InvalidStateError') {
        const login = await loginViaWebAuthn(deviceId)
        if (login?.verified) {
          return { verified: true, userId: login.userId, loggedIn: true }
        }
      }
      throw e
    }
    const verificationResp = await fetch('/register/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify(attResp),
    })
    return verificationResp.json()
  } catch {
    return null
  }
}

export async function confirmLoginAfterRegister(): Promise<{
  loggedIn: boolean
  userId?: string
} | null> {
  try {
    const resp = await fetch('/auth/login-after-register', { method: 'POST' })
    return resp.json()
  } catch {
    return null
  }
}

export async function checkSession(): Promise<{
  loggedIn: boolean
  userId?: string
} | null> {
  try {
    const resp = await fetch('/me')
    return resp.json()
  } catch {
    return null
  }
}

export async function supportsConditionalUI(): Promise<boolean> {
  const w = window as any
  if (
    !w.PublicKeyCredential ||
    typeof w.PublicKeyCredential.isConditionalMediationAvailable !== 'function'
  ) {
    return false
  }
  try {
    return !!(await w.PublicKeyCredential.isConditionalMediationAvailable())
  } catch {
    return false
  }
}

export async function conditionalAutofillLogin(): Promise<{
  verified: boolean
  userId?: string
} | null> {
  try {
    const resp = await fetch('/auth/options/quick')
    const opts = await resp.json()
    const asseResp = await startAuthentication({
      optionsJSON: opts,
      useAutofill: true,
    })
    const verificationResp = await fetch('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(asseResp),
    })
    return verificationResp.json()
  } catch {
    return null
  }
}

// 全面的浏览器能力检测
export interface WebAuthnCapabilities {
  basicWebAuthn: boolean
  conditionalUI: boolean
  platformAuthenticator: boolean
  clientCapabilities: any | null
  userAgent: string
  estimatedBrowserSupport: string
}

export async function detectWebAuthnCapabilities(): Promise<WebAuthnCapabilities> {
  const userAgent = navigator.userAgent

  // 基础 WebAuthn 支持检测
  const basicWebAuthn = !!(
    'PublicKeyCredential' in window &&
    'credentials' in navigator &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  )

  // 条件式 UI 支持检测
  let conditionalUI = false
  if (basicWebAuthn && window.PublicKeyCredential) {
    try {
      const w = window as any
      if (
        typeof w.PublicKeyCredential.isConditionalMediationAvailable ===
        'function'
      ) {
        conditionalUI =
          !!(await w.PublicKeyCredential.isConditionalMediationAvailable())
      }
    } catch {
      conditionalUI = false
    }
  }

  // 平台认证器支持检测
  let platformAuthenticator = false
  if (basicWebAuthn && window.PublicKeyCredential) {
    try {
      const w = window as any
      if (
        typeof w.PublicKeyCredential
          .isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      ) {
        platformAuthenticator =
          !!(await w.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
      }
    } catch {
      platformAuthenticator = false
    }
  }

  // 客户端能力检测（WebAuthn Level 3）
  let clientCapabilities = null
  if (basicWebAuthn && window.PublicKeyCredential) {
    try {
      const w = window as any
      if (typeof w.PublicKeyCredential.getClientCapabilities === 'function') {
        clientCapabilities = await w.PublicKeyCredential.getClientCapabilities()
      }
    } catch {
      clientCapabilities = null
    }
  }

  // 估计浏览器支持级别
  const estimatedBrowserSupport = estimateBrowserSupport(userAgent, {
    basicWebAuthn,
    conditionalUI,
    platformAuthenticator,
    clientCapabilities: !!clientCapabilities,
  })

  return {
    basicWebAuthn,
    conditionalUI,
    platformAuthenticator,
    clientCapabilities,
    userAgent,
    estimatedBrowserSupport,
  }
}

function estimateBrowserSupport(
  userAgent: string,
  capabilities: {
    basicWebAuthn: boolean
    conditionalUI: boolean
    platformAuthenticator: boolean
    clientCapabilities: boolean
  }
): string {
  const ua = userAgent.toLowerCase()

  if (!capabilities.basicWebAuthn) {
    return '不支持 WebAuthn'
  }

  // Chrome 检测
  if (ua.includes('chrome') && !ua.includes('edg')) {
    if (capabilities.conditionalUI && capabilities.clientCapabilities) {
      return 'Chrome 133+ (完整 Passkey 支持)'
    } else if (capabilities.conditionalUI) {
      return 'Chrome 108+ (Passkey 支持)'
    } else {
      return 'Chrome 67+ (基础 WebAuthn)'
    }
  }

  // Safari 检测
  if (ua.includes('safari') && !ua.includes('chrome')) {
    if (capabilities.clientCapabilities) {
      return 'Safari 17.4+ (完整支持)'
    } else if (capabilities.platformAuthenticator) {
      return 'Safari 14+ (平台认证器支持)'
    } else {
      return 'Safari 13+ (基础 WebAuthn)'
    }
  }

  // Firefox 检测
  if (ua.includes('firefox')) {
    return 'Firefox 60+ (WebAuthn 支持，Passkey 有限)'
  }

  // Edge 检测
  if (ua.includes('edg')) {
    if (capabilities.conditionalUI && capabilities.clientCapabilities) {
      return 'Edge 133+ (完整 Passkey 支持)'
    } else if (capabilities.conditionalUI) {
      return 'Edge 108+ (Passkey 支持)'
    } else {
      return 'Edge 18+ (基础 WebAuthn)'
    }
  }

  return '未知浏览器 (基础 WebAuthn 支持)'
}
