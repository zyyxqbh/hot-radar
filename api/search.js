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

// ─── 工具函数 ────────────────────────────────────────────────

function getNow() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).replace(/\//g, '-');
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
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
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const c = m[1];
    const get = (tag) => {
      const cd = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(c);
      if (cd) return cd[1].trim();
      const tx = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`).exec(c);
      return tx ? tx[1].trim() : '';
    };
    const linkM = c.match(/<link>([^<\s]+)<\/link>/) ||
                  c.match(/<link[^>]+href="([^"]+)"/) ||
                  c.match(/<guid[^>]*>([^<]+)<\/guid>/);
    const desc = get('description').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim().substring(0, 120);
    const item = {
      title: get('title'),
      description: desc,
      pubDate: get('pubDate') || get('dc:date'),
      url: linkM ? linkM[1].trim() : ''
    };
    if (item.title) items.push(item);
  }
  return items;
}

async function req(url, opts = {}, ms = 7000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HotRadar/4.0)', ...(opts.headers || {}) },
      ...opts
    });
  } finally { clearTimeout(id); }
}

// ─── AI 科技：量子位 + IT之家（过滤 AI 关键词）───────────────

async function getAINews() {
  const AI_KEYWORDS = [
    'AI', '人工智能', '大模型', 'GPT', 'OpenAI', 'Anthropic', 'Claude',
    'Gemini', '文心', '通义', '智谱', '混元', 'DeepSeek', '机器学习',
    'LLM', '神经网络', 'Sora', '多模态'
  ];

  const sources = [
    { url: 'https://www.qbitai.com/feed',   name: '量子位',   filter: false },
    { url: 'https://www.jiqizhixin.com/rss', name: '机器之心', filter: false },
    { url: 'https://www.ithome.com/rss/',    name: 'IT之家',   filter: true  }
  ];

  const results = [];
  for (const src of sources) {
    try {
      const res = await req(src.url, {}, 6000);
      if (!res.ok) continue;
      const xml = await res.text();
      let items = parseRSS(xml);
      if (src.filter) {
        items = items.filter(i =>
          AI_KEYWORDS.some(kw => i.title.includes(kw) || i.description.includes(kw))
        );
      }
      results.push(...items.slice(0, 5).map(i => ({
        title: i.title,
        description: i.description || '点击查看详情',
        source: src.name,
        time: formatDate(i.pubDate),
        url: i.url
      })));
    } catch (e) {
      console.error(`AI RSS 失败 [${src.name}]:`, e.message);
    }
  }

  // 去重
  const seen = new Set();
  return results.filter(i => {
    if (seen.has(i.title)) return false;
    seen.add(i.title);
    return true;
  }).slice(0, 8);
}

// ─── 民生热点：vvhan 微博热搜（稳定） + 备用 ─────────────────

async function getSocietyNews() {
  const fmt = (item, i) => ({
    title: `#${i + 1} ${item.title || item.name || ''}`,
    description: item.desc || item.note || `热度: ${item.hot || item.hotNum || '热搜'}`,
    source: '微博热搜',
    time: getNow(),
    url: item.url || item.mobilUrl || `https://s.weibo.com/weibo?q=${encodeURIComponent(item.title || item.name || '')}`,
    rank: i + 1,
    hot: item.hot || item.hotNum || 0
  });

  // 主：vvhan（最稳定）
  try {
    const res = await req('https://api.vvhan.com/api/hotlist/wbHot', {}, 6000);
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      return data.data.slice(0, 10).map(fmt);
    }
  } catch (e) { console.error('vvhan微博失败:', e.message); }

  // 备用1：weibo-hot-api
  try {
    const res = await req('https://weibo-hot-api.vercel.app/api', {}, 6000);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.data;
    if (Array.isArray(list) && list.length > 0) return list.slice(0, 10).map(fmt);
  } catch (e) { console.error('weibo-hot-api失败:', e.message); }

  // 备用2：头条热搜（换个数据源总有一个能用）
  try {
    const res = await req('https://api.vvhan.com/api/hotlist/toutiaoHot', {}, 6000);
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      return data.data.slice(0, 10).map((item, i) => ({
        title: `#${i + 1} ${item.title}`,
        description: item.desc || '今日热点',
        source: '今日头条',
        time: getNow(),
        url: item.url || 'https://www.toutiao.com',
        rank: i + 1,
        hot: 0
      }));
    }
  } catch (e) { console.error('头条热搜失败:', e.message); }

  return [];
}

// ─── 白酒行业：新浪实时股价（免费、极稳定）+ 东方财富新闻 ────

async function getLiquorNews() {
  const stocks = [
    { code: 'sh600519', name: '贵州茅台', emCode: '600519' },
    { code: 'sz000858', name: '五粮液',   emCode: '000858' },
    { code: 'sz000568', name: '泸州老窖', emCode: '000568' },
    { code: 'sh600809', name: '山西汾酒', emCode: '600809' }
  ];

  const results = [];

  // 新浪实时股价（最稳定的免费股价 API）
  const codes = stocks.map(s => s.code).join(',');
  try {
    const res = await req(`https://hq.sinajs.cn/list=${codes}`, {
      headers: { 'Referer': 'https://finance.sina.com.cn' }
    }, 5000);
    const text = await res.text();

    // 解析新浪行情格式：var hq_str_sh600519="贵州茅台,昨收,今开,当前价,...";
    for (const stock of stocks) {
      const pattern = new RegExp(`hq_str_${stock.code}="([^"]+)"`);
      const m = text.match(pattern);
      if (!m || !m[1]) continue;
      const fields = m[1].split(',');
      // 字段顺序：名称,今开,昨收,当前价,最高,最低,...,时间,...
      const [, open, prevClose, current, high, low] = fields;
      if (!current || current === '0.000') continue;
      const change = (parseFloat(current) - parseFloat(prevClose)).toFixed(2);
      const changePct = ((parseFloat(change) / parseFloat(prevClose)) * 100).toFixed(2);
      const sign = parseFloat(change) >= 0 ? '+' : '';
      results.push({
        title: `${stock.name}：${current} 元  ${sign}${changePct}%`,
        description: `今开: ${open}  最高: ${high}  最低: ${low}  昨收: ${prevClose}`,
        source: '新浪财经',
        time: getNow(),
        url: `https://finance.sina.com.cn/realstock/company/${stock.code}/nc.shtml`,
        stockInfo: `${current} ${sign}${changePct}%`
      });
    }
  } catch (e) {
    console.error('新浪股价失败:', e.message);
  }

  // 东方财富白酒板块新闻
  try {
    const res = await req(
      'https://np-listapi.eastmoney.com/comm/web/getListInfo?' +
      'type=1&client=web&biz=web_news_search&keyword=%E7%99%BD%E9%85%92' +
      '&pageSize=6&pageIndex=1&_=' + Date.now(),
      {}, 6000
    );
    const data = await res.json();
    const list = data?.data?.list || data?.list || [];
    for (const item of list.slice(0, 4)) {
      results.push({
        title: item.title || item.Title,
        description: item.digest || item.Digest || '点击查看详情',
        source: item.mediaName || '东方财富',
        time: item.publishTime ? formatDate(item.publishTime) : getNow(),
        url: item.url || item.Url || 'https://finance.eastmoney.com'
      });
    }
  } catch (e) {
    console.error('东方财富新闻失败:', e.message);
  }

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
