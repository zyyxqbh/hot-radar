export default async function handler(req, res) {
  // 添加CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic, label } = req.body;
  
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: '未配置API Key' });
  }

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `你是信息助手。用户想了解${label}领域的最新热点。请根据你的知识返回4条近期重要动态，严格按如下JSON数组格式返回，不输出任何其他内容：[{"headline":"标题20字内","summary":"核心内容50字内","source":"来源媒体","url":"","topic":"${topic}"}]`
          },
          {
            role: "user",
            content: `请给我${label}领域最近的4条重要热点。`
          }
        ],
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    
    const s = text.indexOf("[");
    const e = text.lastIndexOf("]");
    
    if (s === -1 || e === -1) {
      return res.json({ items: [] });
    }
    
    const items = JSON.parse(text.slice(s, e + 1));
    res.json({ items: Array.isArray(items) ? items : [] });
    
  } catch(error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
