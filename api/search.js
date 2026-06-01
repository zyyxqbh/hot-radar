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
    ai:         ai.status         === 'fulfilled' ? ai.value         : { news: [], summary: '' },
    society:    society.status    === 'fulfilled' ? society.value    : { headlines: [], hot: [] },
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
    var d = new Date(str);
    if (isNaN(d.getTime())) return getNow();
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(/\//g, '-');
  } catch (e) { return getNow(); }
}

function parseRSS(xml) {
  var items = [];
  var re = /<item>([\s\S]*?)<\/item>/g;
  var m;
  while ((m = re.exec(xml)) !== null) {
    var c = m[1];
    var get = function(tag) {
      var cd = new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/' + tag + '>').exec(c);
      if (cd) return cd[1].trim();
      var tx = new RegExp('<' + tag + '[^>]*>([^<]*)<\\/' + tag + '>').exec(c);
      return tx ? tx[1].trim() : '';
    };
    var lm = c.match(/<link>([^<\s]+)<\/link>/) ||
             c.match(/<link[^>]+href="([^"]+)"/) ||
             c.match(/<guid[^>]*>([^<]+)<\/guid>/);
    var desc = get('description').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim().substring(0, 120);
    var item = { title: get('title'), description: desc, pubDate: get('pubDate') || get('dc:date'), url: lm ? lm[1].trim() : '' };
    if (item.title) items.push(item);
  }
  return items;
}

async function httpGet(url, opts, ms) {
  if (!opts) opts = {};
  if (!ms) ms = 8000;
  var ctrl = new AbortController();
  var id = setTimeout(function() { ctrl.abort(); }, ms);
  try {
    return await fetch(url, Object.assign({
      signal: ctrl.signal,
      headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, opts.headers || {})
    }, opts));
  } finally { clearTimeout(id); }
}

async function deepseekChat(systemPrompt, userPrompt, maxTokens) {
  var apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return '';
  try {
    var res = await httpGet('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5, max_tokens: maxTokens || 200
      })
    }, 8000);
    var data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  } catch (e) { console.error('DeepSeek: ' + e.message); return ''; }
}

// ── AI 科技 ─────────────────────────────────────────────────

async function getAINews() {
  var KW = ['AI', '人工智能', '大模型', 'GPT', 'OpenAI', 'Anthropic', 'Claude', 'Gemini', '文心', '通义', '智谱', 'DeepSeek', 'LLM', 'Sora', '多模态'];
  var sources = [
    { url: 'https://www.qbitai.com/feed',      name: '量子位',   filter: false },
    { url: 'https://www.jiqizhixin.com/rss',    name: '机器之心', filter: false },
    { url: 'https://www.ithome.com/rss/',       name: 'IT之家',   filter: true  },
    { url: 'https://openai.com/blog/rss.xml',   name: 'OpenAI',   filter: false },
    { url: 'https://blog.google/technology/ai/rss/', name: 'Google AI', filter: false }
  ];
  var results = [];
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    try {
      var res = await httpGet(src.url, {}, 9000);
      if (!res.ok) { console.log('AI ' + src.name + ' 状态: ' + res.status); continue; }
      var xml = await res.text();
      var items = parseRSS(xml);
      if (src.filter) items = items.filter(function(it) {
        return KW.some(function(k) { return it.title.indexOf(k) >= 0 || it.description.indexOf(k) >= 0; });
      });
      console.log('AI ' + src.name + ' 成功: ' + items.length + ' 条');
      var picked = items.slice(0, 4).map(function(it) {
        return { title: it.title, description: it.description || '点击查看详情', source: src.name, time: formatDate(it.pubDate), url: it.url };
      });
      results = results.concat(picked);
    } catch (e) { console.error('AI ' + src.name + ': ' + e.message); }
  }
  var seen = new Set();
  var deduped = results.filter(function(it) { if (seen.has(it.title)) return false; seen.add(it.title); return true; }).slice(0, 12);

  var summary = '';
  if (deduped.length > 0) {
    var brief = deduped.slice(0, 6).map(function(it) { return '• ' + it.title; }).join('\n');
    summary = await deepseekChat(
      '你是 AI 行业资讯编辑，用大白话告诉用户今天 AI 圈在发生什么，100字以内，不要专业术语。',
      '今日 AI 资讯标题：\n' + brief + '\n\n请用2-3句话概括今天 AI 圈最值得关注的事，告诉我重点。',
      200
    );
  }
  return { news: deduped, summary: summary };
}

// ── 民生热点 ────────────────────────────────────────────────

async function getSocietyNews() {
  var [headlinesRes, hotRes] = await Promise.allSettled([getHeadlines(), getHotTopics()]);
  return {
    headlines: headlinesRes.status === 'fulfilled' ? headlinesRes.value : [],
    hot:       hotRes.status       === 'fulfilled' ? hotRes.value       : []
  };
}

async function getHeadlines() {
  var sources = [
    { url: 'https://rsshub.rssforever.com/thepaper/featured', name: '澎湃新闻' },
    { url: 'https://rsshub.rssforever.com/zhihu/daily',        name: '知乎日报' },
    { url: 'https://rsshub.app/thepaper/featured',             name: '澎湃新闻' }
  ];
  var results = [];
  var seenName = new Set();
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    if (seenName.has(src.name) && results.length > 0) continue;
    try {
      var res = await httpGet(src.url, {}, 6000);
      if (!res.ok) continue;
      var xml = await res.text();
      var items = parseRSS(xml);
      if (items.length === 0) continue;
      console.log('要闻 ' + src.name + ' 成功: ' + items.length);
      var picked = items.slice(0, 5).map(function(it) {
        return { title: it.title, description: it.description || '点击查看详情', source: src.name, time: formatDate(it.pubDate) || getNow(), url: it.url };
      });
      results = results.concat(picked);
      seenName.add(src.name);
    } catch (e) { console.error('要闻 ' + src.name + ': ' + e.message); }
  }
  var seenT = new Set();
  return results.filter(function(it) { if (seenT.has(it.title)) return false; seenT.add(it.title); return true; }).slice(0, 10);
}

async function getHotTopics() {
  var [weiboRes, biliRes] = await Promise.allSettled([getWeibo(), getBilibili()]);
  var results = [];
  if (weiboRes.status === 'fulfilled') results = results.concat(weiboRes.value);
  if (biliRes.status  === 'fulfilled') results = results.concat(biliRes.value);
  return results;
}

async function getWeibo() {
  var mirrors = [
    'https://rsshub.rssforever.com/weibo/search/hot',
    'https://hub.slarker.me/weibo/search/hot',
    'https://rsshub.app/weibo/search/hot'
  ];
  for (var i = 0; i < mirrors.length; i++) {
    try {
      var res = await httpGet(mirrors[i], {}, 5000);
      if (!res.ok) continue;
      var xml = await res.text();
      var items = parseRSS(xml);
      if (items.length === 0) continue;
      console.log('微博成功: ' + mirrors[i]);
      return items.slice(0, 8).map(function(it, idx) {
        return { title: it.title, description: '热议中', source: '微博热搜', time: getNow(), url: it.url, rank: idx + 1 };
      });
    } catch (e) { console.error('微博 ' + mirrors[i] + ': ' + e.message); }
  }
  return [];
}

async function getBilibili() {
  try {
    var res = await httpGet('https://api.bilibili.com/x/web-interface/search/square?limit=10',
      { headers: { 'Referer': 'https://www.bilibili.com' } }, 5000);
    var data = await res.json();
    var list = (data && data.data && data.data.trending && data.data.trending.list) || [];
    if (list.length === 0) return [];
    console.log('B站成功: ' + list.length);
    return list.slice(0, 8).map(function(it, idx) {
      return { title: it.keyword || it.show_name, description: '搜索热词', source: 'B站热搜', time: getNow(), url: 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(it.keyword || ''), rank: idx + 1 };
    });
  } catch (e) { console.error('B站: ' + e.message); return []; }
}

// ── 投资参考 ────────────────────────────────────────────────

async function getInvestmentData() {
  var [indicesRes, sectorsRes, liquorRes, gainersRes] = await Promise.allSettled([
    getIndices(),
    getHotSectors(),
    getLiquorStocks(),
    getGainers()
  ]);
  var indices    = indicesRes.status  === 'fulfilled' ? indicesRes.value  : [];
  var hotSectors = sectorsRes.status  === 'fulfilled' ? sectorsRes.value  : [];
  var liquor     = liquorRes.status   === 'fulfilled' ? liquorRes.value   : [];
  var fundPolicy = gainersRes.status  === 'fulfilled' ? gainersRes.value  : [];

  console.log('投资数据: 指数' + indices.length + ' 板块' + hotSectors.length + ' 白酒' + liquor.length + ' 涨幅榜' + fundPolicy.length);

  var aiSummary = '';
  if (indices.length > 0 || hotSectors.length > 0 || liquor.length > 0) {
    var idxText = indices.length > 0
      ? indices.map(function(i) { return i.name + ' ' + i.price + ' ' + (i.isUp ? '涨' : '跌') + i.changePct + '%'; }).join('、')
      : '指数数据暂无';
    var sectorText = hotSectors.length > 0
      ? '今日领涨板块：' + hotSectors.slice(0, 3).map(function(s) { return s.name + '(+' + s.changePct + '%)'; }).join('、')
      : '';
    var liquorText = liquor.length > 0
      ? '白酒板块代表：' + liquor.slice(0, 3).map(function(s) { return s.name + (s.isUp ? '+' : '') + s.changePct + '%'; }).join('、')
      : '';
    aiSummary = await deepseekChat(
      '你是用大白话讲股市的朋友，回答120字以内，不用专业术语，给重仓白酒的用户提建议。',
      '今日A股：\n大盘：' + idxText + '\n' + sectorText + '\n' + liquorText +
      '\n\n用3句大白话总结：①大盘今天怎么样 ②白酒板块怎么走 ③重仓白酒的投资者今天该注意什么。',
      300
    );
  } else {
    aiSummary = '今日所有行情接口暂时不可用，请稍后刷新重试。';
  }

  return { indices: indices, aiSummary: aiSummary, hotSectors: hotSectors, liquor: liquor, fundPolicy: fundPolicy };
}

async function getIndices() {
  var list = [
    { secid: '1.000001', name: '上证指数', code: '000001' },
    { secid: '0.399001', name: '深证成指', code: '399001' },
    { secid: '0.399006', name: '创业板指', code: '399006' },
    { secid: '1.000300', name: '沪深300',  code: '000300' }
  ];
  try {
    var res = await httpGet(
      'https://push2.eastmoney.com/api/qt/ulist.np/get?secids=' + list.map(function(i){return i.secid;}).join(',') +
      '&fields=f2,f3,f4,f12,f14&fltt=2&ut=bd1d9ddb04089700cf9c27f6f7426281', {}, 6000);
    var data = await res.json();
    var diff = (data && data.data && data.data.diff) || [];
    if (diff.length > 0) {
      console.log('指数成功: ' + diff.length);
      return diff.map(function(item) {
        var info = list.filter(function(i) { return i.code === item.f12; })[0] || {};
        var pct = parseFloat(item.f3) || 0;
        return { name: info.name || item.f14, price: item.f2, change: (parseFloat(item.f4) || 0).toFixed(2), changePct: pct.toFixed(2), isUp: pct >= 0 };
      });
    }
  } catch (e) { console.error('指数: ' + e.message); }
  return [];
}

async function getHotSectors() {
  try {
    var url = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=15&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f2,f3,f12,f14,f104,f105,f128&ut=bd1d9ddb04089700cf9c27f6f7426281';
    var res = await httpGet(url, {}, 6000);
    var data = await res.json();
    var diff = (data && data.data && data.data.diff) || [];
    console.log('板块涨跌成功: ' + diff.length);
    return diff.slice(0, 10).map(function(item) {
      var pct = parseFloat(item.f3) || 0;
      var sign = pct >= 0 ? '+' : '';
      return {
        title: item.f14 + '  ' + sign + pct.toFixed(2) + '%',
        description: '领涨股：' + (item.f128 || '-') + '  上涨 ' + (item.f104 || 0) + ' 家 / 下跌 ' + (item.f105 || 0) + ' 家',
        source: '行业板块',
        time: getNow(),
        url: 'https://quote.eastmoney.com/bk/90.' + item.f12 + '.html',
        stockInfo: sign + pct.toFixed(2) + '%',
        name: item.f14
      };
    });
  } catch (e) { console.error('板块: ' + e.message); return []; }
}

async function getLiquorStocks() {
  try {
    var url = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:BK0464&fields=f2,f3,f4,f12,f14&ut=bd1d9ddb04089700cf9c27f6f7426281';
    var res = await httpGet(url, {}, 6000);
    var data = await res.json();
    var diff = (data && data.data && data.data.diff) || [];
    console.log('白酒成分股成功: ' + diff.length);
    return diff.slice(0, 12).map(function(item) {
      var pct = parseFloat(item.f3) || 0;
      var price = item.f2;
      var change = item.f4 || 0;
      var sign = pct >= 0 ? '+' : '';
      var market = String(item.f12).charAt(0) === '6' ? 'sh' : 'sz';
      return {
        title: item.f14 + '  ' + price + ' 元',
        description: '涨跌幅：' + sign + pct.toFixed(2) + '%  涨跌额：' + sign + change + ' 元',
        source: '白酒板块',
        time: getNow(),
        url: 'https://quote.eastmoney.com/' + market + item.f12 + '.html',
        stockInfo: sign + pct.toFixed(2) + '%',
        isUp: pct >= 0,
        changePct: pct.toFixed(2),
        name: item.f14
      };
    });
  } catch (e) { console.error('白酒: ' + e.message); return []; }
}

async function getGainers() {
  try {
    var url = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=15&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f4,f12,f14&ut=bd1d9ddb04089700cf9c27f6f7426281';
    var res = await httpGet(url, {}, 6000);
    var data = await res.json();
    var diff = (data && data.data && data.data.diff) || [];
    console.log('涨幅榜成功: ' + diff.length);
    return diff.slice(0, 12).map(function(item) {
      var pct = parseFloat(item.f3) || 0;
      var price = item.f2;
      var change = item.f4 || 0;
      var sign = pct >= 0 ? '+' : '';
      var market = String(item.f12).charAt(0) === '6' ? 'sh' : 'sz';
      return {
        title: item.f14 + '  ' + sign + pct.toFixed(2) + '%',
        description: '现价：' + price + ' 元  涨跌额：' + sign + change + ' 元',
        source: '涨幅榜',
        time: getNow(),
        url: 'https://quote.eastmoney.com/' + market + item.f12 + '.html',
        stockInfo: sign + pct.toFixed(2) + '%',
        name: item.f14
      };
    });
  } catch (e) { console.error('涨幅榜: ' + e.message); return []; }
}
