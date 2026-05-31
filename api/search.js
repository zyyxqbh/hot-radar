import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const [ai, society, liquor] = await Promise.allSettled([
    getAINews(),
    getSocietyNews(),
    getLiquorNews()
  ]);

  res.status(200).json({
    ai:      ai.status      === 'fulfilled' ? ai.value      : [],
    society: society.status === 'fulfilled' ? society.value : [],
    liquor:  liquor.status  === 'fulfilled' ? liquor.value  : [],
    updateTime: getNow()
  });
}

// ── 工具函数 ──────────────────────────────────────────────────

function getNow() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).replace(/\//g, '-');
}

function formatDate(str) {
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return getNow();
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(/\//g, '-');
  } catch { return getNow(); }
}

function parseRSS(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const c = m[1];
    const get = (tag) => {
      const cd = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(c);
      if (cd) return cd[1].trim();
      const tx = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`).exec(c);
      return tx ? tx[1].trim() : '';
    };
    const lm = c.match(/<link>([^<\s]+)<\/link>/) ||
               c.match(/<link[^>]+href="([^"]+)"/) ||
               c.match(/<guid[^>]*>([^<]+)<\/guid>/);
    const desc = get('description').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim().substring(0, 120);
    const item = { title: get('title'), description: desc, pubDate: get('pubDate') || get('dc:date'), url: lm ? lm[1].trim() : '' };
    if (item.title) items.push(item);
  }
  return items;
}

async function get(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...(opts.headers || {}) },
      ...opts
    });
  } finally { clearTimeout(id); }
}

// ── AI 科技：量子位 + 机器之心 + IT之家 RSS ───────────────────

async function getAINews() {
  const KW = ['AI', '人工智能', '大模型', 'GPT', 'OpenAI', 'Anthropic', 'Claude',
    'Gemini', '文心', '通义', '智谱', 'DeepSeek', 'LLM', 'Sora', '多模态'];

  const sources = [
    { url: 'https://www.qbitai.com/feed',    name: '量子位',   filter: false },
    { url: 'https://www.jiqizhixin.com/rss',  name: '机器之心', filter: false },
    { url: 'https://www.ithome.com/rss/',     name: 'IT之家',   filter: true  }
  ];

  const results = [];
  for (const src of sources) {
    try {
      const res = await get(src.url, {}, 6000);
      if (!res.ok) continue;
      const xml = await res.text();
      let items = parseRSS(xml);
      if (src.filter) items = items.filter(i => KW.some(k => i.title.includes(k) || i.description.includes(k)));
      results.push(...items.slice(0, 5).map(i => ({
        title: i.title,
        description: i.description || '点击查看详情',
        source: src.name,
        time: formatDate(i.pubDate),
        url: i.url
      })));
    } catch (e) { console.error(`AI[${src.name}]:`, e.message); }
  }

  const seen = new Set();
  return results.filter(i => { if (seen.has(i.title)) return false; seen.add(i.title); return true; }).slice(0, 8);
}

// ── 民生热点：RSSHub（全球可访问）────────────────────────────

async function getSocietyNews() {
  const sources = [
    { url: 'https://rsshub.app/weibo/search/hot', name: '微博热搜' },
    { url: 'https://rsshub.app/zhihu/hot',        name: '知乎热榜' },
    { url: 'https://rsshub.app/baidu/hot/general', name: '百度热搜' }
  ];

  for (const src of sources) {
    try {
      const res = await get(src.url, {}, 8000);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSS(xml);
      if (items.length === 0) continue;
      return items.slice(0, 10).map((item, i) => ({
        title: `#${i + 1} ${item.title}`,
        description: item.description || '点击查看详情',
        source: src.name,
        time: formatDate(item.pubDate) || getNow(),
        url: item.url,
        rank: i + 1
      }));
    } catch (e) { console.error(`民生[${src.name}]:`, e.message); }
  }

  return [];
}

// ── 白酒行业：新浪实时股价 + 东方财富新闻 ───────────────────

async function getLiquorNews() {
  const stocks = [
    { code: 'sh600519', name: '贵州茅台' },
    { code: 'sz000858', name: '五粮液'   },
    { code: 'sz000568', name: '泸州老窖' },
    { code: 'sh600809', name: '山西汾酒' }
  ];

  const results = [];

  try {
    const codes = stocks.map(s => s.code).join(',');
    const res = await get(`https://hq.sinajs.cn/list=${codes}`,
      { headers: { 'Referer': 'https://finance.sina.com.cn' } }, 5000);
    const text = await res.text();
    for (const stock of stocks) {
      const m = text.match(new RegExp(`hq_str_${stock.code}="([^"]+)"`));
      if (!m || !m[1]) continue;
      const f = m[1].split(',');
      const [, open, prevClose, current, high, low] = f;
      if (!current || current === '0.000') continue;
      const change = (parseFloat(current) - parseFloat(prevClose)).toFixed(2);
      const pct = ((parseFloat(change) / parseFloat(prevClose)) * 100).toFixed(2);
      const sign = parseFloat(change) >= 0 ? '+' : '';
      results.push({
        title: `${stock.name}  ${current} 元`,
        description: `涨跌: ${sign}${change} (${sign}${pct}%)　今开: ${open}　最高: ${high}　最低: ${low}`,
        source: '新浪财经',
        time: getNow(),
        url: `https://finance.sina.com.cn/realstock/company/${stock.code}/nc.shtml`,
        stockInfo: `${current} ${sign}${pct}%`
      });
    }
  } catch (e) { console.error('新浪股价:', e.message); }

  try {
    const res = await get(
      `https://np-listapi.eastmoney.com/comm/web/getListInfo?type=1&client=web&biz=web_news_search&keyword=%E7%99%BD%E9%85%92&pageSize=5&pageIndex=1&_=${Date.now()}`,
      {}, 6000);
    const data = await res.json();
    for (const item of (data?.data?.list || []).slice(0, 4)) {
      results.push({
        title: item.title,
        description: item.digest || '点击查看详情',
        source: item.mediaName || '东方财富',
        time: item.publishTime ? formatDate(item.publishTime) : getNow(),
        url: item.url || 'https://finance.eastmoney.com'
      });
    }
  } catch (e) { console.error('东方财富:', e.message); }

  if (results.length === 0) {
    results.push({
      title: '交易时段外暂无实时行情',
      description: 'A股交易时间：周一至周五 9:30-11:30 / 13:00-15:00',
      source: '系统提示',
      time: getNow(),
      url: 'https://finance.eastmoney.com/special/cywjh/'
    });
  }

  return results;
}
