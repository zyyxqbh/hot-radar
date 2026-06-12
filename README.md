# 信息茧房破壁机

一个对抗算法投喂、了解世界正在发生什么的个人信息看板。

🌐 在线地址：https://hot-radar-nine.vercel.app

## 这是什么

每天打开浏览器点一下"刷新热点"，就能在一个页面看到：

- **📰 今日要闻**：澎湃新闻 / 知乎日报
- **🔥 国内热议**：微博热搜 / B站热搜 / 知乎热榜
- **🌍 国际视野**：BBC World / NYT World 英文新闻

每条内容都可以点「📌 标记」一键复制为 Markdown 格式（`- [ ] [标题](链接) — 来源 · 时间`），方便粘贴到 Obsidian 整理笔记。

## 技术栈

| 组件 | 选择 |
|------|------|
| 前端 | 原生 HTML / CSS / JavaScript |
| 后端 | Vercel Serverless Functions（Node.js 18+） |
| 部署 | Vercel（免费 Hobby 计划） |
| 代码托管 | GitHub |

## 数据源一览

所有数据源均为免费公开接口，无需 API Key。

### 今日要闻
| 来源 | 接口类型 | 备注 |
|------|---------|------|
| 澎湃新闻 | RSSHub | `/thepaper/featured` |
| 知乎日报 | RSSHub | `/zhihu/daily` |

### 国内热议
| 来源 | 接口类型 | 备注 |
|------|---------|------|
| 微博热搜 | RSSHub | `/weibo/search/hot`（依赖第三方镜像，可能失败） |
| B站热搜 | 官方 API | `api.bilibili.com/x/web-interface/search/square` |
| 知乎热榜 | RSSHub | `/zhihu/hotlist`（依赖第三方镜像，可能失败） |

### 国际视野
| 来源 | 接口类型 | 备注 |
|------|---------|------|
| BBC World | RSS | `feeds.bbci.co.uk/news/world/rss.xml` |
| NYT World | RSS | `rss.nytimes.com/services/xml/rss/nyt/World.xml` |

## 文件结构
hot-radar/
├── api/
│ └── search.js # 后端 Serverless Function，所有数据抓取逻辑
├── index.html # 前端页面（含所有 CSS 和 JS）
├── package.json # Node 依赖
├── vercel.json # Vercel 部署配置（部署到香港 hkg1）
└── README.md

## 部署 / 修改流程

1. 在 GitHub 网页上直接编辑文件
2. Commit changes
3. Vercel 自动检测 push 并部署（约 1-2 分钟）
4. 部署完成后访问网站测试

无需配置任何环境变量。

## 已知限制

- **第三方 RSSHub 镜像不稳定**：微博热搜、知乎热榜、要闻板块依赖 RSSHub 公共镜像，镜像不可用时该来源会缺失（不影响其他来源）。代码内已对每个数据源做了 try-catch 容错并轮询多个镜像。

## 故障排查

如果某个板块没数据：
1. 打开 Vercel 控制台 → Deployments → 最新部署 → Logs
2. 在网站上点一次"刷新热点"
3. 回到 Logs 找对应来源的日志（每个数据源都会打印"XX成功: N 条"或错误信息）
4. 根据日志判断是哪个源失败

## 版本历史

详见 GitHub Commits。
