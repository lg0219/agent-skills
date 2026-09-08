/**
 * config.js — 中项网（ccpc360）站点配置
 *
 * 包含：选择器、路由、账号读取逻辑
 * 账号优先从 config.json 读取，留空时回退到环境变量 CCPC_USER / CCPC_PASS
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 站点名称 */
export const name = 'ccpc360';

/** 站点标签 */
export const label = '中项网 VIP';

/** 登录页 URL */
export const loginUrl = 'https://vip.ccpc360.com/#/login';

/** 搜索结果页路由 */
export const searchRoute = 'https://vip.ccpc360.com/#/projectQuery/searchItems';

/** 页面选择器 */
export const selectors = {
  // 登录页
  username: 'input[name="username"]',
  password: 'input[name="password"]',
  captchaImg: '.el-input-group__append img:visible',   // 验证码图（2026-09-07 改版修复：blob 图在输入框 append 区，需 :visible 过滤隐藏 tab）
  captchaInput: 'input[placeholder="请输入右侧校验码"]:visible',  // 校验码输入框（密码登录 tab，排除隐藏的验证码登录 tab）
  protocolCheckbox: 'input[type="checkbox"]',
  loginBtn: 'button:has-text("马上登录")',

  // 搜索页
  keywordInput: 'input[placeholder*="关键词"]',
  searchBtn: 'button:has-text("搜 索"), button:has-text("搜索")',
  pagination: '.el-pagination',
  nextPage: '.el-pagination button:has-text("下一页"), .el-pagination .btn-next',
};

/** 搜索后等待时间 (ms) */
export const SEARCH_WAIT_MS = 10000;

/** 翻页后等待时间 (ms) */
export const PAGE_WAIT_MS = 6000;

/**
 * 读取账号配置
 * 优先读取 config.json（username/password），为空时从环境变量 CCPC_USER / CCPC_PASS 获取
 * @returns {{username: string, password: string}}
 */
export function getCredentials() {
  let username = '';
  let password = '';

  // 尝试读取 config.json
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const cfg = JSON.parse(raw);
      username = cfg.username || '';
      password = cfg.password || '';
    }
  } catch {}

  // 回退到环境变量
  if (!username) username = process.env.CCPC_USER || '';
  if (!password) password = process.env.CCPC_PASS || '';

  return { username, password };
}
