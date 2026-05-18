import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS 头
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const results = {
      ai: await getAINews(),
      society: await getSocietyNews(),
      liquor: await getLiquorNews(),
      updateTime: new Date().toLocaleString('zh-CN', { 
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-')
    };

    res.status(200).json(results);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: '获取热点失败',
      message: error.message 
    });
  }
}

// ==================== AI领域：保留 DeepSeek ====================
async function getAINews() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY 未配置');
  }

  const prompt = `请提供最新的AI领域热点新闻（最近24小时内），每条包含：
1. 标题
2. 简述（50字以内）
3. 来源网站
4. 发布时间（格式：2024-05-18 14:32）
5. 原文链接（必须是真实存在的URL）

要求：
- 提供5条新闻
- 优先国内AI动态（百度、阿里、字节等）
- 必须是最近24小时的消息
- 时间必须精确到分钟

请以JSON格式返回，格式：
[
  {
    "title": "标题",
    "description": "简述",
    "source": "来源",
    "time": "2024-05-18 14:32",
    "url": "链接"
  }
]`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一个专业的AI行业资讯助手，只返回JSON格式数据，不添加任何其他文字。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API 错误: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  // 提取 JSON（处理可能的 markdown 包裹）
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('DeepSeek 返回格式错误');
  }
  
  return JSON.parse(jsonMatch[0]);
}

// ==================== 民生社会：微博热搜 ====================
async function getSocietyNews() {
  try {
    // 使用免费的微博热搜API（GitHub开源项目）
    const response = await fetch('https://weibo-hot-api.vercel.app/api');
    
    if (!response.ok) {
      throw new Error('微博热搜API请求失败');
    }

    const data = await response.json();
    
    // 格式化为统一结构，取前8条
    return data.data.slice(0, 8).map((item, index) => ({
      title: `#${index + 1} ${item.title}`,
      description: item.desc || `热度: ${item.hot || '未知'}`,
      source: '微博热搜',
      time: new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(/\//g, '-'),
      url: item.url || `https://s.weibo.com/weibo?q=${encodeURIComponent(item.title)}`,
      rank: index + 1,
      hot: item.hot || 0
    }));
  } catch (error) {
    console.error('微博热搜获取失败:', error);
    
    // 备用方案：使用另一个热搜API
    try {
      const backupResponse = await fetch('https://api.vvhan.com/api/hotlist/wbHot');
      const backupData = await backupResponse.json();
      
      if (backupData.success && backupData.data) {
        return backupData.data.slice(0, 8).map((item, index) => ({
          title: `#${index + 1} ${item.title}`,
          description: `热度: ${item.hot || '未知'}`,
          source: '微博热搜',
          time: new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).replace(/\//g, '-'),
          url: item.url || item.mobilUrl,
          rank: index + 1,
          hot: item.hot || 0
        }));
      }
    } catch (backupError) {
      console.error('备用API也失败:', backupError);
    }
    
    // 如果所有API都失败，返回空数组
    return [];
  }
}

// ==================== 白酒行业：DeepSeek ====================
async function getLiquorNews() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  const prompt = `请提供白酒行业最新动态（最近24小时），包括：
1. 白酒上市公司新闻（茅台、五粮液、泸州老窖等）
2. 白酒股价动态（涨跌情况）
3. 行业政策或市场消息

每条包含：
- 标题
- 简述（50字内）
- 来源（新浪财经/东方财富/雪球等）
- 时间（格式：2024-05-18 14:32）
- 链接

返回5-8条，JSON格式：
[
  {
    "title": "标题",
    "description": "简述",
    "source": "来源",
    "time": "2024-05-18 14:32",
    "url": "链接",
    "stockInfo": "股价信息（如有）"
  }
]`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是白酒行业资讯专家，只返回JSON格式，不添加其他内容。优先提供股价和财经数据。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error('白酒资讯API错误');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return [];
  } catch (error) {
    console.error('白酒资讯获取失败:', error);
    return [];
  }
}
