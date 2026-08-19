(() => {
  if (document.getElementById("boss-ai-assistant")) return;
  const panel = document.createElement("section");
  panel.id = "boss-ai-assistant";
  panel.innerHTML = `<header><span>求职助手 · 人工确认</span><button class="boss-ai-close" title="关闭">×</button></header><div class="body"><p class="boss-ai-status">打开岗位详情后，点击分析。</p><button class="boss-ai-analyze">分析当前岗位</button></div>`;
  document.documentElement.append(panel);
  const body = panel.querySelector(".body");
  panel.querySelector(".boss-ai-close").onclick = () => panel.remove();

  function jobText() {
    return document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 18000);
  }
  function escapeHtml(text) { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }
  function findChatInput() {
    return [...document.querySelectorAll("textarea, [contenteditable='true'], input[type='text']")]
      .find(el => el.offsetParent !== null && !el.closest("#boss-ai-assistant"));
  }
  function fillGreeting() {
    const text = body.querySelector("textarea").value.trim();
    const input = findChatInput();
    if (!text) return alert("请先生成或填写招呼语。");
    if (!input) return alert("未找到 Boss 的聊天输入框。请先点击“立即沟通”打开聊天框，再重试。");
    input.focus();
    if (input.isContentEditable) input.textContent = text; else input.value = text;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    body.querySelector(".boss-ai-note").textContent = "已填入聊天框。请核对后，亲自点击 Boss 页面原生的“发送”按钮。";
  }
  function render(result, threshold) {
    const score = Math.max(0, Math.min(100, Number(result.matchScore) || 0));
    const cls = score >= threshold ? "boss-ai-good" : score >= threshold - 15 ? "boss-ai-warn" : "boss-ai-bad";
    const allowed = score >= threshold;
    body.innerHTML = `<div class="boss-ai-score ${cls}">${score}% · ${escapeHtml(result.verdict || "待判断")}</div><ul class="boss-ai-reasons">${(result.reasons || []).map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul><textarea class="boss-ai-greeting">${escapeHtml(result.greeting || "")}</textarea><div class="boss-ai-actions"><button class="boss-ai-fill" ${allowed ? "" : "disabled"}>确认后填入聊天框</button><button class="boss-ai-secondary boss-ai-analyze">重新分析</button></div><p class="boss-ai-note">${allowed ? "达到你的推荐阈值。填入不等于发送：最终发送由你手动完成。" : "未达到推荐阈值，默认不允许填入。你可以调整配置后重新分析。"}</p>`;
    body.querySelector(".boss-ai-fill").onclick = fillGreeting;
    body.querySelector(".boss-ai-analyze").onclick = analyze;
  }
  function analyze() {
    const button = body.querySelector(".boss-ai-analyze");
    button.disabled = true; button.textContent = "正在分析…";
    chrome.runtime.sendMessage({ type: "analyze", jobText: jobText() }, response => {
      if (!response?.ok) { body.innerHTML = `<p class="boss-ai-status">${escapeHtml(response?.error || "分析失败，请检查扩展配置和网络。")}</p><button class="boss-ai-analyze">重试</button>`; body.querySelector("button").onclick = analyze; return; }
      render(response.result, response.threshold);
    });
  }
  body.querySelector(".boss-ai-analyze").onclick = analyze;
})();
