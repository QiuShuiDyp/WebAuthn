# WebAuthn 接口文档

## 概述

本文档描述了 SimpleWebAuthn Example3 项目的 RESTful API 接口。该项目实现了基于 WebAuthn 的无密码认证系统，支持一键登录/注册功能。

## 服务配置

- **服务地址**: `http://127.0.0.1:8002`
- **前端地址**: `http://localhost:5173` (Vite 开发服务器)
- **RP ID**: `localhost`
- **会话管理**: Express Session + MemoryStore

## 通用说明

### 请求头

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| Content-Type | string | 是 | `application/json` |
| X-Device-ID | string | 否 | 设备指纹ID，用于用户关联 |

### 响应格式

所有接口均返回 JSON 格式数据，包含以下通用字段：

```json
{
  "verified": boolean,    // 验证是否成功
  "userId": string,       // 用户ID（成功时返回）
  "loggedIn": boolean,    // 登录状态（部分接口返回）
  "error": string         // 错误信息（失败时返回）
}
```

---

## 认证相关接口

### 1. 获取快捷登录选项

**接口地址**: `GET /auth/options/quick`

**功能描述**: 获取WebAuthn认证选项，支持免用户名快捷登录

**请求参数**:
- Header: `X-Device-ID` (可选) - 设备指纹ID

**响应示例**:
```json
{
  "challenge": "string",
  "timeout": 60000,
  "rpId": "localhost",
  "userVerification": "required",
  "allowCredentials": [
    {
      "id": "string",
      "type": "public-key",
      "transports": ["internal", "hybrid"]
    }
  ]
}
```

**业务逻辑**:
- 如果提供设备ID且找到关联用户，返回该用户的凭证列表
- 如果未找到关联用户，返回空的 `allowCredentials`（支持无用户名登录）
- 生成的 `challenge` 会存储在会话中用于后续验证

---

### 2. 验证认证响应

**接口地址**: `POST /auth/verify`

**功能描述**: 验证WebAuthn认证响应，完成登录流程

**请求体**:
```json
{
  "id": "string",
  "rawId": "string",
  "response": {
    "authenticatorData": "string",
    "clientDataJSON": "string",
    "signature": "string"
  },
  "type": "public-key"
}
```

**响应示例**:
```json
{
  "verified": true,
  "userId": "user-1703123456789-abc123",
  "loggedIn": true
}
```

**业务逻辑**:
- 根据 `credentialId` 查找存储的凭证信息
- 验证认证响应的有效性
- 验证成功后建立用户会话，更新凭证使用计数器

**错误响应**:
```json
{
  "error": "Credential not found"
}
```

---

## 注册相关接口

### 3. 获取注册选项

**接口地址**: `GET /register/options`

**功能描述**: 获取WebAuthn注册选项，用于创建新凭证

**请求参数**:
- Header: `X-Device-ID` (可选) - 设备指纹ID

**响应示例**:
```json
{
  "rp": {
    "name": "SimpleWebAuthn Example3",
    "id": "localhost"
  },
  "user": {
    "id": "string",
    "name": "user@example.com",
    "displayName": "user@example.com"
  },
  "challenge": "string",
  "pubKeyCredParams": [
    {
      "alg": -7,
      "type": "public-key"
    },
    {
      "alg": -257,
      "type": "public-key"
    }
  ],
  "timeout": 60000,
  "attestation": "none",
  "excludeCredentials": [],
  "authenticatorSelection": {
    "residentKey": "required",
    "userVerification": "required"
  }
}
```

**业务逻辑**:
- 检查设备指纹是否已关联用户，复用已有用户ID
- 如果是新设备，生成新用户ID并关联设备指纹
- 排除用户已有的凭证，避免重复注册
- 要求创建可发现凭证（`residentKey: required`）

---

### 4. 验证注册响应

**接口地址**: `POST /register/verify`

**功能描述**: 验证WebAuthn注册响应，存储新凭证

**请求体**:
```json
{
  "id": "string",
  "rawId": "string",
  "response": {
    "attestationObject": "string",
    "clientDataJSON": "string",
    "transports": ["internal", "hybrid"]
  },
  "type": "public-key"
}
```

**响应示例**:
```json
{
  "verified": true,
  "userId": "user-1703123456789-abc123",
  "loggedIn": true
}
```

**业务逻辑**:
- 验证注册响应的有效性
- 存储新凭证到内存数据库
- 注册成功后自动建立用户会话
- 清理临时会话数据

**错误响应**:
```json
{
  "error": "No pending registration found"
}
```

---

## 会话管理接口

### 5. 检查登录状态

**接口地址**: `GET /me`

**功能描述**: 检查当前用户的登录状态

**响应示例**:
```json
{
  "loggedIn": true,
  "userId": "user-1703123456789-abc123"
}
```

**未登录时**:
```json
{
  "loggedIn": false
}
```

---

### 6. 注册后登录确认

**接口地址**: `POST /auth/login-after-register`

**功能描述**: 注册完成后确认登录状态，无需二次认证

**响应示例**:
```json
{
  "loggedIn": true,
  "userId": "user-1703123456789-abc123"
}
```

**业务逻辑**:
- 仅在同一会话内、注册验证成功后可调用
- 直接返回当前会话的登录状态
- 用于前端确认注册后的登录状态

**错误响应**:
```json
{
  "loggedIn": false
}
```

---

## 数据结构

### User
```typescript
interface User {
  id: string;        // 用户唯一标识
  username: string;  // 用户名（固定为 user@example.com）
}
```

### StoredCredential
```typescript
interface StoredCredential {
  userId: string;           // 关联的用户ID
  id: string;              // 凭证ID
  publicKey: Uint8Array;   // 公钥
  counter: number;         // 使用计数器
  transports?: string[];   // 传输方式
  createdAt: string;       // 创建时间
  lastUsedAt?: string;     // 最后使用时间
  aaguid?: string;         // 认证器GUID
  deviceType?: string;     // 设备类型
  backedUp?: boolean;      // 是否备份
}
```

---

## 错误码说明

| HTTP状态码 | 错误类型 | 说明 |
|-----------|----------|------|
| 400 | Bad Request | 请求参数错误或验证失败 |
| 401 | Unauthorized | 未授权访问 |
| 500 | Internal Server Error | 服务器内部错误 |

## 典型业务流程

### 一键登录流程
1. `GET /auth/options/quick` - 获取认证选项
2. 前端调用 WebAuthn API 进行用户验证
3. `POST /auth/verify` - 验证认证响应
4. 登录成功，建立会话

### 注册流程
1. `GET /register/options` - 获取注册选项
2. 前端调用 WebAuthn API 创建凭证
3. `POST /register/verify` - 验证注册响应
4. `POST /auth/login-after-register` - 确认登录状态

### 设备指纹机制
- 前端生成设备指纹ID并通过请求头传递
- 服务端维护设备指纹到用户ID的映射关系
- 支持同设备跨会话的用户识别

---

## 安全考虑

1. **Challenge 验证**: 每次认证/注册都使用一次性 challenge
2. **Origin 验证**: 严格验证请求来源
3. **用户验证**: 要求用户进行生物识别验证
4. **凭证排除**: 注册时排除已有凭证，防止重复
5. **会话管理**: 使用安全的会话配置，包含 httpOnly cookie

## 注意事项

- 当前使用内存存储，生产环境需要替换为持久化数据库
- 设备指纹仅用于用户体验优化，不作为安全凭证
- 支持多设备多凭证场景
- 兼容 WebAuthn Level 2 规范
