import http from 'http'
import express from 'express'
import session from 'express-session'
import memoryStore from 'memorystore'

import {
  AuthenticationResponseJSON,
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
  WebAuthnCredential,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  VerifyAuthenticationResponseOpts,
  VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server'

import type { StoredCredential, User } from './example-server'

const app = express()
const MemoryStore = memoryStore(session)

// 配置：生产环境需与域名一致
const rpID = 'localhost'
const host = '127.0.0.1'
const port = 8002 // 与其他示例错开
const expectedOrigin = `http://localhost:5174` // Vite 开发服务器地址

app.use(express.json())
app.use(
  session({
    secret: 'example3-secret',
    saveUninitialized: true,
    resave: false,
    cookie: { maxAge: 86400000, httpOnly: true },
    store: new MemoryStore({ checkPeriod: 86_400_000 }),
  })
)

// 简单内存持久化：生产中请替换为数据库
const users = new Map<string, User>()
const credentialsById = new Map<string, StoredCredential>() // 以 credentialId 作为主键
const credentialsByUser = new Map<string, StoredCredential[]>()
const deviceToUser = new Map<string, string>() // 设备指纹到用户ID的映射

// 帮助函数
function ensureUser(userId: string, username: string): User {
  let user = users.get(userId)
  if (!user) {
    user = { id: userId, username }
    users.set(userId, user)
  }
  return user
}

// 注册（可发现凭证）
app.get('/register/options', async (req, res) => {
  const deviceId = req.headers['x-device-id'] as string

  // 检查设备指纹是否已关联用户
  let userId = req.session.pendingUserId
  if (deviceId && !userId) {
    // 先查看设备是否已关联用户
    const existingUserId = deviceToUser.get(deviceId)
    if (existingUserId) {
      userId = existingUserId
      req.session.pendingUserId = userId
    }
  }

  if (!userId) {
    // 只有在真正需要注册时才生成新用户ID
    userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    req.session.pendingUserId = userId

    // 关联设备指纹到新用户
    if (deviceId) {
      deviceToUser.set(deviceId, userId)
    }
  }

  const username = `user@example.com`
  const user = ensureUser(userId, username)

  const existingCreds = credentialsByUser.get(user.id) || []

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: 'SimpleWebAuthn Example3',
    rpID,
    userName: user.username,
    // 传递稳定 userID（可选，不传库会生成随机）
    // 使用 Uint8Array 表达（库会进行编码）
    userID: new TextEncoder().encode(user.id),
    timeout: 60000,
    // 强制要求具体的证明类型：packed、fido-u2f、tpm
    // 注意：某些平台认证器可能仍返回 'none'，需要在验证时处理
    attestationType: 'direct',
    excludeCredentials: existingCreds.map((cred) => ({
      id: cred.id,
      transports: cred.transports,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      // 指定使用平台认证器（人脸、指纹、设备密码）
      authenticatorAttachment: 'platform',
    },
    supportedAlgorithmIDs: [-7, -257],
  }

  const options = await generateRegistrationOptions(opts)
  req.session.currentChallenge = options.challenge
  res.send(options)
})

app.post('/register/verify', async (req, res) => {
  const body: RegistrationResponseJSON = req.body
  const userId = req.session.pendingUserId
  if (!userId) {
    return res.status(400).send({ error: 'No pending registration found' })
  }
  const user = users.get(userId)!
  const expectedChallenge = req.session.currentChallenge

  let verification: VerifiedRegistrationResponse
  try {
    const opts: VerifyRegistrationResponseOpts = {
      response: body,
      expectedChallenge: `${expectedChallenge}`,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
      // SimpleWebAuthn 会自动验证支持的证明格式（packed、fido-u2f、tpm等）
    }
    verification = await verifyRegistrationResponse(opts)
  } catch (err) {
    const _err = err as Error
    console.error(_err)
    return res.status(400).send({ error: _err.message })
  }

  const { verified, registrationInfo } = verification
  if (verified && registrationInfo) {
    const { credential, aaguid, credentialDeviceType, credentialBackedUp } =
      registrationInfo

    const exists = credentialsById.get(credential.id)
    if (!exists) {
      const toStore: StoredCredential = {
        userId: user.id,
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: body.response.transports,
        createdAt: new Date().toISOString(),
        aaguid,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      }
      credentialsById.set(toStore.id, toStore)
      const list = credentialsByUser.get(user.id) || []
      list.push(toStore)
      credentialsByUser.set(user.id, list)
    }
  }

  req.session.currentChallenge = undefined
  req.session.pendingUserId = undefined // 清理临时用户ID
  if (verified) {
    // 注册成功后，直接建立登录态（会话）
    req.session.userId = userId
  }
  res.send({ verified, userId, loggedIn: verified })
})

// 免用户名快捷登录 - 获取 options（不带 allowCredentials）
app.get('/auth/options/quick', async (req, res) => {
  const deviceId = req.headers['x-device-id'] as string

  // 根据设备指纹查找用户
  let allowCredentials: any[] = []
  if (deviceId) {
    const userId = deviceToUser.get(deviceId)
    if (userId) {
      const userCreds = credentialsByUser.get(userId) || []
      allowCredentials = userCreds.map((cred) => ({
        id: cred.id,
        type: 'public-key',
        transports: cred.transports,
      }))
    }
  }

  const opts: GenerateAuthenticationOptionsOpts = {
    timeout: 60000,
    userVerification: 'required',
    rpID,
    // 如果找到用户凭证，则指定 allowCredentials，否则保持为空（usernameless）
    ...(allowCredentials.length > 0 && { allowCredentials }),
  }
  const options = await generateAuthenticationOptions(opts)
  req.session.currentChallenge = options.challenge
  res.send(options)
})

// 免用户名快捷登录 - 校验
app.post('/auth/verify', async (req, res) => {
  const body: AuthenticationResponseJSON = req.body
  const expectedChallenge = req.session.currentChallenge

  // 依据 credentialId 找凭证（对应用户）
  const dbCredential = credentialsById.get(body.id)
  if (!dbCredential) {
    return res.status(400).send({ error: 'Credential not found' })
  }

  let verification: VerifiedAuthenticationResponse
  try {
    const opts: VerifyAuthenticationResponseOpts = {
      response: body,
      expectedChallenge: `${expectedChallenge}`,
      expectedOrigin,
      expectedRPID: rpID,
      credential: dbCredential as WebAuthnCredential,
      requireUserVerification: true,
    }
    verification = await verifyAuthenticationResponse(opts)
  } catch (err) {
    const _err = err as Error
    console.error(_err)
    return res.status(400).send({ error: _err.message })
  }

  const { verified, authenticationInfo } = verification
  if (verified) {
    dbCredential.counter = authenticationInfo.newCounter
    dbCredential.lastUsedAt = new Date().toISOString()
  }

  req.session.currentChallenge = undefined
  if (verified) {
    req.session.userId = dbCredential.userId
  }
  res.send({ verified, userId: dbCredential.userId, loggedIn: verified })
})

http.createServer(app).listen(port, host, () => {
  console.log(`🚀 Example3 server ready at ${expectedOrigin} (${host}:${port})`)
})

// 示例：检查登录态
app.get('/me', (req, res) => {
  if (req.session.userId) {
    return res.send({ loggedIn: true, userId: req.session.userId })
  }
  return res.send({ loggedIn: false })
})

// 注册完成后的登录确认（不触发二次认证）。
// 仅在同一会话内、注册校验成功后可直接确认登录态。
app.post('/auth/login-after-register', (req, res) => {
  if (req.session.userId) {
    return res.send({ loggedIn: true, userId: req.session.userId })
  }
  return res.status(401).send({ loggedIn: false })
})
