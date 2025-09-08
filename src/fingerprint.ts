/**
 * 设备指纹生成工具
 * 基于浏览器和设备特征生成唯一标识
 */

interface DeviceInfo {
  userAgent: string;
  language: string;
  platform: string;
  screen: string;
  timezone: string;
  webgl: string;
  canvas: string;
}

// 获取 WebGL 指纹
function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';
    
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return `${vendor}-${renderer}`;
  } catch {
    return 'webgl-error';
  }
}

// 获取 Canvas 指纹
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint test 🌟', 2, 2);
    return canvas.toDataURL().slice(-50); // 取后50字符
  } catch {
    return 'canvas-error';
  }
}

// 收集设备信息
function collectDeviceInfo(): DeviceInfo {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    webgl: getWebGLFingerprint(),
    canvas: getCanvasFingerprint(),
  };
}

// 生成设备指纹
export async function generateDeviceFingerprint(): Promise<string> {
  const deviceInfo = collectDeviceInfo();
  
  // 将设备信息序列化
  const infoString = JSON.stringify(deviceInfo);
  
  // 使用 Web Crypto API 生成哈希
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(infoString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16); // 取前16位作为设备ID
  } catch {
    // 降级方案：简单哈希
    return btoa(infoString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }
}

// 持久化设备指纹
export function getStoredDeviceId(): string | null {
  try {
    return localStorage.getItem('device_id');
  } catch {
    return null;
  }
}

export function storeDeviceId(deviceId: string): void {
  try {
    localStorage.setItem('device_id', deviceId);
  } catch {
    // localStorage 不可用时忽略
  }
}

// 获取或生成设备指纹
export async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = getStoredDeviceId();
  if (!deviceId) {
    deviceId = await generateDeviceFingerprint();
    storeDeviceId(deviceId);
  }
  return deviceId;
}
