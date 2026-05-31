import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const [ai, society, investment] = await Promise.allSettled([
    getAINews(),
    getSocietyNews(),
    getInvestmentData()
  ]);

  res.status(200).json({
    ai:         ai.status         === 'fulfilled' ? ai.value         : [],
    society:    society.status    === 'fulfilled' ? society.value    : [],
    investment: investment.status === 'fulfilled' ? investment.value : { indices: [], aiSummary: '', hotSectors: [], liquor: [], fundPolicy: [] },
    updateTime: getNow()
  });
}

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
      const cd = new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/' + tag + '>').exec(c);
      if (cd) return cd[1].trim();
      const tx = new RegExp('<' + tag + '[^>]*>([^<]*)<\\/' + tag + '>').exec(c);
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

async function httpGet(url, opts, ms) {
  if (!opts) opts = {};
  if (!ms) ms = 7000;
  const ctrl = new AbortController();
  const id = setTimeout(function() { ctrl.abort(); }, ms);
  try {
    return await fetch(url, Object.assign({
      signal: ctrl.signal,
      headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, opts.headers || {})
    }, opts));
  } finally { clearTimeout(id); }
}

// ── AI 科技 ───────────────────────────────────────────────────

async function getAINews() {
  const KW = ['AI', '人工智能', '大模型', 'GPT', 'OpenAI', 'Anthropic', 'Claude',
    'Gemini', '文心', '通义', '智谱', 'DeepSeek', 'LLM', 'Sora', '多模态'];
  const sources = [
    { url: 'https://www.qbitai.com/feed',   name: '量子位',   filter: false },
    { url: 'https://www.jiqizhixin.com/rss', name: '机器之心', filter: false },
    { url: 'https://www.ithome.com/rss/',    name: 'IT之家',   filter: true  }
  ];
  const results = [];
  for (const src of sources) {
    try {
      const res = await httpGet(src.url, {}, 6000);
      if (!res.ok) continue;
      const xml = await res.text();
      let items = parseRSS(xml);
      if (src.filter) items = items.filter(i => KW.some(k => i.title.includes(k) || i.description.includes(k)));
      results.push(...items.slice(0, 5).map(i => ({ title: i.title, description: i.description || '点击查看详情', source: src.name, time: formatDate(i.pubDate), url: i.url })));
    } catch (e) { console.error('AI ' + src.name + ': ' + e.message); }
  }
  const seen = new Set();
  return results.filter(i => { if (seen.has(i.title)) return false; seen.add(i.title); return true; }).slice(0, 8);
}

// ── 民生热点 ──────────────────────────────────────────────────

async function getSocietyNews() {
  const attempts = [
    { url: 'https://rsshub.rssforever.com/weibo/search/hot', name: '微博热搜' },
    { url: 'https://rsshub.rssforever.com/zhihu/hot',        name: '知乎热榜' },
    { url: 'https://rss.shab.fun/weibo/search/hot',          name: '微博热搜' },
    { url: 'https://rss.shab.fun/zhihu/hot',                 name: '知乎热榜' },
    { url: 'https://hub.slarker.me/weibo/search/hot',        name: '微博热搜' },
    { url: 'https://rsshub.rssforever.com/bilibili/hot-search', name: 'B站热搜' },
    { url: 'https://rsshub.app/weibo/search/hot',            name: '微博热搜' },
    { url: 'https://rsshub.app/zhihu/hot',                   name: '知乎热榜' }
  ];
  for (const a of attempts) {
    try {
      const res = await httpGet(a.url, {}, 4000);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSS(xml);
      if (items.length === 0) continue;
      console.log('民生成功: ' + a.url);
      return items.slice(0, 10).map((item, idx) => ({
        title: '#' + (idx + 1) + ' ' + item.title,
        description: item.description || '点击查看详情',
        source: a.name,
        time: formatDate(item.pubDate) || getNow(),
        url: item.url,
        rank: idx + 1
      }));
    } catch (e) { console.error('民生失败 ' + a.url + ': ' + e.message); }
  }
  return [];
}

// ── 投资参考 ──────────────────────────────────────────────────

async function getInvestmentData() {
  const [indicesRes, sectorsRes, liquorRes, fundRes] = await Promise.allSettled([
    getIndices(),
    getNewsByKeyword('涨停 板块', 6),
    getNewsByKeyword('白酒 茅台 五粮液', 6),
    getNewsByKeyword('基金 央行 货币政策', 6)
  ]);
  const indices    = indicesRes.status  === 'fulfilled' ? indicesRes.value  : [];
  const hotSectors = sectorsRes.status  === 'fulfilled' ? sectorsRes.value  : [];
  const liquor     = liquorRes.status   === 'fulfilled' ? liquorRes.value   : [];
  const fundPolicy = fundRes.status     === 'fulfilled' ? fundRes.value     : [];
  const aiSummary  = await getDeepSeekSummary(indices, hotSectors, liquor, fundPolicy);
  return { indices, aiSummary, hotSectors, liquor, fundPolicy };
}

async function getIndices() {
  const list = [
    { secid: '1.000001', name: '上证指数', code: '000001' },
    { secid: '0.399001', name: '深证成指', code: '399001' },
    { secid: '0.399006', name: '创业板指', code: '399006' },
    { secid: '1.000300', name: '沪深300',  code: '000300' }
  ];
  const res = await httpGet(
    'https://push2.eastmoney.com/api/qt/ulist.np/get?secids=' + list.map(i => i.secid).join(',') +
    '&fields=f2,f3,f4,f12,f14&fltt=2&ut=bd1d9ddb04089700cf9c27f6f7426281', {}, 5000);
  const data = await res.json();
  const diff = (data && data.data && data.data.diff) ? data.data.diff : [];
  return diff.map(function(item) {
    const info = list.find(i => i.code === item.f12) || {};
    const pct = parseFloat(item.f3) || 0;
    return { name: info.name || item.f14, price: item.f2, change: (parseFloat(item.f4) || 0).toFixed(2), changePct: pct.toFixed(2), isUp: pct >= 0 };
  });
}

async function getNewsByKeyword(keyword, size) {
  const res = await httpGet(
    'https://np-listapi.eastmoney.com/comm/web/getListInfo?type=1&client=web&biz=web_news_search&keyword=' +
    encodeURIComponent(keyword) + '&pageSize=' + size + '&pageIndex=1&_=' + Date.now(), {}, 6000);
  const data = await res.json();
  const list = (data && data.data && data.data.list) ? data.data.list : [];
  return list.map(function(item) {
    return { title: item.title, description: item.digest || '', source: item.mediaName || '东方财富', time: item.publishTime ? formatDate(item.publishTime) : getNow(), url: item.url || 'https://finance.eastmoney.com' };
  });
}

async function getDeepSeekSummary(indices, hotSectors, liquor, fundPolicy) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return '';
  const idxText = indices.length > 0
    ? indices.map(i => i.name + ' ' + i.price + ' ' + (i.isUp ? '涨' : '跌') + i.changePct + '%').join('、')
    : '指数数据暂无';
  const news = [...hotSectors.slice(0, 2), ...liquor.slice(0, 2), ...fundPolicy.slice(0, 2)];
  const newsText = news.length > 0 ? news.map(n => '• ' + n.title).join('\n') : '暂无新闻';
  const prompt = '今日A股：' + idxText + '\n今日要闻：\n' + newsText +
    '\n\n用3句大白话总结：①大盘今天怎么样 ②白酒板块需要注意什么 ③普通投资者今天该做什么。不用专业术语，说人话，100字以内。';
  try {
    const res = await httpGet('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是用大白话讲股市的朋友，回答100字以内，不用专业术语。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5, max_tokens: 200
      })
    }, 8000);
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  } catch (e) { console.error('DeepSeek: ' + e.message); return ''; }
}
