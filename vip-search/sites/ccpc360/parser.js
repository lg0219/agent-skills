/**
 * parser.js — 中项网搜索结果解析器（纯函数）
 *
 * 输入：页面 innerText 文本（按行拆分的字符串数组）
 * 输出：结构化项目数组 [{ title, 投资额, 进展阶段, 领域类型, 地区, 发布时间, 甲方单位 }]
 *
 * 解析策略：
 * - 定位统计行（含"条项目信息"），只解析其后的行
 * - 标题行判定：长度 8-100；含关键词；非属性行；非标签/页头行
 * - 属性行归一化：去掉 "(发布时间)" 前缀，统一键名
 * - 甲方单位跨行：值为空时取下一行（<60 字符的公司名）
 * - 跳过尾部"查看更多>"建议区
 */

// 标题行必须包含至少一个关键词
const TITLE_KEYWORDS = /项目|LNG|加气|能源|充电|储罐|橇装|撬装|加注|氢/;

// 标签行（出现在标题行周围，需跳过）
const TAG_PATTERNS = [
  /^(首发|已读|独家|VIP|参考)$/,
  /^(正文包含|人工智能|碳中和|技术改造|城市更新|制氢氢能|钢结构)$/,
  /^(技术升级|节能环保|数字化|智能化|新能源|绿色)$/,
  /^跟踪\d+$/,
];

// 页头/噪声行（在 stats 行之后但仍属于页面 UI 的行）
const HEADER_PATTERNS = [
  /^(全部VIP|跟踪项目|独家项目|商机推荐|默认排序|更多)$/,
  /^(仅查看首发|仅查看预计采购|仅看最新版本)$/,
  /^(全部项目|拟在建项目|原始项目|审批资讯)$/,
  /^(项目信息|招投标|找客户|找人脉|找渠道)$/,
  /^(微信商机订阅助手|优质项目管理小秘书)$/,
  /^(帮助中心|关于我们|服务中心)$/,
  /^(找商机|土地及前期|中项采|CRM|个人中心|管理中心|海外商机|市场服务)$/,
  // concatenated UI fragments (Element UI tabs rendered as one line)
  /^全部VIP项目跟踪项目独家项目商机推荐参考$/,
];

// 底部区域标记（全选/分页/推荐等 → 停止解析）
const FOOTER_PATTERNS = [
  /^全选$/,
  /^共\s*\d+\s*条$/,
  /^\d+$/,
  /^前往页$/,
  /^您可能感兴趣的工程项目信息$/,
  /^查看更多>$/,
  /^加入CRM$/,
  /^分发$/,
  /^导出$/,
  /^收藏$/,
];

/**
 * 判断是否为标签行
 */
function isTagLine(line) {
  return TAG_PATTERNS.some(re => re.test(line));
}

/**
 * 判断是否为页头/噪声行（统计行之后仍可能出现）
 */
function isHeaderLine(line) {
  return HEADER_PATTERNS.some(re => re.test(line));
}

/**
 * 判断是否为底部区域行（到达此区域停止解析）
 */
function isFooterLine(line) {
  return FOOTER_PATTERNS.some(re => re.test(line));
}

/**
 * 判断是否为统计行（含"条项目信息"）
 */
function isStatsLine(line) {
  return line.includes('条项目信息');
}

/**
 * 判断行是否包含属性键（投资额/进展阶段/领域类型/地区/发布时间/甲方单位）
 */
function hasAttribute(line) {
  return /^(\(发布时间\)\s*)?(投资额(\(万元\))?|进展阶段|领域类型|地区|发布时间|甲方单位)\s*[：:]/.test(line);
}

/**
 * 解析属性行，返回 { key, value }
 * 归一化：去掉 "(发布时间)" 前缀；"投资额(万元)" → "投资额"
 */
function parseAttribute(line) {
  // 去掉 "(发布时间)" 前缀
  let cleaned = line.replace(/^\(发布时间\)\s*/, '');

  const m = cleaned.match(/^(投资额(?:\(万元\))?|进展阶段|领域类型|地区|发布时间|甲方单位)\s*[：:]\s*(.*)$/);
  if (!m) return null;

  let key = m[1];
  const value = m[2].trim();

  // 统一键名
  if (key.startsWith('投资额')) key = '投资额';

  return { key, value };
}

/**
 * 判断是否为标题行候选
 */
function isTitleCandidate(line) {
  const len = line.length;
  if (len < 8 || len > 100) return false;
  if (!TITLE_KEYWORDS.test(line)) return false;
  if (isTagLine(line)) return false;
  if (isHeaderLine(line)) return false;
  if (hasAttribute(line)) return false;
  // 排除含冒号的行（通常是属性行或标签行，标题不会含冒号）
  if (/[：:]/.test(line)) return false;
  // 排除纯数字或短日期
  if (/^\d{4}-\d{2}-\d{2}$/.test(line)) return false;
  return true;
}

/**
 * 判断是否为可能的公司名（用于跨行 甲方单位 回填）
 * 条件：不含冒号、不含关键词（或只含"能源"等泛词）、长度 < 60
 */
function isPossibleCompanyName(line) {
  if (!line || line.length >= 60) return false;
  if (/[：:]/.test(line)) return false;
  // 不能是明确的标签/页头/标题行
  if (isTagLine(line)) return false;
  if (isHeaderLine(line)) return false;
  if (isFooterLine(line)) return false;
  return true;
}

/**
 * 创建空项目记录
 */
function emptyProject(title) {
  return {
    title,
    投资额: '',
    进展阶段: '',
    领域类型: '',
    地区: '',
    发布时间: '',
    甲方单位: '',
  };
}

/**
 * 主解析函数（纯函数）
 *
 * @param {string[]} lines - innerText 按行拆分并 strip 后的数组
 * @returns {object[]} 结构化项目数组
 */
export function parse(lines) {
  // 1. 找到统计行
  let statsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isStatsLine(lines[i])) {
      statsIdx = i;
      break;
    }
  }
  if (statsIdx === -1) {
    console.warn('[parser] 未找到统计行（含"条项目信息"）');
    return [];
  }

  const results = [];
  let current = null;  // 当前正在构建的项目

  for (let i = statsIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    // 到达底部区域 → 停止解析
    if (isFooterLine(line)) break;

    // 跳过标签行
    if (isTagLine(line)) continue;

    // 跳过页头行
    if (isHeaderLine(line)) continue;

    // 跳过空白行、纯数字行、短行
    if (!line || line.length < 2) continue;

    // 属性行
    const attr = parseAttribute(line);
    if (attr) {
      // 确保有 current 项目
      if (!current) {
        current = emptyProject('');
      }

      if (attr.key === '甲方单位' && !attr.value) {
        // 跨行回填：甲方单位值为空，尝试取下一行
        const nextLine = (i + 1 < lines.length) ? lines[i + 1] : '';
        if (nextLine && isPossibleCompanyName(nextLine)) {
          current['甲方单位'] = nextLine;
          i++; // 消费下一行
        }
      } else {
        current[attr.key] = attr.value;
      }
      continue;
    }

    // 标题候选行
    if (isTitleCandidate(line)) {
      // 保存上一个项目
      if (current && current.title) {
        results.push(current);
      } else if (current && !current.title) {
        // 上一个 current 没有标题（孤立的属性行），丢弃
      }
      current = emptyProject(line);
      continue;
    }

    // 其他行：可能是公司名回填被消费掉的行（已被 i++ 跳过处理），也可能为未知行，忽略
  }

  // 保存最后一个项目
  if (current && current.title) {
    results.push(current);
  }

  return results;
}

/**
 * 便捷函数：从原始文本直接解析
 * @param {string} text - document.body.innerText
 * @returns {object[]}
 */
export function parseText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return parse(lines);
}
