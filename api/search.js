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
    const item = {
      title: get('title'),
      description: desc,
      pubDate: get('pubDate') || get('dc:date'),
      url: lm ? lm[1].trim() : ''
    };
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
  } finally {
    clearTimeout(id);
  }
}

async function getAINews() {
  var KW = ['AI', '人工智能', '大模型', 'GPT', 'OpenAI', 'Anthropic', 'Claude',
    'Gemini', '文心', '通义', '智谱', 'DeepSeek', 'LLM', 'Sora', '多模态'];

  var sources = [
    { url: 'https://www.qbitai.com/feed',   name: '量子位',   filter: false },
    { url: 'https://www.jiqizhixin.com/rss', name: '机器之心', filter: false },
    { url: 'https://www.ithome.com/rss/',    name: 'IT之家',   filter: true  }
  ];

  var results = [];
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    try {
      var res = await httpGet(src.url, {}, 6000);
      if (!res.ok) continue;
      var xml = await res.text();
      var items = parseRSS(xml);
      if (src.filter) {
        items = items.filter(function(item) {
          return KW.some(function(k) { return item.title.includes(k) || item.description.includes(k); });
        });
      }
      var formatted = items.slice(0, 5).map(function(item) {
        return {
          title: item.title,
          description: item.description || '点击查看详情',
          source: src.name,
          time: formatDate(item.pubDate),
          url: item.url
        };
      });
      results = results.concat(formatted);
    } catch (e) {
      console.error('AI RSS ' + src.name + ': ' + e.message);
    }
  }

  var seen = new Set();
  return results.filter(function(item) {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  }).slice(0, 8);
}

async function getSocietyNews() {
  var attempts = [
    'https://rsshub.rssforever.com/weibo/search/hot',
    'https://rsshub.rssforever.com/zhihu/hot',
    'https://rss.shab.fun/weibo/search/hot',
    'https://rss.shab.fun/zhihu/hot',
    'https://hub.slarker.me/weibo/search/hot',
    'https://hub.slarker.me/zhihu/hot',
    'https://rsshub.app/weibo/search/hot',
    'https://rsshub.app/zhihu/hot'
  ];

  var names = {
    'weibo': '微博热搜',
    'zhihu': '知乎热榜'
  };

  for (var i = 0; i < attempts.length; i++) {
    var url = attempts[i];
    var name = url.includes('weibo') ? '微博热搜' : '知乎热榜';
    try {
      console.log('尝试: ' + url);
      var res = await httpGet(url, {}, 4000);
      if (!res.ok) { console.log('状态码失败: ' + res.status); continue; }
      var xml = await res.text();
      var items = parseRSS(xml);
      if (items.length === 0) { console.log('解析结果为空'); continue; }
      console.log('民生成功: ' + url + ' (' + items.length + '条)');
      return items.slice(0, 10).map(function(item, idx) {
        return {
          title: '#' + (idx + 1) + ' ' + item.title,
          description: item.description || '点击查看详情',
          source: name,
          time: formatDate(item.pubDate) || getNow(),
          url: item.url,
          rank: idx + 1
        };
      });
    } catch (e) {
      console.error('失败 ' + url + ': ' + e.message);
    }
  }
  return [];
}
async function getLiquorNews() {
  var stocks = [
    { secid: '1.600519', name: '贵州茅台', code: 'sh600519' },
    { secid: '0.000858', name: '五粮液',   code: 'sz000858' },
    { secid: '0.000568', name: '泸州老窖', code: 'sz000568' },
    { secid: '1.600809', name: '山西汾酒', code: 'sh600809' }
  ];

  var results = [];

  try {
    var secids = stocks.map(function(s) { return s.secid; }).join(',');
    var res = await httpGet(
      'https://push2.eastmoney.com/api/qt/ulist.np/get?secids=' + secids +
      '&fields=f2,f3,f4,f14,f15,f16,f17&fltt=2&ut=bd1d9ddb04089700cf9c27f6f7426281',
      {}, 5000);
    var data = await res.json();
    var diff = (data && data.data && data.data.diff) ? data.data.diff : [];
    for (var i = 0; i < diff.length; i++) {
      var s = diff[i];
      var stock = stocks[i];
      var price = s.f2 || '-';
      var pct = s.f3 || 0;
      var change = s.f4 || 0;
      var sign = pct >= 0 ? '+' : '';
      results.push({
        title: stock.name + '  ' + price + ' 元',
        description: '涨跌: ' + sign + change + ' (' + sign + pct + '%)  今开: ' + s.f17 + '  最高: ' + s.f15 + '  最低: ' + s.f16,
        source: '东方财富',
        time: getNow(),
        url: 'https://quote.eastmoney.com/' + stock.code + '.html',
        stockInfo: price + ' ' + sign + pct + '%'
      });
    }
  } catch (e) {
    console.error('东方财富股价: ' + e.message);
  }

  try {
    var newsRes = await httpGet(
      'https://np-listapi.eastmoney.com/comm/web/getListInfo?type=1&client=web&biz=web_news_search&keyword=%E7%99%BD%E9%85%92&pageSize=5&pageIndex=1&_=' + Date.now(),
      {}, 5000);
    var newsData = await newsRes.json();
    var list = (newsData && newsData.data && newsData.data.list) ? newsData.data.list : [];
    for (var j = 0; j < Math.min(list.length, 4); j++) {
      var item = list[j];
      results.push({
        title: item.title,
        description: item.digest || '点击查看详情',
        source: item.mediaName || '东方财富',
        time: item.publishTime ? formatDate(item.publishTime) : getNow(),
        url: item.url || 'https://finance.eastmoney.com'
      });
    }
  } catch (e) {
    console.error('东方财富新闻: ' + e.message);
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
