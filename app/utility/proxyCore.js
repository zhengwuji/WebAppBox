// 代理核心（纯 Node 实现，不依赖 Electron，可独立运行测试）
// - SOCKS5 客户端：支持用户名/密码认证（RFC 1928 / RFC 1929）
// - HTTP 代理 CONNECT 客户端：支持 Basic 认证
// - 本地 SOCKS5 中继：Chromium 原生不支持带认证的 SOCKS5，由中继补齐
// - 连通性测试：返回出口 IP / 国家 / 城市 / ISP / 延迟
import net from 'net'

const TEST_HOST = 'ip-api.com'
const TEST_PATH = '/json/?fields=status,message,query,country,countryCode,city,isp'
const CONNECT_TIMEOUT = 10000

const SOCKS_ERRORS = {
  1: 'SOCKS 通用失败',
  2: 'SOCKS 不允许连接',
  3: 'SOCKS 网络不可达',
  4: 'SOCKS 目标不可达',
  5: 'SOCKS 连接被拒绝',
  6: 'SOCKS TTL 超时',
  7: 'SOCKS 命令不支持',
  8: 'SOCKS 地址类型不支持',
}

/**
 * 规范化代理配置
 * @param {{type?:string, host?:string, port?:number|string, username?:string, password?:string}} config
 * @returns {{type:string, host:string, port:number, username:string, password:string}|null}
 */
export function normalizeProxy(config) {
  if (!config || typeof config !== 'object') return null
  const type = String(config.type || '').toLowerCase()
  if (type !== 'socks5' && type !== 'http') return null
  const host = String(config.host || '').trim()
  const port = parseInt(config.port, 10)
  if (!host || !port || port <= 0 || port > 65535) return null
  return {
    type,
    host,
    port,
    username: String(config.username || ''),
    password: String(config.password || ''),
  }
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** 裸 TCP 连接（带超时） */
function tcpConnect(host, port, timeout = CONNECT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`连接 ${host}:${port} 超时`))
    }, timeout)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/** 从 socket 精确读取 n 字节 */
function readExact(socket, n, timeout = CONNECT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('读取代理响应超时'))
    }, timeout)
    const cleanup = () => {
      clearTimeout(timer)
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      socket.removeListener('close', onClose)
    }
    let buf = Buffer.alloc(0)
    const onData = (chunk) => {
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk])
      if (buf.length >= n) {
        const rest = buf.subarray(n)
        const out = buf.subarray(0, n)
        cleanup()
        socket.pause()
        if (rest.length > 0) socket.unshift(rest)
        resolve(out)
      }
    }
    const onError = (err) => { cleanup(); reject(err) }
    const onClose = () => { cleanup(); reject(new Error('代理连接被关闭')) }
    socket.on('data', onData)
    socket.on('error', onError)
    socket.on('close', onClose)
    if (buf.length === 0) socket.resume()
    else onData(Buffer.alloc(0))
  })
}

/** SOCKS5 握手 + CONNECT，成功返回可用的透传 socket */
export async function socks5Connect(config, targetHost, targetPort) {
  const cfg = normalizeProxy(config)
  if (!cfg || cfg.type !== 'socks5') throw new Error('无效的 SOCKS5 配置')

  const socket = await tcpConnect(cfg.host, cfg.port)

  // 1. 握手：声明支持的认证方式
  const methods = cfg.username ? [0x00, 0x02] : [0x00]
  socket.write(Buffer.from([0x05, methods.length, ...methods]))
  const greet = await readExact(socket, 2)
  if (greet[0] !== 0x05) throw new Error('不是 SOCKS5 代理')
  const method = greet[1]
  if (method === 0xff) throw new Error('代理要求的认证方式不受支持')
  if (method === 0x02) {
    if (!cfg.username) throw new Error('代理需要用户名密码认证')
    const u = Buffer.from(cfg.username, 'utf8')
    const p = Buffer.from(cfg.password, 'utf8')
    if (u.length > 255 || p.length > 255) throw new Error('用户名或密码过长')
    socket.write(Buffer.from([0x01, u.length, ...u, p.length, ...p]))
    const auth = await readExact(socket, 2)
    if (auth[1] !== 0x00) throw new Error('代理认证失败（用户名或密码错误）')
  }

  // 2. CONNECT 请求（域名直接交给上游解析，避免本地 DNS 泄漏）
  let atyp, addrBytes
  const ipv4 = targetHost.match(IPV4_RE)
  if (ipv4) {
    atyp = 0x01
    addrBytes = Buffer.from(ipv4.slice(1).map(Number))
  } else {
    atyp = 0x03
    const d = Buffer.from(targetHost, 'utf8')
    if (d.length > 255) throw new Error('目标域名过长')
    addrBytes = Buffer.concat([Buffer.from([d.length]), d])
  }
  const req = Buffer.alloc(6 + addrBytes.length)
  req[0] = 0x05; req[1] = 0x01; req[2] = 0x00; req[3] = atyp
  addrBytes.copy(req, 4)
  req.writeUInt16BE(targetPort, 4 + addrBytes.length)
  socket.write(req)

  // 3. 响应：VER REP RSV ATYP ADDR(变长) PORT（应答头固定 4 字节，地址长度由 ATYP 决定）
  const head = await readExact(socket, 4)
  if (head[1] !== 0x00) throw new Error(SOCKS_ERRORS[head[1]] || `SOCKS 失败(${head[1]})`)
  const ratyp = head[3]
  let alen
  if (ratyp === 0x01) alen = 4
  else if (ratyp === 0x04) alen = 16
  else alen = (await readExact(socket, 1))[0]
  await readExact(socket, alen + 2)
  socket.resume()
  return socket
}

/** HTTP 代理 CONNECT 隧道，成功返回可用的透传 socket */
export async function httpProxyConnect(config, targetHost, targetPort) {
  const cfg = normalizeProxy(config)
  if (!cfg || cfg.type !== 'http') throw new Error('无效的 HTTP 代理配置')

  const socket = await tcpConnect(cfg.host, cfg.port)
  const lines = [
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
    `Host: ${targetHost}:${targetPort}`,
  ]
  if (cfg.username) {
    const cred = Buffer.from(`${cfg.username}:${cfg.password}`, 'utf8').toString('base64')
    lines.push(`Proxy-Authorization: Basic ${cred}`)
  }
  socket.write(lines.join('\r\n') + '\r\n\r\n')

  // 逐字节读到 \r\n\r\n（防止把隧道首字节吞掉）
  let head = Buffer.alloc(0)
  while (true) {
    const idx = head.indexOf('\r\n\r\n')
    if (idx !== -1) {
      const rest = head.subarray(idx + 4)
      if (rest.length > 0) socket.unshift(rest)
      head = head.subarray(0, idx)
      break
    }
    let chunk
    try {
      chunk = await readExact(socket, 1)
    } catch (e) {
      throw new Error('代理连接被关闭')
    }
    head = Buffer.concat([head, chunk])
    if (head.length > 16 * 1024) throw new Error('代理响应异常')
  }
  const statusLine = head.toString('utf8').split('\r\n')[0] || ''
  const code = parseInt(statusLine.split(' ')[1], 10)
  if (code === 407) throw new Error('代理认证失败（用户名或密码错误）')
  if (code !== 200) throw new Error(`代理返回 ${code || statusLine || '空响应'}`)
  socket.resume()
  return socket
}

/** 通过已建立的隧道发送 HTTP GET 并收集完整响应体 */
function httpGetOverTunnel(socket, host, path) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('请求出口信息超时'))
    }, CONNECT_TIMEOUT)
    let body = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => { body += chunk })
    socket.once('error', (err) => { clearTimeout(timer); reject(err) })
    socket.once('close', () => {
      clearTimeout(timer)
      const idx = body.indexOf('\r\n\r\n')
      resolve(idx === -1 ? '' : body.substring(idx + 4))
    })
    socket.write(
      `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: webappbox-proxy-test\r\nConnection: close\r\n\r\n`
    )
  })
}

/**
 * 测试代理连通性：经代理访问 ip-api.com，返回出口 IP / 国家 / 城市 / ISP / 延迟
 * @returns {Promise<{ok:boolean, ip?:string, country?:string, countryCode?:string, city?:string, isp?:string, latencyMs?:number, error?:string}>}
 */
export async function testProxy(config) {
  const started = Date.now()
  try {
    const cfg = normalizeProxy(config)
    if (!cfg) return { ok: false, error: '代理配置不完整（类型仅支持 socks5 / http）' }
    const connect = cfg.type === 'socks5' ? socks5Connect : httpProxyConnect
    const socket = await connect(cfg, TEST_HOST, 80)
    const body = await httpGetOverTunnel(socket, TEST_HOST, TEST_PATH)
    socket.destroy()
    let json
    try { json = JSON.parse(body.trim()) } catch { return { ok: false, error: '出口信息响应异常' } }
    if (json.status === 'fail') return { ok: false, error: json.message || '出口信息查询失败' }
    return {
      ok: true,
      ip: json.query,
      country: json.country,
      countryCode: json.countryCode,
      city: json.city,
      isp: json.isp,
      latencyMs: Date.now() - started,
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
}

// ─────────────────────────────────────────────
// 本地 SOCKS5 中继池
// Chromium 的代理规则不支持 SOCKS5 认证，因此带认证（或统一处理 DNS）的
// SOCKS5 上游一律经由本地无认证中继：Electron → 127.0.0.1 中继 → 上游。
// ─────────────────────────────────────────────

const relayPool = new Map() // key → { server, port, upstream }

/** SOCKS5 握手阶段（本地中继侧，仅接受无认证） */
function relayHandshake(client) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0)
    const fail = (err) => { cleanup(); reject(err) }
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      // greeting: VER NMETHODS METHODS...
      if (buf.length >= 2 && buf.length >= 2 + buf[1]) {
        if (buf[0] !== 0x05) return fail(new Error('非 SOCKS5 协议'))
        const methods = buf.subarray(2, 2 + buf[1])
        const wantNoAuth = methods.includes(0x00)
        if (!wantNoAuth) {
          client.write(Buffer.from([0x05, 0xff]))
          return fail(new Error('客户端未提供无认证方式'))
        }
        buf = buf.subarray(2 + buf[1])
        client.write(Buffer.from([0x05, 0x00]))
        client.removeListener('data', onData)
        client.removeListener('error', onError)
        client.removeListener('close', onClose)
        resolve(buf) // 返回剩余缓冲（可能已包含 CONNECT 请求开头）
      }
    }
    const onError = (err) => fail(err)
    const onClose = () => fail(new Error('客户端连接被关闭'))
    const cleanup = () => {
      client.removeListener('data', onData)
      client.removeListener('error', onError)
      client.removeListener('close', onClose)
    }
    client.on('data', onData)
    client.on('error', onError)
    client.on('close', onClose)
  })
}

/** 解析 SOCKS5 CONNECT 请求，返回 {host, port, rest} */
function parseConnectRequest(buf) {
  // VER CMD RSV ATYP ADDR PORT
  if (buf.length < 5) return null
  const atyp = buf[3]
  let addrLen, host
  if (atyp === 0x01) {
    if (buf.length < 10) return null
    host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`
    return { host, port: buf.readUInt16BE(8), rest: buf.subarray(10) }
  }
  if (atyp === 0x03) {
    addrLen = buf[4]
    if (buf.length < 7 + addrLen) return null
    host = buf.subarray(5, 5 + addrLen).toString('utf8')
    return { host, port: buf.readUInt16BE(5 + addrLen), rest: buf.subarray(7 + addrLen) }
  }
  if (atyp === 0x04) {
    if (buf.length < 22) return null
    const parts = []
    for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(4 + i).toString(16))
    host = parts.join(':')
    return { host, port: buf.readUInt16BE(20), rest: buf.subarray(22) }
  }
  throw new Error('不支持的目标地址类型')
}

function createRelayServer(upstream) {
  return net.createServer((client) => {
    client.on('error', () => {})
    relayHandshake(client)
      .then((rest) => {
        // 可能一次收到完整请求，也可能需要继续读
        const tryParse = (acc) => {
          let req
          try { req = parseConnectRequest(acc) } catch { return client.destroy() }
          if (!req) {
            client.once('data', (chunk) => tryParse(Buffer.concat([acc, chunk])))
            return
          }
          if (req.rest.length > 0) client.unshift(req.rest)
          socks5Connect(upstream, req.host, req.port)
            .then((remote) => {
              remote.on('error', () => client.destroy())
              client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
              client.pipe(remote)
              remote.pipe(client)
            })
            .catch(() => {
              // 上游失败：以连接失败码回应后断开
              client.end(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
            })
        }
        tryParse(rest)
      })
      .catch(() => client.destroy())
  })
}

/**
 * 获取（或创建）某个上游对应的本地中继端口
 * @returns {number} 本地中继监听端口
 */
export function getRelayPort(upstream) {
  const cfg = normalizeProxy(upstream)
  if (!cfg || cfg.type !== 'socks5') throw new Error('仅 SOCKS5 需要中继')
  const key = `${cfg.host}|${cfg.port}|${cfg.username}|${cfg.password}`
  let relay = relayPool.get(key)
  if (!relay) {
    const server = createRelayServer(cfg)
    server.listen(0, '127.0.0.1')
    relay = { server, port: server.address().port, upstream: cfg }
    relayPool.set(key, relay)
  }
  return relay.port
}

/** 关闭全部中继（退出前调用） */
export function closeAllRelays() {
  for (const relay of relayPool.values()) {
    try { relay.server.close() } catch { /* 忽略 */ }
  }
  relayPool.clear()
}
