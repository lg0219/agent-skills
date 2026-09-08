/**
 * search.js — 中项网搜索 + 翻页（核心业务）
 *
 * 流程：
 * 1. 导航到搜索结果页 (#/projectQuery/searchItems)
 * 2. 填入关键词，点击搜索
 * 3. 逐页抓取 innerText
 * 4. 可选翻页（--pages N）
 */

import * as cfg from './config.js';

/**
 * 执行搜索并抓取页面文本
 *
 * @param {import('playwright').Page} page
 * @param {string} keyword - 搜索关键词
 * @param {number} [maxPages=1] - 最大翻页数（1 表示只抓首页）
 * @returns {Promise<{pages: string[], totalPages: number}>}
 *   pages: 每页的 innerText 文本数组
 *   totalPages: 实际抓取的页数
 */
export async function searchAndFetch(page, keyword, maxPages = 1) {
  // 1. 导航到搜索页
  console.log(`[search] 导航到搜索页: ${cfg.searchRoute}`);
  await page.goto(cfg.searchRoute, { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(4000);

  // 2. 填入关键词
  const kwInput = page.locator(cfg.selectors.keywordInput).first();
  await kwInput.fill(keyword);
  await page.waitForTimeout(500);

  // 3. 点击搜索
  const searchBtn = page.locator(cfg.selectors.searchBtn).first();
  await searchBtn.click();
  console.log(`[search] 已点击搜索，等待 ${cfg.SEARCH_WAIT_MS}ms...`);
  await page.waitForTimeout(cfg.SEARCH_WAIT_MS);

  // 4. 提取首页文本
  const pages = [];
  const body1 = await page.evaluate(() => document.body.innerText);
  pages.push(body1);

  // 统计行信息
  const statsLine = body1.split('\n').find(l => l.includes('条项目信息'));
  if (statsLine) {
    console.log(`[search] 统计: ${statsLine.trim()}`);
  }

  // 5. 翻页
  let currentPage = 1;
  while (currentPage < maxPages) {
    // 点击下一页
    try {
      const nextBtn = page.locator(cfg.selectors.nextPage).first();
      const hasNext = await nextBtn.count();
      if (!hasNext) {
        console.log('[search] 未找到下一页按钮，停止翻页');
        break;
      }

      const isDisabled = await nextBtn.evaluate(el =>
        el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true'
      );
      if (isDisabled) {
        console.log('[search] 下一页按钮已禁用，停止翻页');
        break;
      }

      await nextBtn.click();
      currentPage++;
      console.log(`[search] 翻到第 ${currentPage} 页，等待 ${cfg.PAGE_WAIT_MS}ms...`);
      await page.waitForTimeout(cfg.PAGE_WAIT_MS);

      const body = await page.evaluate(() => document.body.innerText);
      pages.push(body);
    } catch (err) {
      console.warn(`[search] 翻页失败 (第 ${currentPage + 1} 页):`, err.message);
      break;
    }
  }

  console.log(`[search] 完成: 共抓取 ${pages.length} 页`);
  return { pages, totalPages: pages.length };
}
