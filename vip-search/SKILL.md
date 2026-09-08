---
name: vip-search
description: 中项网 VIP 商机搜索 — 登录、搜索、翻页、解析全链路。支持验证码协作模式，输出结构化 JSON。
---

# vip-search — 中项网 VIP 商机搜索

## 能力

在中项网（https://vip.ccpc360.com）VIP 会员站搜索项目商机，核心流程：

1. **登录** — Playwright 持久化 profile + 验证码协作模式（截图 → 外部识别 → 填入）
2. **搜索** — 导航到项目信息搜索页，填入关键词，点击搜索
3. **翻页** — 逐页点击下一页，抓取每页 `document.body.innerText`
4. **解析** — 纯函数解析器，将 innerText 行文本转为结构化 JSON

输出：项目数组 JSON 文件（标题、投资额、进展阶段、领域类型、地区、发布时间、甲方单位）。

## 使用

```bash
cd /root/.openclaw/workspace/skills/vip-search

# 设置 NODE_PATH 使用已有 playwright
NODE_PATH=/root/.openclaw/douyin-creator-tools/node_modules \
  node cli.js search "LNG加气站" --pages 3

# 指定输出文件
NODE_PATH=/root/.openclaw/douyin-creator-tools/node_modules \
  node cli.js search "充电桩" --out /tmp/charging.json --pages 2

# 搜索并写入钉钉在线表格
NODE_PATH=/root/.openclaw/douyin-creator-tools/node_modules \
  node cli.js search "LNG加气站" --pages 3 --write-table

# 独立写入表格（从已有 JSON 文件）
node cli.js write-table --file /tmp/vip-search-results.json
```

### 命令格式

```
node cli.js search <关键词> [--pages N] [--site ccpc360] [--out path.json] [--write-table]
node cli.js write-table --file <json>
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--pages N` | 最大翻页数 | 1 |
| `--site NAME` | 站点名称 | ccpc360 |
| `--out PATH` | 输出 JSON 路径 | /tmp/vip-search-results.json |
| `--write-table` | 搜索完成后写入钉钉在线表格 | 不启用 |

## 账号配置

账号优先从 `sites/ccpc360/config.json` 读取，留空时回退到环境变量：

```bash
export CCPC_USER="your_username"
export CCPC_PASS="your_password"
```

`config.json` 格式（不入 git）：
```json
{"username": "", "password": ""}
```

## 验证码协作模式

登录时生成图片验证码，脚本截图到 `/tmp/ccpc-captcha-live.png` 并输出 `CAPTCHA_READY`，然后轮询 `/tmp/captcha_answer.txt`。

外部识别者（人工或 vision agent）将答案写入 `/tmp/captcha_answer.txt`，脚本读到后删除文件并继续。

这是固定接口，请勿修改路径。

## 钉钉在线表格写入

搜索完成后可将结果写入钉钉在线表格，表头固定为 7 列：

| 项目名称 | 投资额(万元) | 进展阶段 | 领域类型 | 地区 | 发布时间 | 甲方单位 |

写入流程（由 `sites/ccpc360/table.js` 编排）：
1. 检查/创建 `ccpc360` 工作表（node: `NZQYprEoWo63ey0ZFB6g36Xa81waOeDk`）
2. 确保表头行正确（A1:G1）
3. 在第 2 行前插入空行（旧数据下移，不删除不覆盖）
4. 将结果转为 RFC 4180 CSV 写入 A2 起始区域

表格写入失败不中断搜索主流程（搜索依然成功，仅打印警告）。

**前置条件**：需先通过 `dws auth` 完成钉钉认证。

## 输出格式

```json
[
  {
    "title": "澄江提古服务区LNG加气站项目",
    "投资额": "98",
    "进展阶段": "施工准备",
    "领域类型": "天然气站",
    "地区": "云南省玉溪市",
    "发布时间": "2026-08-05",
    "甲方单位": "澄江市燃气有限公司"
  }
]
```

## 环境要求

- Node.js v24+，ESM
- Playwright（通过 `NODE_PATH` 引用已有安装）
- 浏览器内核已就绪（Chromium）
- Profile 目录：`/root/.openclaw/douyin-creator-tools/.playwright/douyin-profile`

## 已知限制

1. **登录态不持久化** — 中项网 session 级登录态，每次运行需重新登录（验证码协作）
2. **验证码需外部识别** — 脚本只负责截图和轮询，不内置 OCR
3. **SPA Hash 路由** — 基于 `#/` hash 路由，URL 变化不触发完整页面加载
4. **弹窗干扰** — 登录后有"微信商机订阅助手"等弹窗，需 JS 强制移除
5. **翻页无进度条** — el-pagination 不暴露总页数，只能逐页尝试直到按钮 disabled
6. **仅支持 ccpc360** — 单站点实现，扩展需新增 `sites/<name>/` 目录
7. **表格写入需要 dws 认证** — 依赖 `dws auth` 完成钉钉 OAuth 登录，且 dws CLI 必须在 PATH 中

## 结构

```
vip-search/
├── cli.js              # 统一入口
├── SKILL.md            # 本文件
├── core/
│   ├── login.js        # 通用登录器（验证码协作 + 重试）
│   ├── captcha.js      # 验证码截图 + 答案轮询
│   └── session.js      # profile 管理 + 弹窗清理
└── sites/
    └── ccpc360/
        ├── config.js   # 站点选择器/路由/账号读取
        ├── config.json # 账号（不入 git）
        ├── search.js   # 搜索 + 翻页
        ├── parser.js   # innerText → 结构化 JSON（纯函数）
        └── table.js    # 钉钉在线表格写入
```
