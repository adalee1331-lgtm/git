const fields = ["endpoint", "model", "apiKey", "target", "resume", "threshold"];
const defaults = { endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini", threshold: 70, pendingJobs: [], configSavedAt: 0 };
function escapeHtml(text) { const div = document.createElement("div"); div.textContent = String(text ?? ""); return div.innerHTML; }
function configState(values) {
  const missing = [];
  if (!values.endpoint) missing.push("API 地址");
  if (!values.model) missing.push("模型名称");
  if (!values.apiKey) missing.push("API Key");
  if (!values.resume) missing.push("简历");
  const node = document.getElementById("config-state");
  if (missing.length) { node.className = "config-state incomplete"; node.textContent = `本地配置未完成：还需要 ${missing.join("、")}`; return; }
  const time = values.configSavedAt ? new Date(values.configSavedAt).toLocaleString("zh-CN", { hour12: false }) : "已读取";
  node.className = "config-state saved";
  node.textContent = `✓ 配置已保存并已回读验证（${time}） · ${values.model}`;
}
function renderQueue(jobs) {
  const queue = document.getElementById("queue");
  const pending = jobs.filter(job => job.status === "pending" || job.status === "filled-awaiting-send");
  queue.innerHTML = pending.length ? pending.map(job => {
    const gaps = (job.skillGaps || []).filter(g => g.gap !== "已具备").slice(0, 2).map(g => escapeHtml(g.skill)).join("、") || "无明显缺口";
    const state = job.status === "filled-awaiting-send" ? "已填入，待发送" : "待确认";
    return `<article class="job-card"><div class="job-top"><b>${escapeHtml(job.title)}</b><span class="score">${job.score}%</span></div><p class="state">${state} · ${escapeHtml(job.verdict)}</p><p class="gaps">技能差距：${gaps}</p><p class="greeting">${escapeHtml(job.greeting)}</p><div class="card-actions"><button data-open="${escapeHtml(job.url)}">打开岗位</button><button class="secondary" data-skip="${job.id}">跳过</button></div></article>`;
  }).join("") : "<p class=\"empty\">暂无待确认岗位。请在 Boss 岗位详情页点击“分析当前岗位”。</p>";
  queue.querySelectorAll("[data-open]").forEach(button => button.onclick = () => chrome.tabs.create({ url: button.dataset.open }));
  queue.querySelectorAll("[data-skip]").forEach(button => button.onclick = () => chrome.runtime.sendMessage({ type: "updateQueueStatus", id: button.dataset.skip, status: "skipped" }, load));
}
function load() {
  chrome.storage.local.get(defaults, values => {
    fields.forEach(id => { document.getElementById(id).value = values[id] ?? ""; });
    renderQueue(values.pendingJobs || []); configState(values);
  });
}
function formValues() { return Object.fromEntries(fields.map(id => [id, document.getElementById(id).value.trim()])); }
document.getElementById("save").onclick = () => {
  const button = document.getElementById("save"); const state = document.getElementById("config-state");
  const values = { ...formValues(), configSavedAt: Date.now() };
  button.disabled = true; button.textContent = "正在保存并验证…";
  chrome.storage.local.set(values, () => {
    if (chrome.runtime.lastError) { state.className = "config-state error"; state.textContent = `保存失败：${chrome.runtime.lastError.message}`; button.disabled = false; button.textContent = "保存并验证配置"; return; }
    chrome.storage.local.get(fields.concat("configSavedAt"), stored => {
      const verified = fields.every(id => String(stored[id] ?? "") === String(values[id] ?? ""));
      state.className = verified ? "config-state saved" : "config-state error";
      state.textContent = verified ? `✓ 配置已保存并已回读验证（${new Date(stored.configSavedAt).toLocaleString("zh-CN", { hour12: false })}）` : "保存后校验失败，请重新保存。";
      button.disabled = false; button.textContent = "保存并验证配置";
    });
  });
};
document.getElementById("refresh").onclick = load;
chrome.storage.onChanged.addListener(changes => { if (changes.pendingJobs) renderQueue(changes.pendingJobs.newValue || []); });
load();
