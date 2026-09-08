/**
 * session.js — 浏览器 profile 管理、弹窗清理、登录态判断
 *
 * 职责：
 * - 启动持久化浏览器 context（复用 profile 中的 cookie/localStorage）
 * - 清理登录后弹窗遮罩（微信订阅助手等 Element UI 弹窗）
 * - 判断当前是否已登录
 */

import { chromium } from 'playwright';

/** 持久化 profile 目录 */
export const PROFILE_DIR = '/root/.openclaw/douyin-creator-tools/.playwright/douyin-profile';

/** 浏览器启动默认参数 */
export const LAUNCH_OPTS = {
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  viewport: { width: 1440, height: 900 },
};

/**
 * 启动持久化浏览器 context 并返回首个 page
 */
export async function launchBrowser() {
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, LAUNCH_OPTS);
  const page = browser.pages()[0] || await browser.newPage();
  return { browser, page };
}

/**
 * 移除 Element UI 弹窗遮罩（登录后、搜索前必须调用）
 * 目标：.el-dialog__wrapper / .el-message-box__wrapper / .v-modal / .el-overlay
 */
export async function dismissModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll(
      '.el-dialog__wrapper, .el-message-box__wrapper, .v-modal, .el-overlay'
    ).forEach(d => d.remove());
  });
}

/**
 * 判断当前 page.url() 是否为已登录状态（不含 'login'）
 */
export function isLoggedIn(page) {
  return !page.url().includes('login');
}
