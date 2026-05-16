export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  
  const { topic, label } = req.body;
  
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `你是信息助手。搜索"${label}"领域最新热点，严格返回如下JSON数组，不输出任何其他内容：
[{"headline":"标题20字内","summary":"核心内容50字内","source":"来源","url":"链接或空字符串","topic":"${topic}"}]`,
        messages: [{ role: "user", content: `搜索${label}领域近期重要热点，返回4条。` }],
      }),
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    const s = text.indexOf("["), e = text.lastIndexOf("]");
    if (s === -1 || e === -1) return res.json({ items: [] });
    const items = JSON.parse(text.slice(s, e + 1));
    res.json({ items: Array.isArray(items) ? items : [] });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
