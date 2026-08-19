const DEFAULTS = { endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini", threshold: 70, target: "", resume: "", pendingJobs: [], dailySentDate: "", dailySentCount: 0 };
let sendQueue = [], sending = false, activeSend = null;
const today = () => new Date().toISOString().slice(0, 10);
const completionUrl = endpoint => { const base = endpoint.replace(/\/$/, ""); return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`; };
const cleanText = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&lt;|&gt;/g, " ").replace(/\s+/g, " ").trim().slice(0, 18000);
function prompt(settings, jd) { return `你是严谨的中文求职顾问。仅按资料和岗位JD匹配，不得虚构。\n候选人：\n${settings.resume}\n目标：\n${settings.target || "未填写"}\n岗位JD：\n${jd}\n只输出JSON：{"matchScore":0-100整数,"verdict":"推荐"或"谨慎"或"不推荐","reasons":["最多4条"],"skillGaps":[{"skill":"关键技能","gap":"已具备"或"部分缺失"或"明显缺失","advice":"简短补强建议"}],"greeting":"80-150字、真诚具体的中文招呼语"}`; }
async function analyze(settings, jd) {
  const response = await fetch(completionUrl(settings.endpoint), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify({ model: settings.model, temperature: 0.3, messages: [{ role: "system", content: "只输出有效JSON。" }, { role: "user", content: prompt(settings, jd) }] }) });
  if (!response.ok) throw new Error(`API请求失败：${response.status}`);
  const text = (await response.json()).choices?.[0]?.message?.content;
  if (!text) throw new Error("模型未返回内容");
  return JSON.parse(text.replace(/^\`\`\`(?:json)?\s*|\s*\`\`\`$/g, "").trim());
}
function jobRecord(item, result) { return { id: crypto.randomUUID(), title: item.title || "未命名岗位", url: item.url || "", analyzedAt: Date.now(), status: "pending", score: Math.max(0, Math.min(100, Number(result.matchScore) || 0)), verdict: result.verdict || "待判断", reasons: Array.isArray(result.reasons) ? result.reasons.slice(0, 4) : [], skillGaps: Array.isArray(result.skillGaps) ? result.skillGaps.slice(0, 6) : [], greeting: result.greeting || "" }; }
function persistJob(settings, job) { const jobs = [job, ...(settings.pendingJobs || []).filter(existing => existing.url !== job.url)].slice(0, 100); chrome.storage.local.set({ pendingJobs: jobs }); return job; }
function updateJob(id, patch, callback) { chrome.storage.local.get(DEFAULTS, settings => { const pendingJobs = settings.pendingJobs.map(job => job.id === id ? { ...job, ...patch } : job); chrome.storage.local.set({ pendingJobs }, callback); }); }
function daily(settings) { return settings.dailySentDate === today() ? settings.dailySentCount : 0; }
function finishSend(ok, error) {
  if (!activeSend) return;
  const { job, tabId } = activeSend; activeSend = null;
  if (tabId) chrome.tabs.remove(tabId).catch(() => {});
  chrome.storage.local.get(DEFAULTS, settings => {
    const count = daily(settings) + (ok ? 1 : 0);
    const pendingJobs = settings.pendingJobs.map(item => item.id === job.id ? { ...item, status: ok ? "sent" : "send-failed", sentAt: ok ? Date.now() : undefined, sendError: error || undefined } : item);
    chrome.storage.local.set({ pendingJobs, dailySentDate: today(), dailySentCount: count }, () => setTimeout(sendNext, 4000 + Math.floor(Math.random() * 2001)));
  });
}
function sendNext() {
  if (!sendQueue.length) { sending = false; return; }
  const job = sendQueue.shift();
  chrome.tabs.create({ url: job.url, active: false }, tab => {
    activeSend = { job, tabId: tab.id };
    let dispatched = false;
    const dispatch = () => {
      if (dispatched) return; dispatched = true;
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.sendMessage(tab.id, { type: "autoSend", greeting: job.greeting }, response => {
        if (chrome.runtime.lastError) finishSend(false, "无法连接岗位页面"); else finishSend(Boolean(response?.ok), response?.error);
      });
    };
    const listener = (id, info) => { if (id === tab.id && info.status === "complete") setTimeout(dispatch, 1200); };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(dispatch, 12000);
  });
}
function startSending(reply) {
  if (sending) return reply({ ok: false, error: "发送任务正在进行中" });
  chrome.storage.local.get(DEFAULTS, settings => {
    const remaining = Math.max(0, 150 - daily(settings));
    const approved = settings.pendingJobs.filter(job => job.status === "approved").slice(0, remaining);
    if (!approved.length) return reply({ ok: false, error: remaining ? "没有已确认的岗位" : "今日 150 条额度已用完" });
    sending = true; sendQueue = approved;
    chrome.storage.local.set({ pendingJobs: settings.pendingJobs.map(job => approved.some(item => item.id === job.id) ? { ...job, status: "send-queued" } : job) }, () => { sendNext(); reply({ ok: true, count: approved.length, remaining }); });
  });
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === "updateQueueStatus") { updateJob(message.id, { status: message.status }, () => reply({ ok: true })); return true; }
  if (message.type === "startSending") { startSending(reply); return true; }
  if (message.type === "analyze") {
    chrome.storage.local.get(DEFAULTS, async settings => {
      if (!settings.apiKey || !settings.resume) return reply({ ok: false, error: "请先填写并保存 API Key 和简历。" });
      try { const result = await analyze(settings, message.jobText); const job = persistJob(settings, jobRecord({ title: sender.tab?.title, url: sender.tab?.url }, result)); reply({ ok: true, result, jobId: job.id, threshold: Number(settings.threshold) || 70 }); } catch (error) { reply({ ok: false, error: error.message }); }
    }); return true;
  }
  if (message.type === "analyzeBatch") {
    chrome.storage.local.get(DEFAULTS, async settings => {
      if (!settings.apiKey || !settings.resume) return reply({ ok: false, error: "请先填写并保存 API Key 和简历。" });
      const items = (message.jobs || []).slice(0, 20); let added = 0, failed = 0;
      for (const item of items) try { const response = await fetch(item.url, { credentials: "include" }); const result = await analyze(settings, cleanText(await response.text())); persistJob(settings, jobRecord(item, result)); added++; } catch { failed++; }
      reply({ ok: true, added, failed });
    }); return true;
  }
});
