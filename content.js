(() => {
  if (document.getElementById("boss-ai-assistant")) return;
  let cooldownUntil = 0;
  let currentJobId = null;
  const panel = document.createElement("section");
  panel.id = "boss-ai-assistant";
  panel.innerHTML = `<header><span>求职助手 · 人工确认</span><button class="boss-ai-close" title="关闭">×</button></header><div class="body"><p class="boss-ai-status">打开岗位详情后，点击分析。</p><button class="boss-ai-analyze">分析当前岗位</button></div>`;
  document.documentElement.append(panel);
  const body = panel.querySelector(".body");
  panel.querySelector(".boss-ai-close").onclick = () => panel.remove();
  const jobText = () => document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 18000);
  const escapeHtml = text => { const div = document.createElement("div"); div.textContent = String(text ?? ""); return div.innerHTML; };
  const findChatInput = () => [...document.querySelectorAll("textarea, [contenteditable='true'], input[type='text']")].find(el => el.offsetParent !== null && !el.closest("#boss-ai-assistant"));
  const cooldownSeconds = () => Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  function updateCooldown() {
    const button = body.querySelector(".boss-ai-fill"); const note = body.querySelector(".boss-ai-note");
    if (!button || !note) return;
    const seconds = cooldownSeconds();
    if (seconds) { button.disabled = true; note.textContent = `操作冷却中：${seconds} 秒后才能确认下一条。`; setTimeout(updateCooldown, 400); }
    else { button.disabled = false; note.textContent = "达到推荐阈值。点击后仅填入聊天框；请你亲自核对并点击 Boss 原生发送按钮。"; }
  }
  function fillGreeting() {
    if (cooldownSeconds()) return updateCooldown();
    const text = body.querySelector("textarea").value.trim(); const input = findChatInput();
    if (!text) return alert("请先生成或填写招呼语。");
    if (!input) return alert("未找到 Boss 聊天输入框。请先点击“立即沟通”打开聊天窗口，再重试。");
    input.focus();
    if (input.isContentEditable) input.textContent = text; else input.value = text;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    cooldownUntil = Date.now() + 4000 + Math.floor(Math.random() * 2001);
    if (currentJobId) chrome.runtime.sendMessage({ type: "updateQueueStatus", id: currentJobId, status: "filled-awaiting-send" });
    updateCooldown();
  }
  function render(result, threshold) {
    const score = Math.max(0, Math.min(100, Number(result.matchScore) || 0));
    const cls = score >= threshold ? "boss-ai-good" : score >= threshold - 15 ? "boss-ai-warn" : "boss-ai-bad";
    const allowed = score >= threshold;
    const gaps = (result.skillGaps || []).map(gap => `<li><b>${escapeHtml(gap.skill)}</b>：${escapeHtml(gap.gap)}<br><span>${escapeHtml(gap.advice)}</span></li>`).join("") || "<li>模型未识别出明确技能缺口。</li>";
    body.innerHTML = `<div class="boss-ai-score ${cls}">${score}% · ${escapeHtml(result.verdict || "待判断")}</div><h3>匹配判断</h3><ul class="boss-ai-reasons">${(result.reasons || []).map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul><h3>关键技能差距</h3><ul class="boss-ai-gaps">${gaps}</ul><h3>待确认招呼语</h3><textarea class="boss-ai-greeting">${escapeHtml(result.greeting || "")}</textarea><div class="boss-ai-actions"><button class="boss-ai-fill" ${allowed ? "" : "disabled"}>确认后填入聊天框</button><button class="boss-ai-secondary boss-ai-analyze">重新分析</button></div><p class="boss-ai-note">${allowed ? "达到你的推荐阈值。点击后仅填入聊天框；请你亲自核对并点击 Boss 原生发送按钮。" : "未达到推荐阈值，已进入待确认列表但默认不允许填入。"}</p>`;
    body.querySelector(".boss-ai-fill").onclick = fillGreeting;
    body.querySelector(".boss-ai-analyze").onclick = analyze;
  }
  function analyze() {
    const button = body.querySelector(".boss-ai-analyze"); button.disabled = true; button.textContent = "正在分析…";
    chrome.runtime.sendMessage({ type: "analyze", jobText: jobText() }, response => {
      if (!response?.ok) { body.innerHTML = `<p class="boss-ai-status">${escapeHtml(response?.error || "分析失败，请检查扩展配置和网络。")}</p><button class="boss-ai-analyze">重试</button>`; body.querySelector("button").onclick = analyze; return; }
      currentJobId = response.jobId; render(response.result, response.threshold);
    });
  }
  body.querySelector(".boss-ai-analyze").onclick = analyze;
})();
