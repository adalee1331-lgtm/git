const fields = ["endpoint", "model", "apiKey", "target", "resume", "threshold"];
const defaults = { endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini", threshold: 70, pendingJobs: [] };
function escapeHtml(text) { const div = document.createElement("div"); div.textContent = String(text ?? ""); return div.innerHTML; }
function renderQueue(jobs) {
  const queue = document.getElementById("queue");
  const pending = jobs.filter(job => job.status === "pending" || job.status === "filled-awaiting-send");
  queue.innerHTML = pending.length ? pending.map(job => {
    const gaps = (job.skillGaps || []).filter(g => g.gap !== "已具备").slice(0, 2).map(g => escapeHtml(g.skill)).join("、") || "无明显缺口";
    const state = job.status === "filled-awaiting-send" ? "已填入，待发送" : "待确认";
    return `<article class="job-card"><div class="job-top"><b>${escapeHtml(job.title)}</b><span class="score">${job.score}%</span></div><p class="state">${state} · ${escapeHtml(job.verdict)}</p><p class="gaps">技能差距：${gaps}</p><p class="greeting">${escapeHtml(job.greeting)}</p><div class="card-actions"><button data-open="${escapeHtml(job.url)}">打开岗位</button><button class="secondary" data-skip="${job.id}">跳过</button></div></article>`;
  }).join("") : "<p class=\"empty\">暂无待确认岗位。请在 Boss 岗位详情页点击“分析当前岗位”。</p>";
  queue.querySelectorAll("[data-open]").forEach(button => button.onclick = () => chrome.tabs.create({ url: button.dataset.open }));
  queue.querySelectorAll("[data-skip]").forEach(button => button.onclick = () => {
    chrome.runtime.sendMessage({ type: "updateQueueStatus", id: button.dataset.skip, status: "skipped" }, load);
  });
}
function load() {
  chrome.storage.local.get(defaults, values => {
    fields.forEach(id => { document.getElementById(id).value = values[id] ?? ""; });
    renderQueue(values.pendingJobs || []);
  });
}
document.getElementById("save").onclick = () => {
  const values = Object.fromEntries(fields.map(id => [id, document.getElementById(id).value.trim()]));
  chrome.storage.local.set(values, () => { document.getElementById("status").textContent = "已保存"; setTimeout(() => document.getElementById("status").textContent = "", 1800); });
};
document.getElementById("refresh").onclick = load;
chrome.storage.onChanged.addListener(load);
load();
