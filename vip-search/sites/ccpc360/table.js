/**
 * table.js — 钉钉在线表格写入（ccpc360 商机数据）
 *
 * 将 parser.js 输出的项目数组写入钉钉表格。
 * 表头放第 1 行，新数据从第 2 行顶部插入（旧数据下移，不删除不覆盖）。
 *
 * 导出函数：
 *   ensureSheet(node)      — 检查/创建工作表，返回 sheet-id
 *   initHeader(node, sid)  — 确保表头行正确
 *   insertRows(node, sid, n) — 在第 2 行前插入 n 个空行
 *   writeResults(node, sid, results) — 转 CSV 并写入 A2
 *   writeToTable(results)  — 编排以上步骤
 *   escapeCSV(field)       — RFC 4180 字段转义
 */

import { execSync } from 'child_process';
import fs from 'fs';

// ── 表格配置 ─────────────────────────────────────────────────

/** 钉钉表格文档 node ID */
const TABLE_NODE = 'NZQYprEoWo63ey0ZFB6g36Xa81waOeDk';

/** 工作表名称 */
const SHEET_NAME = 'ccpc360';

/** 表头字段（固定顺序，7 列） */
const TABLE_HEADERS = [
  '项目名称',
  '投资额(万元)',
  '进展阶段',
  '领域类型',
  '地区',
  '发布时间',
  '甲方单位',
];

/** dws 命令超时（秒） */
const DWS_TIMEOUT = 60;

/** 临时 CSV 文件路径 */
const CSV_TMP = '/tmp/vip-search-put.csv';

/** JSON 属性名 → 表头列名的映射 */
const FIELD_MAP = {
  title: '项目名称',
  '投资额': '投资额(万元)',
  '进展阶段': '进展阶段',
  '领域类型': '领域类型',
  '地区': '地区',
  '发布时间': '发布时间',
  '甲方单位': '甲方单位',
};

/** 反向映射：表头列名 → JSON 属性名 */
const HEADER_TO_KEY = {};
for (const [key, header] of Object.entries(FIELD_MAP)) {
  HEADER_TO_KEY[header] = key;
}

// ── 工具函数 ─────────────────────────────────────────────────

/**
 * 执行 dws 命令。
 * 返回 { ok: true, stdout: string } 或 { ok: false, error: string }。
 * 不抛出异常，所有失败由调用方处理。
 */
function dws(cmd) {
  try {
    const stdout = execSync(cmd, {
      timeout: DWS_TIMEOUT * 1000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (err) {
    const msg = err.stderr?.toString().trim() || err.stdout?.toString().trim() || err.message;
    return { ok: false, error: msg };
  }
}

/**
 * RFC 4180 字段转义：
 * 若字段含逗号、双引号、换行符，则用双引号包裹，内部双引号翻倍。
 */
export function escapeCSV(field) {
  const s = String(field);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * 解析 dws sheet list 的 JSON 输出，提取工作表数组。
 * 兼容直接数组和 { items, sheets, ... } 包装格式。
 */
function parseSheetList(stdout) {
  let data;
  try { data = JSON.parse(stdout); } catch { return []; }
  if (Array.isArray(data)) return data;
  return data.items || data.sheets || data.data || [];
}

/**
 * 从工作表对象中提取 sheet-id。
 * 兼容 sheetId / sheet_id / id 三种字段名。
 */
function getSheetId(sheetObj) {
  return sheetObj.sheetId || sheetObj.sheet_id || sheetObj.id || null;
}

// ── 表格操作步骤 ─────────────────────────────────────────────

/**
 * 步骤 1：确保 ccpc360 工作表存在。
 *
 * - 先 `dws sheet list` 查找已有工作表
 * - 未找到则 `dws sheet new` 新建
 * - 返回 sheet-id 字符串，失败返回 null
 */
export function ensureSheet(node = TABLE_NODE) {
  // 列出已有工作表
  const listRes = dws(
    `dws sheet list --node ${node} --format json --timeout ${DWS_TIMEOUT} -y`
  );
  if (!listRes.ok) {
    console.error('[table] 获取工作表列表失败:', listRes.error);
    return null;
  }

  const sheets = parseSheetList(listRes.stdout);

  // 查找同名工作表
  const existing = sheets.find(s => s.name === SHEET_NAME || s.title === SHEET_NAME);
  if (existing) {
    const sid = getSheetId(existing);
    if (sid) {
      console.log(`[table] 找到已有工作表: ${SHEET_NAME} (sheet-id: ${sid})`);
      return sid;
    }
  }

  // 新建工作表
  console.log(`[table] 创建工作表: ${SHEET_NAME}`);
  const newRes = dws(
    `dws sheet new --node ${node} --name "${SHEET_NAME}" --format json --timeout ${DWS_TIMEOUT} -y`
  );
  if (!newRes.ok) {
    console.error('[table] 创建工作表失败:', newRes.error);
    return null;
  }

  // 尝试从响应中提取 sheet-id
  try {
    const newInfo = JSON.parse(newRes.stdout);
    const sid = getSheetId(newInfo);
    if (sid) {
      console.log(`[table] 新建工作表成功: ${SHEET_NAME} (sheet-id: ${sid})`);
      return sid;
    }
  } catch {}

  // 兜底：重新列一下工作表，找到刚建的
  const listRes2 = dws(
    `dws sheet list --node ${node} --format json --timeout ${DWS_TIMEOUT} -y`
  );
  if (listRes2.ok) {
    const sheets2 = parseSheetList(listRes2.stdout);
    const created = sheets2.find(s => s.name === SHEET_NAME || s.title === SHEET_NAME);
    if (created) {
      const sid = getSheetId(created);
      if (sid) {
        console.log(`[table] 确认新建工作表: ${SHEET_NAME} (sheet-id: ${sid})`);
        return sid;
      }
    }
  }

  console.error('[table] 无法获取新工作表的 sheet-id');
  return null;
}

/**
 * 步骤 2：确保表头行正确。
 *
 * - 读 A1:G1，若与 TABLE_HEADERS 完全匹配则跳过
 * - 否则用 csv-put 写入表头
 */
export function initHeader(node, sid) {
  const readRes = dws(
    `dws sheet range read --node ${node} --sheet-id "${sid}" --range A1:G1 --format json --timeout ${DWS_TIMEOUT} -y`
  );

  let headerOk = false;
  if (readRes.ok && readRes.stdout) {
    try {
      const data = JSON.parse(readRes.stdout);
      // 兼容多种响应格式：cells 二维数组 或 values 二维数组
      const rows = data.cells || data.values || data.data || [];
      if (rows.length > 0) {
        const firstRow = rows[0];
        const vals = firstRow.map(c => {
          if (c === null || c === undefined) return '';
          if (typeof c === 'object') return (c.value != null ? String(c.value) : '');
          return String(c);
        });
        if (vals.length === TABLE_HEADERS.length &&
            vals.every((v, i) => v === TABLE_HEADERS[i])) {
          headerOk = true;
        }
      }
    } catch {}
  }

  if (headerOk) {
    console.log('[table] 表头已存在且匹配，跳过写入');
    return true;
  }

  // 写入表头
  console.log('[table] 写入表头行...');
  const headerCSV = TABLE_HEADERS.map(h => escapeCSV(h)).join(',');
  const putRes = dws(
    `dws sheet csv-put --node ${node} --sheet-id "${sid}" --start-cell A1 --csv '${headerCSV}' --timeout ${DWS_TIMEOUT} -y`
  );
  if (!putRes.ok) {
    console.error('[table] 写入表头失败:', putRes.error);
    return false;
  }
  console.log('[table] 表头写入成功');
  return true;
}

/**
 * 步骤 3：在第 2 行之前插入 N 个空行（旧数据下移）。
 *
 * - n <= 0 时直接返回 true（无数据可插入）
 */
export function insertRows(node, sid, n) {
  if (n <= 0) {
    console.log('[table] 数据为空，跳过插入行');
    return true;
  }

  console.log(`[table] 在第 2 行之前插入 ${n} 行...`);
  const res = dws(
    `dws sheet insert-dimension --node ${node} --sheet-id "${sid}" --dimension ROWS --position "2" --length ${n} --timeout ${DWS_TIMEOUT} -y`
  );
  if (!res.ok) {
    console.error('[table] 插入行失败:', res.error);
    return false;
  }
  console.log(`[table] 插入 ${n} 行成功`);
  return true;
}

/**
 * 步骤 4：将结果数组转为 RFC 4180 CSV，写入 A2 起始区域。
 *
 * 字段映射：title → 项目名称，其他属性同名字段直取，缺失填空字符串。
 */
export function writeResults(node, sid, results) {
  if (!results || results.length === 0) {
    console.log('[table] 无数据可写入');
    return true;
  }

  // 构建 CSV 行
  const lines = [];
  for (const item of results) {
    const cells = TABLE_HEADERS.map(header => {
      const key = HEADER_TO_KEY[header];
      const val = key ? (item[key] != null ? item[key] : '') : '';
      return escapeCSV(String(val));
    });
    lines.push(cells.join(','));
  }
  const csv = lines.join('\n');

  // 写入临时文件
  fs.writeFileSync(CSV_TMP, csv, 'utf-8');
  console.log(`[table] CSV 已写入临时文件: ${CSV_TMP} (${results.length} 行)`);

  // 用 csv-put 写入表格
  const putRes = dws(
    `dws sheet csv-put --node ${node} --sheet-id "${sid}" --start-cell A2 --csv @${CSV_TMP} --timeout ${DWS_TIMEOUT} -y`
  );
  if (putRes.ok) {
    console.log(`[table] 成功写入 ${results.length} 条数据`);
    return true;
  }

  // 首次失败，加 --allow-overwrite 重试
  console.warn('[table] csv-put 失败，尝试 --allow-overwrite 重试...');
  const retryRes = dws(
    `dws sheet csv-put --node ${node} --sheet-id "${sid}" --start-cell A2 --csv @${CSV_TMP} --allow-overwrite --timeout ${DWS_TIMEOUT} -y`
  );
  if (!retryRes.ok) {
    console.error('[table] csv-put 重试也失败:', retryRes.error);
    return false;
  }
  console.log(`[table] 成功写入 ${results.length} 条数据（--allow-overwrite）`);
  return true;
}

// ── 编排入口 ─────────────────────────────────────────────────

/**
 * 将搜索结果写入钉钉在线表格的完整流程。
 *
 * 步骤：
 *   1. ensureSheet — 检查/创建工作表，获取 sheet-id
 *   2. initHeader  — 确保表头行正确
 *   3. insertRows  — 在位置 2 插入空行（数据为空时跳过）
 *   4. writeResults — 将 CSV 数据写入 A2
 *
 * 所有步骤失败仅打印错误并返回 false，不抛出异常。
 * 调用方应将此视为非关键路径（搜索依然成功）。
 *
 * @param {object[]} results - 解析后的项目数组
 * @returns {boolean} 是否写入成功
 */
export function writeToTable(results) {
  console.log(`\n[table] ===== 开始写入钉钉在线表格 =====`);
  console.log(`[table] 数据条数: ${results ? results.length : 0}`);

  if (!results || results.length === 0) {
    console.log('[table] 无数据，跳过表格写入');
    return true; // 不算失败
  }

  // 1. 确保工作表存在
  const sid = ensureSheet(TABLE_NODE);
  if (!sid) {
    console.error('[table] 无法获取/创建工作表，写入中止');
    return false;
  }

  // 2. 初始化表头
  if (!initHeader(TABLE_NODE, sid)) {
    console.error('[table] 表头初始化失败，写入中止');
    return false;
  }

  // 3. 插入空行
  if (!insertRows(TABLE_NODE, sid, results.length)) {
    console.error('[table] 插入行失败，写入中止');
    return false;
  }

  // 4. 写入数据
  if (!writeResults(TABLE_NODE, sid, results)) {
    console.error('[table] 数据写入失败');
    return false;
  }

  console.log(`[table] ===== 表格写入完成 =====\n`);
  return true;
}
