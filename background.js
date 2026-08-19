const DEFAULTS = {
  endpoint: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  threshold: 70,
  target: "",
  resume: "",
  pendingJobs: []
};

function completionUrl(endpoint) {
  const base = endpoint.replace(/\/$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function buildPrompt(settings, jobText) {
  return `你是一位严谨的中文求职顾问。依据候选人资料和岗位 JD 进行匹配。不得编造候选人没有的经历、技能或业绩。\n\n候选人资料：\n${settings.resume}\n\n目标方向与偏好：\n${settings.target || "未填写"}\n\n岗位 JD：\n${jobText}\n\n仅输出合法 JSON，不要 Markdown 或额外文字：\n{"matchScore":0-100整数,"verdict":"推荐"或"谨慎"或"不推荐","reasons":["最多4条具体匹配或风险"],"skillGaps":[{"skill":"岗位关键技能或经验","gap":"已具备"或"部分缺失"或"明显缺失","advice":"简短、可执行的补强建议"}],"greeting":"80-150字中文招呼语；对应 JD，诚实自然，不夸大"}`;
}

function savePendingJob(settings, sender, result) {
  const tab = sender.tab || {};
  const jobs = (settings.pendingJobs || []).filter(job => job.url !== tab.url);
  const job = {
    id: crypto.randomUUID(),
    title: tab.title || "未命名岗位", url: tab.url || "", analyzedAt: Date.now(), status: "pending",
    score: Math.max(0, Math.min(100, Number(result.matchScore) || 0)),
    verdict: result.verdict || "待判断",
    reasons: Array.isArray(result.reasons) ? result.reasons.slice(0, 4) : [],
    skillGaps: Array.isArray(result.skillGaps) ? result.skillGaps.slice(0, 6) : [],
    greeting: result.greeting || ""
  };
  jobs.unshift(job);
  chrome.storage.local.set({ pendingJobs: jobs.slice(0, 50) });
  return job;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === "updateQueueStatus") {
    chrome.storage.local.get({ pendingJobs: [] }, ({ pendingJobs }) => {
      chrome.storage.local.set({ pendingJobs: pendingJobs.map(job => job.id === message.id ? { ...job, status: message.status } : job) }, () => reply({ ok: true }));
    });
    return true;
  }
  if (message.type !== "analyze") return;
  chrome.storage.local.get(DEFAULTS, async settings => {
    if (!settings.apiKey || !settings.resume) return reply({ ok: false, error: "请先在扩展配置中填写 API Key 和简历。" });
    try {
      const response = await fetch(completionUrl(settings.endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          model: settings.model, temperature: 0.3,
          messages: [{ role: "system", content: "你只输出有效 JSON。" }, { role: "user", content: buildPrompt(settings, message.jobText) }]
        })
      });
      if (!response.ok) throw new Error(`API 请求失败：${response.status} ${await response.text()}`);
      const content = (await response.json()).choices?.[0]?.message?.content;
      if (!content) throw new Error("API 未返回可用内容。");
      const result = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
      const job = savePendingJob(settings, sender, result);
      reply({ ok: true, result, jobId: job.id, threshold: Number(settings.threshold) || 70 });
    } catch (error) { reply({ ok: false, error: error.message || "分析失败" }); }
  });
  return true;
});
