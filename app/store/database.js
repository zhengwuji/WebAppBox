import initSqlJs from 'sql.js'
import fs from 'fs'

let db = null
let dbPath = ''
let sqlJsReady = false

// 高频写（剪贴板监控等）只标记脏位，按 FLUSH_DELAY 合并落盘
const FLUSH_DELAY = 3000
let dirty = false
let flushTimer = null

/**
 * 初始化 sql.js 数据库
 * @param {string} filePath - 数据库文件路径
 */
export async function initDatabase(filePath) {
  if (sqlJsReady) return

  const SQL = await initSqlJs()

  // 尝试加载已有数据库
  let buffer
  try {
    buffer = fs.readFileSync(filePath)
  } catch {
    buffer = null
  }

  db = buffer ? new SQL.Database(buffer) : new SQL.Database()
  dbPath = filePath
  sqlJsReady = true
}

/**
 * 获取当前数据库实例
 * @returns {import('sql.js').Database}
 */
export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

/**
 * 标记脏数据，由定时器按 FLUSH_DELAY 合并落盘
 */
export function persistSync() {
  if (!db || !dbPath) return
  dirty = true
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushDatabase()
  }, FLUSH_DELAY)
}

/**
 * 立即将数据库写入磁盘（写临时文件后原子替换）
 */
export function flushDatabase() {
  if (!db || !dbPath || !dirty) return
  const tmpPath = dbPath + '.tmp'
  try {
    fs.writeFileSync(tmpPath, Buffer.from(db.export()))
    fs.renameSync(tmpPath, dbPath)
    dirty = false
  } catch (e) {
    console.error('数据库落盘失败:', e)
  }
}

/**
 * 关闭数据库
 */
export function closeDatabase() {
  if (db) {
    flushDatabase()
    db.close()
    db = null
    sqlJsReady = false
  }
}
