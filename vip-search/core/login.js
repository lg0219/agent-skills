/**
 * login.js — 通用登录器
 *
 * 使用站点配置中的选择器执行登录流程：
 * - 支持验证码协作模式（截图 + 轮询答案文件）
 * - 最多重试 3 次
 * - 每次重试重新截图验证码
 *
 * @param {import('playwright').Page} page
 * @param {object} siteConfig - 站点配置对象（来自 sites/<site>/config.js）
 * @returns {Promise<boolean>} 是否登录成功
 */

import * as captcha from './captcha.js';

/**
 * 执行登录（最多 3 次尝试）
 *
 * @param {import('playwright').Page} page
 * @param {object} cfg - 站点配置
 * @param {string} cfg.loginUrl - 登录页 URL
 * @param {object} cfg.selectors - 选择器映射
 * @param {string} cfg.selectors.username - 账号输入框选择器
 * @param {string} cfg.selectors.password - 密码输入框选择器
 * @param {string} cfg.selectors.captchaImg - 验证码图片选择器
 * @param {string} cfg.selectors.captchaInput - 验证码输入框选择器
 * @param {string} cfg.selectors.protocolCheckbox - 协议勾选框选择器
 * @param {string} cfg.selectors.loginBtn - 登录按钮选择器
 * @param {object} credentials - { username, password }
 * @param {string} credentials.username
 * @param {string} credentials.password
 * @returns {Promise<boolean>}
 */
export async function login(page, cfg, credentials) {
  const { username, password } = credentials;
  if (!username || !password) {
    console.error('缺少账号密码：请在 sites/<site>/config.json 填写或设置环境变量');
    return false;
  }

  captcha.clearAnswer();

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[login] attempt ${attempt}/3`);

    // 导航到登录页
    await page.goto(cfg.loginUrl, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(2500);

    // 如果导航后已不在登录页，说明已登录
    if (!page.url().includes('login')) {
      console.log('[login] already logged in');
      return true;
    }

    // 填写账号密码
    await page.locator(cfg.selectors.username).fill(username);
    await page.locator(cfg.selectors.password).fill(password);

    // 截图验证码
    const captchaEl = page.locator(cfg.selectors.captchaImg);
    await captcha.saveAndSignal(page, captchaEl);

    // 等待外部填入答案
    const answer = await captcha.waitForAnswer(90);
    if (!answer) {
      console.log('NO_ANSWER');
      return false;
    }
    console.log(`[login] using captcha: ${answer}`);

    // 填入验证码
    await page.locator(cfg.selectors.captchaInput).fill(answer);

    // 勾选协议（JS 强制勾选，正常 click 会被拦截）
    try {
      await page.evaluate(() => {
        const cb = document.querySelector('input[type="checkbox"]');
        if (cb) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    } catch {}

    // 点击登录
    await page.locator(cfg.selectors.loginBtn).click();
    await page.waitForTimeout(7000);

    // 检查结果
    const url = page.url();
    console.log(`[login] URL after login: ${url}`);
    if (!url.includes('login')) {
      console.log('[login] success');
      return true;
    }

    // 收集错误提示
    try {
      const errors = await page.evaluate(() =>
        [...document.querySelectorAll('.el-message, .el-notification, [class*="toast"], [class*="error"], [class*="message"]')]
          .map(e => (e.textContent || '').trim())
          .filter(t => t && t.length < 100)
      );
      if (errors.length) console.log('[login] error hints:', JSON.stringify(errors));
    } catch {}
  }

  console.log('[login] all attempts failed');
  return false;
}
