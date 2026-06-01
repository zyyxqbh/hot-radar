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
  var [indicesRes, financeRes] = await Promise.allSettled([getIndices(), getFinanceNews()]);
  var indices = indicesRes.status === 'fulfilled' ? indicesRes.value : [];
  var allNews = financeRes.status === 'fulfilled' ? financeRes.value : [];

  var hotSectors = filterByKeywords(allNews, ['涨停','板块','主力','龙头','题材','热点','概念'], 6);
  var liquor     = filterByKeywords(allNews, ['白酒','茅台','五粮液','泸州老窖','汾酒','酒企'], 6);
  var fundPolicy = filterByKeywords(allNews, ['基金','央行','货币','降准','降息','利率','美联储','政策'], 6);

  if (hotSectors.length === 0) hotSectors = allNews.slice(0, 6);
  if (fundPolicy.length === 0) fundPolicy = allNews.slice(6, 12);

  console.log('投资数据: 指数' + indices.length + ' 总新闻' + allNews.length + ' 板块' + hotSectors.length + ' 白酒' + liquor.length + ' 基金' + fundPolicy.length);

  var aiSummary = '';
  if (indices.length > 0 || allNews.length > 0) {
    var idxText = indices.length > 0
      ? indices.map(function(i) { return i.name + ' ' + i.price + ' ' + (i.isUp ? '涨' : '跌') + i.changePct + '%'; }).join('、')
      : '指数数据暂无';
    var news = hotSectors.slice(0, 2).concat(liquor.slice(0, 2)).concat(fundPolicy.slice(0, 2));
    var newsText = news.length > 0 ? news.map(function(n) { return '• ' + n.title; }).join('\n') : '暂无新闻';
    aiSummary = await deepseekChat(
      '你是用大白话讲股市的朋友，回答100字以内，不用专业术语。',
      '今日A股：' + idxText + '\n今日要闻：\n' + newsText + '\n\n用3句大白话总结：①大盘今天怎么样 ②白酒板块需注意什么 ③普通投资者今天该做什么。',
      250
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
      console.log('指数(东财)成功: ' + diff.length);
      return diff.map(function(item) {
        var info = list.filter(function(i) { return i.code === item.f12; })[0] || {};
        var pct = parseFloat(item.f3) || 0;
        return { name: info.name || item.f14, price: item.f2, change: (parseFloat(item.f4) || 0).toFixed(2), changePct: pct.toFixed(2), isUp: pct >= 0 };
      });
    }
  } catch (e) { console.error('指数(东财): ' + e.message); }
  return [];
}

async function getFinanceNews() {
  var all = [];

  // 路线1：东方财富 7x24 快讯接口（既然指数能通，这个大概率也能通）
  var emEndpoints = [
    { url: 'https://np-listapi.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&pageSize=30&_=' + Date.now(), name: '东财快讯' },
    { url: 'https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_50_1.html?_=' + Date.now(), name: '东财老快讯' }
  ];

  for (var i = 0; i < emEndpoints.length; i++) {
    var ep = emEndpoints[i];
    try {
      var res = await httpGet(ep.url, { headers: { 'Referer': 'https://kuaixun.eastmoney.com/' } }, 6000);
      console.log(ep.name + ' 状态: ' + res.status);
      if (!res.ok) continue;
      var raw = await res.text();
      var jsonStr = raw.replace(/^[^{[]+/, '').replace(/[^}\]]+$/, '');
      try {
        var data = JSON.parse(jsonStr);
        var list = (data && data.data && data.data.fastNewsList) ||
                   (data && data.data && data.data.list) ||
                   (data && data.LivesList) ||
                   (data && data.list) || [];
        console.log(ep.name + ' 数据条数: ' + list.length);
        if (list.length === 0) continue;
        all = all.concat(list.slice(0, 30).map(function(item) {
          return {
            title: item.title || item.Title || item.digest || '',
            description: item.digest || item.summary || item.Digest || '',
            source: '东方财富快讯',
            time: (item.showTime || item.publishTime || item.ShowTime) ? formatDate(item.showTime || item.publishTime || item.ShowTime) : getNow(),
            url: item.url || item.titleUrl || item.Url || 'https://kuaixun.eastmoney.com'
          };
        }));
        if (all.length >= 20) break;
      } catch (parseErr) {
        console.error(ep.name + ' JSON 解析失败: ' + parseErr.message);
      }
    } catch (e) { console.error(ep.name + ': ' + e.message); }
  }

  // 路线2：RSSHub 财联社（带详细日志）
  if (all.length === 0) {
    var rssSources = [
      'https://rsshub.rssforever.com/cls/telegraph',
      'https://rsshub.rssforever.com/cls/depth/1003',
      'https://rsshub.app/cls/telegraph',
      'https://rsshub.app/cls/depth/1003'
    ];
    for (var j = 0; j < rssSources.length; j++) {
      try {
        var res2 = await httpGet(rssSources[j], {}, 6000);
        console.log('RSS ' + rssSources[j] + ' 状态: ' + res2.status);
        if (!res2.ok) continue;
        var xml = await res2.text();
        var items = parseRSS(xml);
        console.log('RSS 解析: ' + items.length + ' 条');
        if (items.length === 0) continue;
        all = items.map(function(it) {
          return { title: it.title, description: it.description || '', source: '财联社', time: formatDate(it.pubDate) || getNow(), url: it.url };
        });
        break;
      } catch (e) { console.error('RSS ' + rssSources[j] + ': ' + e.message); }
    }
  }

  var seen = new Set();
  return all.filter(function(it) { if (seen.has(it.title)) return false; seen.add(it.title); return true; });
}

function filterByKeywords(news, keywords, size) {
  var filtered = news.filter(function(n) {
    var text = (n.title || '') + ' ' + (n.description || '');
    return keywords.some(function(k) { return text.indexOf(k) >= 0; });
  });
  return filtered.slice(0, size || 6);
}
