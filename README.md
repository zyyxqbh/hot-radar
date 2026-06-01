# 热点雷达 (Hot Radar)

一个聚合 AI 科技、民生热点、投资行情的个人信息看板。

🌐 在线地址：https://hot-radar-nine.vercel.app

## 这是什么

每天打开浏览器点一下"刷新热点"，就能在一个页面看到：

- **🤖 AI 科技**：量子位、机器之心、IT之家、OpenAI、Google AI 的最新文章 + DeepSeek 用大白话总结今日 AI 圈重点
- **🔥 民生热点**：澎湃/知乎日报"今日要闻" + 微博热搜/B站热搜"热议话题"
- **📈 投资参考**：A 股四大指数实时行情 + DeepSeek 大白话分析 + 行业板块涨跌排行 + 白酒成分股行情 + 全市场涨幅榜

## 技术栈

| 组件 | 选择 |
|------|------|
| 前端 | 原生 HTML / CSS / JavaScript |
| 后端 | Vercel Serverless Functions（Node.js 18+） |
| AI 解读 | DeepSeek Chat API |
| 部署 | Vercel（免费 Hobby 计划） |
| 代码托管 | GitHub |

## 数据源一览

所有数据源都是免费公开接口，无需 API Key 即可使用，DeepSeek 除外。

### AI 科技
| 来源 | 接口类型 | 备注 |
|------|---------|------|
| 量子位 | RSS | https://www.qbitai.com/feed |
| 机器之心 | RSS | https://www.jiqizhixin.com/rss （有时返回空） |
| IT之家 | RSS | https://www.ithome.com/rss/  按 AI 关键词过滤 |
| OpenAI Blog | RSS | https://openai.com/blog/rss.xml |
| Google AI Blog | RSS | https://blog.google/technology/ai/rss/ |

### 民生热点
| 来源 | 接口类型 | 备注 |
|------|---------|------|
| 澎湃新闻 | RSSHub | `/thepaper/featured` |
| 知乎日报 | RSSHub | `/zhihu/daily` |
| 微博热搜 | RSSHub | `/weibo/search/hot`（依赖第三方镜像，可能失败） |
| B站热搜 | 官方 API | `api.bilibili.com/x/web-interface/search/square` |

### 投资参考（全部来自东方财富 push2 接口）
| 数据 | 接口 |
|------|------|
| 大盘指数 | `push2.eastmoney.com/api/qt/ulist.np/get` |
| 行业板块涨跌 | `push2.eastmoney.com/api/qt/clist/get?fs=m:90+t:2` |
| 白酒成分股 | `push2.eastmoney.com/api/qt/clist/get?fs=b:BK0464` |
| 全市场涨幅榜 | `push2.eastmoney.com/api/qt/clist/get?fs=m:0+t:6,...` |

### AI 解读
- DeepSeek Chat API：`api.deepseek.com/chat/completions`
- 用途：1）AI 科技板块顶部"今日 AI 速览"摘要；2）投资板块"大白话解读"

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

环境变量需要在 Vercel 控制台 → Settings → Environment Variables 配置：
- `DEEPSEEK_API_KEY`：用于 AI 解读功能

## 成本

| 项目 | 月费 |
|------|------|
| Vercel Hobby | 0 元 |
| 所有数据接口 | 0 元 |
| DeepSeek API | < 1 元（按调用计费，每次刷新约 0.002 元） |
| **合计** | **< 1 元/月** |

## 已知限制

- **Vercel 部署在海外**：访问中国数据源有时会出现连接超时或被反爬封锁。代码内已对每个数据源做了 try-catch 容错，单个失败不影响其他板块。
- **第三方 RSSHub 镜像不稳定**：民生热点和部分新闻数据依赖 RSSHub 公共镜像，镜像不可用时该板块会显示空白。代码内已尝试多个镜像轮询。
- **新闻类财经接口大量失效**：免费财经新闻接口正在大规模消亡，因此投资板块改为以**行情数据**为主，而非新闻。

## 故障排查

如果某个板块没数据：
1. 打开 Vercel 控制台 → Deployments → 最新部署 → Logs
2. 在网站上点一次"刷新热点"
3. 回到 Logs 找对应板块的日志（每个数据源都会打印"XX成功: N 条"或错误信息）
4. 根据日志判断是哪个源失败

## 版本历史

详见 GitHub Commits。
