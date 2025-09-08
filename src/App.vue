<template>
  <div class="container">
    <h1>Passkey 快捷登录（Vite + Vue + TS）</h1>
    <div class="controls" v-if="supported">
      <section>
        <h3>一键登录/注册</h3>
        <button id="btnOneTap" @click="onOneTap" :disabled="loading">{{ loading ? '处理中…' : '一键进入' }}</button>
        <p id="oneSuccess" class="success">{{ successMsg }}</p>
        <p id="oneError" class="error">{{ errorMsg }}</p>
        <details open>
          <summary>调试</summary>
          <textarea id="oneDebug" spellcheck="false" :value="debugText" readonly></textarea>
        </details>
      </section>
    </div>
    <p class="systemError" v-else>当前浏览器不支持 WebAuthn</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import {
  loginViaWebAuthn,
  registerViaWebAuthn,
  confirmLoginAfterRegister,
} from './webauthn';
import { getOrCreateDeviceId } from './fingerprint';

const supported = ref(false);
const loading = ref(false);
const successMsg = ref('');
const errorMsg = ref('');
const debugText = ref('');

function printDebug(title: string, output: string) {
  if (debugText.value !== '') debugText.value += '\n';
  debugText.value += `// ${title}\n`;
  debugText.value += `${output}\n`;
}

async function tryQuickLogin() {
  const deviceId = await getOrCreateDeviceId();
  printDebug('Device ID', deviceId);
  const verificationJSON = (await loginViaWebAuthn(deviceId)) || { verified: false };
  printDebug('QuickLogin Server', JSON.stringify(verificationJSON, null, 2));
  if (!verificationJSON || !verificationJSON.verified) throw new Error('quick login failed');
  return verificationJSON as { verified: boolean; userId: string };
}

async function doRegister() {
  // // 1. 静默尝试（老用户回流）
  // const silent = await silentGet();
  // printDebug('Silent Before Register', JSON.stringify(!!silent));
  // if (silent) {
  //   const quick = await loginViaWebAuthn();
  //   if (quick?.verified) {
  //     return { verified: true, userId: quick.userId, loggedIn: true };
  //   }
  // }
  // 2. 走注册
  const deviceId = await getOrCreateDeviceId();
  const reg = (await registerViaWebAuthn(deviceId)) || { verified: false };
  printDebug('Register Server', JSON.stringify(reg, null, 2));
  if (!reg || !reg.verified) throw new Error('register failed');
  // 3. 确认登录态
  const confirm = (await confirmLoginAfterRegister()) || { loggedIn: false };
  printDebug('Confirm After Register', JSON.stringify(confirm, null, 2));
  return { ...reg, loggedIn: confirm.loggedIn } as { verified: boolean; userId: string; loggedIn?: boolean };
}

async function onOneTap() {
  if (!supported.value || loading.value) return;
  loading.value = true;
  successMsg.value = '';
  errorMsg.value = '';
  debugText.value = '';

  try {
    // 优化方案：先尝试登录（如果有凭证），失败后再注册
    const quick = await tryQuickLogin();
    successMsg.value = `登录成功\nuserId: ${quick.userId}`;
  } catch {
    try {
      // 登录失败，说明是新用户，进行注册
      const reg = await doRegister();
      if (reg && reg.loggedIn) {
        successMsg.value = `注册成功并已自动登录\nuserId: ${reg.userId}`;
      } else {
        successMsg.value = '注册成功，但未自动登录，请重试';
      }
    } catch (e: any) {
      errorMsg.value = e?.message || String(e);
    }
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  supported.value = browserSupportsWebAuthn();
});
</script>

<style scoped>
/* 样式主要在全局 style.css 中，这里仅可按需覆盖 */
</style>


