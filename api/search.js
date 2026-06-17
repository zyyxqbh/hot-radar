import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const [headlines, hot, international, breaking] = await Promise.allSettled([
    getHeadlines(),
    getHotTopics(),
    getInternationalNews(),
    getBreakingPerspective()
  ]);

  res.status(200).json({
    headlines:     headlines.status     === 'fulfilled' ? headlines.value     : [],
    hot:           hot.status           === 'fulfilled' ? hot.value           : [],
    international: international.status === 'fulfilled' ? international.value : [],
    breaking:      breaking.status      === 'fulfilled' ? breaking.value      : [],
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
        temperature: 0.3, max_tokens: maxTokens || 200
      })
    }, 12000);
    var data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  } catch (e) { console.error('DeepSeek: ' + e.message); return ''; }
}

// 将英文新闻标题/简介批量翻译为中文，失败时原样返回（保留英文）
async function translateNews(items) {
  if (items.length === 0) return items;
  try {
    var input = items.map(function(it) { return { title: it.title, description: it.description }; });
    var content = await deepseekChat(
      '你是专业的英中新闻翻译。输入是一个JSON数组，每项包含title和description。请将每项翻译成简洁的中文新闻用语，保持原意，不要添加解释或评论。直接返回一个JSON数组，结构、顺序、数量与输入完全一致，只输出JSON本身，不要markdown代码块标记。',
      JSON.stringify(input),
      2500
    );
    if (!content) return items;
    var cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    var translated = JSON.parse(cleaned);
    if (!Array.isArray(translated) || translated.length !== items.length) return items;
    console.log('国际新闻翻译成功: ' + translated.length + ' 条');
    return items.map(function(it, i) {
      return Object.assign({}, it, {
        title: translated[i].title || it.title,
        description: translated[i].description || it.description
      });
    });
  } catch (e) { console.error('翻译失败: ' + e.message); return items; }
}

// ── 今日要闻 ────────────────────────────────────────────────

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

// ── 国内热议 ────────────────────────────────────────────────

async function getHotTopics() {
  var [weiboRes, biliRes, zhihuRes, toutiaoRes] = await Promise.allSettled([getWeibo(), getBilibili(), getZhihuHot(), getToutiao()]);
  var results = [];
  if (weiboRes.status   === 'fulfilled') results = results.concat(weiboRes.value);
  if (biliRes.status    === 'fulfilled') results = results.concat(biliRes.value);
  if (zhihuRes.status   === 'fulfilled') results = results.concat(zhihuRes.value);
  if (toutiaoRes.status === 'fulfilled') results = results.concat(toutiaoRes.value);
  return results;
}

async function getToutiao() {
  try {
    var res = await httpGet('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
      { headers: { 'Referer': 'https://www.toutiao.com/' } }, 5000);
    var data = await res.json();
    var list = (data && data.data) || [];
    if (list.length === 0) return [];
    console.log('头条成功: ' + list.length);
    return list.slice(0, 8).map(function(it, idx) {
      return {
        title: it.Title || it.title || '',
        description: it.HotValue ? '热度 ' + it.HotValue : '热议中',
        source: '今日头条',
        time: getNow(),
        url: it.Url || ('https://so.toutiao.com/search?keyword=' + encodeURIComponent(it.Title || '')),
        rank: idx + 1
      };
    }).filter(function(it) { return it.title; });
  } catch (e) { console.error('头条: ' + e.message); return []; }
}

async function getWeibo() {
  try {
    var res = await httpGet('https://weibo.com/ajax/side/hotSearch',
      { headers: { 'Referer': 'https://weibo.com' } }, 5000);
    var data = await res.json();
    var list = (data && data.data && data.data.realtime) || [];
    if (list.length === 0) return [];
    console.log('微博成功: ' + list.length);
    return list.slice(0, 8).map(function(it, idx) {
      var word = it.word || '';
      return {
        title: word,
        description: it.num ? '热度 ' + it.num : '热议中',
        source: '微博热搜',
        time: getNow(),
        url: 'https://s.weibo.com/weibo?q=' + encodeURIComponent(it.word_scheme || ('#' + word + '#')),
        rank: idx + 1
      };
    });
  } catch (e) { console.error('微博: ' + e.message); return []; }
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

async function getZhihuHot() {
  var sources = [
    'https://rsshub.rssforever.com/zhihu/hotlist',
    'https://rsshub.app/zhihu/hotlist'
  ];
  for (var i = 0; i < sources.length; i++) {
    try {
      var res = await httpGet(sources[i], {}, 6000);
      if (!res.ok) continue;
      var xml = await res.text();
      var items = parseRSS(xml);
      if (items.length === 0) continue;
      console.log('知乎热榜成功: ' + items.length);
      return items.slice(0, 8).map(function(it, idx) {
        return { title: it.title, description: it.description || '热议中', source: '知乎热榜', time: getNow(), url: it.url, rank: idx + 1 };
      });
    } catch (e) { console.error('知乎热榜 ' + sources[i] + ': ' + e.message); }
  }
  return [];
}

// ── 国际视野 ────────────────────────────────────────────────

async function getInternationalNews() {
  var sources = [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',  name: 'BBC World' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml',    name: 'Al Jazeera' },
    { url: 'https://www.theguardian.com/world/rss',        name: 'Guardian World' },
    { url: 'https://rss.dw.com/xml/rss-en-all',            name: 'DW News' }
  ];
  var results = [];
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    try {
      var res = await httpGet(src.url, {}, 8000);
      if (!res.ok) { console.log('国际 ' + src.name + ' 状态: ' + res.status); continue; }
      var xml = await res.text();
      var items = parseRSS(xml);
      if (items.length === 0) continue;
      console.log('国际 ' + src.name + ' 成功: ' + items.length);
      var picked = items.slice(0, 3).map(function(it) {
        return { title: it.title, description: it.description || 'Click for details', source: src.name, time: formatDate(it.pubDate), url: it.url };
      });
      results = results.concat(picked);
    } catch (e) { console.error('国际 ' + src.name + ': ' + e.message); }
  }
  var seen = new Set();
  var deduped = results.filter(function(it) { if (seen.has(it.title)) return false; seen.add(it.title); return true; }).slice(0, 12);
  return await translateNews(deduped);
}

// ── 破壁视角 ────────────────────────────────────────────────
// 平时主动不会看的异质视角：全球极客、深度科技、非大陆华语

async function getBreakingPerspective() {
  var [hn, sspai, zaobao] = await Promise.allSettled([getHackerNews(), getSspai(), getZaobao()]);
  var results = [];
  if (hn.status     === 'fulfilled') results = results.concat(hn.value);
  if (sspai.status  === 'fulfilled') results = results.concat(sspai.value);
  if (zaobao.status === 'fulfilled') results = results.concat(zaobao.value);
  return results;
}

// 只翻译标题（用于已自带中文简介的源，避免把分数/评论数也送去翻译）
async function translateTitles(items) {
  if (items.length === 0) return items;
  try {
    var input = items.map(function(it) { return it.title; });
    var content = await deepseekChat(
      '你是专业的英中翻译。输入是一个JSON字符串数组，每项是一条科技/新闻标题。请翻译成简洁的中文，保持原意，不要解释。直接返回一个JSON数组，顺序和数量与输入完全一致，只输出JSON本身，不要markdown代码块标记。',
      JSON.stringify(input),
      1500
    );
    if (!content) return items;
    var cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    var arr = JSON.parse(cleaned);
    if (!Array.isArray(arr) || arr.length !== items.length) return items;
    return items.map(function(it, i) { return Object.assign({}, it, { title: arr[i] || it.title }); });
  } catch (e) { console.error('标题翻译失败: ' + e.message); return items; }
}

async function getHackerNews() {
  try {
    var res = await httpGet('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=8', {}, 6000);
    var data = await res.json();
    var hits = (data && data.hits) || [];
    if (hits.length === 0) return [];
    console.log('Hacker News成功: ' + hits.length);
    var items = hits.slice(0, 6).map(function(it, idx) {
      return {
        title: it.title || '',
        description: (it.points || 0) + ' 分 · ' + (it.num_comments || 0) + ' 条讨论',
        source: 'Hacker News',
        time: getNow(),
        url: it.url || ('https://news.ycombinator.com/item?id=' + it.objectID),
        rank: idx + 1
      };
    }).filter(function(it) { return it.title; });
    return await translateTitles(items);
  } catch (e) { console.error('Hacker News: ' + e.message); return []; }
}

async function getSspai() {
  try {
    var res = await httpGet('https://sspai.com/feed', {}, 6000);
    if (!res.ok) return [];
    var xml = await res.text();
    var items = parseRSS(xml);
    if (items.length === 0) return [];
    console.log('少数派成功: ' + items.length);
    return items.slice(0, 5).map(function(it, idx) {
      return { title: it.title, description: it.description || '点击查看详情', source: '少数派', time: formatDate(it.pubDate) || getNow(), url: it.url, rank: idx + 1 };
    });
  } catch (e) { console.error('少数派: ' + e.message); return []; }
}

async function getZaobao() {
  var sources = [
    'https://rsshub.rssforever.com/zaobao/znews/china',
    'https://rsshub.app/zaobao/znews/china'
  ];
  for (var i = 0; i < sources.length; i++) {
    try {
      var res = await httpGet(sources[i], {}, 6000);
      if (!res.ok) continue;
      var xml = await res.text();
      var items = parseRSS(xml);
      if (items.length === 0) continue;
      console.log('联合早报成功: ' + items.length);
      return items.slice(0, 5).map(function(it, idx) {
        return { title: it.title, description: it.description || '点击查看详情', source: '联合早报', time: formatDate(it.pubDate) || getNow(), url: it.url, rank: idx + 1 };
      });
    } catch (e) { console.error('联合早报 ' + sources[i] + ': ' + e.message); }
  }
  return [];
}
