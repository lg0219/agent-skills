/**
 * captcha.js — 验证码协作模式
 *
 * 接口约定（与外部人工 / vision 识别协作）：
 * 1. 调用方先截图验证码到 /tmp/ccpc-captcha-live.png
 * 2. 调用 saveAndSignal() 输出 "CAPTCHA_READY"
 * 3. 调用 waitForAnswer() 轮询 /tmp/captcha_answer.txt（每 1s，最多 90s）
 * 4. 读到答案后删除答案文件，返回字符串
 * 5. 超时返回 null，调用方打印 "NO_ANSWER" 并退出
 *
 * 这是与外部人工识别协作的标准接口，请勿修改路径。
 */

import fs from 'fs';
import path from 'path';

export const CAPTCHA_IMG = '/tmp/ccpc-captcha-live.png';
export const ANSWER_FILE = '/tmp/captcha_answer.txt';

/**
 * 清理旧的答案文件（每次登录前调用）
 */
export function clearAnswer() {
  try { fs.unlinkSync(ANSWER_FILE); } catch {}
}

/**
 * 截图验证码元素并输出 CAPTCHA_READY 信号
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} captchaLocator - 验证码图片 locator
 */
export async function saveAndSignal(page, captchaLocator) {
  await captchaLocator.screenshot({ path: CAPTCHA_IMG });
  console.log('CAPTCHA_READY');
}

/**
 * 轮询等待答案文件（最长 waitSec 秒）
 * @param {number} [waitSec=90]
 * @returns {Promise<string|null>} 答案字符串，超时返回 null
 */
export async function waitForAnswer(waitSec = 90) {
  for (let i = 0; i < waitSec; i++) {
    try {
      if (fs.existsSync(ANSWER_FILE)) {
        const captcha = fs.readFileSync(ANSWER_FILE, 'utf-8').trim();
        if (captcha) {
          // 读取成功后删除答案文件
          try { fs.unlinkSync(ANSWER_FILE); } catch {}
          return captcha;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}
