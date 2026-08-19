const DEFAULTS = {
  endpoint: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  threshold: 70,
  target: "",
  resume: ""
};

function completionUrl(endpoint) {
  return endpoint.replace(/\/$/, "").endsWith("/chat/completions")
    ? endpoint.replace(/\/$/, "")
    : `${endpoint.replace(/\/$/, "")}/chat/completions`;
}

function buildPrompt(settings, jobText) {
  return `你是一位严谨的中文求职顾问。根据“候选人资料”和“岗位页面文本”进行匹配，不要编造候选人没有的经历或技能。\n\n候选人资料：\n${settings.resume}\n\n目标投递方向与偏好：\n${settings.target || "未填写"}\n\n岗位页面文本：\n${jobText}\n\n只输出一个合法 JSON 对象，不要 Markdown，不要额外文字，结构必须为：\n{"matchScore":0-100整数,"verdict":"推荐"或"谨慎"或"不推荐","reasons":["最多4条，具体说明匹配或缺口"],"greeting":"80-150字中文招呼语，针对岗位要求，诚实、自然、主动表达价值，不使用夸张措辞"}`;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type !== "analyze") return;
  chrome.storage.local.get(DEFAULTS, async settings => {
    if (!settings.apiKey || !settings.resume) {
      reply({ ok: false, error: "请先在扩展配置中填写 API Key 和简历。" });
      return;
    }
    try {
      const response = await fetch(completionUrl(settings.endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "你只输出有效 JSON。" },
            { role: "user", content: buildPrompt(settings, message.jobText) }
          ]
        })
      });
      if (!response.ok) throw new Error(`API 请求失败：${response.status} ${await response.text()}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("API 未返回可用内容。");
      const result = JSON.parse(content);
      reply({ ok: true, result, threshold: Number(settings.threshold) || 70 });
    } catch (error) {
      reply({ ok: false, error: error.message || "分析失败" });
    }
  });
  return true;
});
