#!/usr/bin/env node
/**
 * cli.js — vip-search 统一入口
 *
 * 命令：
 *   node cli.js search "关键词" [--pages N] [--site ccpc360] [--out path.json] [--write-table]
 *   node cli.js write-table --file <json>
 *
 * 示例：
 *   node cli.js search "LNG加气站" --pages 3
 *   node cli.js search "充电桩" --site ccpc360 --out /tmp/results.json --write-table
 *   node cli.js write-table --file /tmp/vip-search-results.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 参数解析 ──────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    process.exit(0);
  }

  // write-table 子命令
  if (cmd === 'write-table') {
    let file = null;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--file' && args[i + 1]) {
        file = args[++i];
      }
    }
    if (!file) {
      console.error('write-table 需要 --file <json 文件路径>');
      process.exit(1);
    }
    return { cmd: 'write-table', file };
  }

  if (cmd !== 'search') {
    console.error(`未知命令: ${cmd}`);
    printHelp();
    process.exit(1);
  }

  const keyword = args[1];
  if (!keyword) {
    console.error('缺少搜索关键词');
    printHelp();
    process.exit(1);
  }

  let maxPages = 1;
  let site = 'ccpc360';
  let outFile = '/tmp/vip-search-results.json';
  let writeTable = false;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--pages' && args[i + 1]) {
      maxPages = parseInt(args[++i], 10);
      if (isNaN(maxPages) || maxPages < 1) maxPages = 1;
    } else if (args[i] === '--site' && args[i + 1]) {
      site = args[++i];
    } else if (args[i] === '--out' && args[i + 1]) {
      outFile = args[++i];
    } else if (args[i] === '--write-table') {
      writeTable = true;
    }
  }

  return { cmd: 'search', keyword, maxPages, site, outFile, writeTable };
}

function printHelp() {
  console.log(`
vip-search — 中项网 VIP 商机搜索

用法:
  node cli.js search <关键词> [选项]
  node cli.js write-table --file <json>

选项:
  --pages N      最大翻页数（默认 1）
  --site NAME    站点名称（默认 ccpc360）
  --out PATH     输出 JSON 文件路径（默认 /tmp/vip-search-results.json）
  --write-table  搜索完成后写入钉钉在线表格

示例:
  node cli.js search "LNG加气站" --pages 3
  node cli.js search "充电桩" --out /tmp/charging.json --write-table
  node cli.js write-table --file /tmp/vip-search-results.json
`);
}

// ── 站点加载 ──────────────────────────────────────────────

async function loadSite(name) {
  const siteDir = path.join(__dirname, 'sites', name);
  if (!fs.existsSync(siteDir)) {
    console.error(`站点不存在: ${name} (${siteDir})`);
    process.exit(1);
  }
  const config = await import(`./sites/${name}/config.js`);
  const search = await import(`./sites/${name}/search.js`);
  const parser = await import(`./sites/${name}/parser.js`);
  return { config, search, parser };
}

// ── 主流程 ─────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  // write-table 独立命令
  if (args.cmd === 'write-table') {
    return runWriteTable(args.file);
  }

  const { keyword, maxPages, site, outFile, writeTable } = args;

  console.log(`vip-search: 站点=${site} 关键词="${keyword}" 最大页数=${maxPages}`);
  console.log(`输出文件: ${outFile}`);
  if (writeTable) console.log(`写入表格: 是`);

  // 动态导入核心模块（避免在非 search 命令时加载 playwright）
  const { launchBrowser, dismissModals, isLoggedIn } = await import('./core/session.js');
  const { login } = await import('./core/login.js');

  const siteMod = await loadSite(site);
  const cfg = siteMod.config;

  // 启动浏览器
  console.log('[cli] 启动浏览器...');
  const { browser, page } = await launchBrowser();

  let success = false;
  try {
    // 登录
    const credentials = cfg.getCredentials();
    console.log('[cli] 检查登录态...');
    await page.goto(cfg.loginUrl, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(2500);

    if (!isLoggedIn(page)) {
      console.log('[cli] 需要登录');
      const loggedIn = await login(page, cfg, credentials);
      if (!loggedIn) {
        console.error('[cli] 登录失败，退出');
        await browser.close();
        process.exit(1);
      }
    } else {
      console.log('[cli] 已登录');
    }

    // 清理弹窗遮罩
    await dismissModals(page);

    // 执行搜索
    const { pages } = await siteMod.search.searchAndFetch(page, keyword, maxPages);

    // 解析所有页面
    const allProjects = [];
    const seenTitles = new Set();

    for (let pi = 0; pi < pages.length; pi++) {
      const pageLines = pages[pi].split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const projects = siteMod.parser.parse(pageLines);

      // 去重（按标题）
      for (const proj of projects) {
        if (!seenTitles.has(proj.title)) {
          seenTitles.add(proj.title);
          allProjects.push(proj);
        }
      }
    }

    // 写入 JSON
    fs.writeFileSync(outFile, JSON.stringify(allProjects, null, 2), 'utf-8');
    console.log(`\n[cli] 结果已写入: ${outFile}`);

    // 统计
    const total = allProjects.length;
    const withInvest = allProjects.filter(p => p['投资额']).length;
    const withStage = allProjects.filter(p => p['进展阶段']).length;
    const withField = allProjects.filter(p => p['领域类型']).length;
    const withArea = allProjects.filter(p => p['地区']).length;
    const withDate = allProjects.filter(p => p['发布时间']).length;
    const withOwner = allProjects.filter(p => p['甲方单位']).length;

    console.log(`\n──── 统计 ────`);
    console.log(`项目总数:       ${total}`);
    console.log(`搜索页数:       ${pages.length}`);
    console.log(`投资额(万元):   ${withInvest} 条非空`);
    console.log(`进展阶段:       ${withStage} 条非空`);
    console.log(`领域类型:       ${withField} 条非空`);
    console.log(`地区:           ${withArea} 条非空`);
    console.log(`发布时间:       ${withDate} 条非空`);
    console.log(`甲方单位:       ${withOwner} 条非空`);

    // ── 写入钉钉在线表格 ──
    if (writeTable) {
      try {
        const { writeToTable } = await import('./sites/ccpc360/table.js');
        const tableOk = writeToTable(allProjects);
        if (!tableOk) {
          console.warn('[cli] ⚠️  表格写入失败，但搜索已完成');
        }
      } catch (err) {
        console.warn('[cli] ⚠️  表格写入异常:', err.message);
        console.warn('[cli] 搜索已完成，表格写入非关键路径');
      }
    }

    success = true;
  } catch (err) {
    console.error('[cli] 错误:', err);
  } finally {
    await browser.close();
    if (!success) process.exit(1);
  }
}

// ── write-table 独立命令 ────────────────────────────────────

async function runWriteTable(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    process.exit(1);
  }

  console.log(`[cli] 读取数据文件: ${filePath}`);
  let results;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    results = JSON.parse(raw);
    if (!Array.isArray(results)) {
      console.error('JSON 文件内容不是数组');
      process.exit(1);
    }
  } catch (err) {
    console.error('读取/解析 JSON 文件失败:', err.message);
    process.exit(1);
  }

  console.log(`[cli] 共 ${results.length} 条项目数据`);

  const { writeToTable } = await import('./sites/ccpc360/table.js');
  const ok = writeToTable(results);
  if (!ok) {
    console.error('[cli] 表格写入失败');
    process.exit(1);
  }

  console.log('[cli] 表格写入成功');
}

main();
