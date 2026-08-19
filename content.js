(() => {
  if (document.getElementById("boss-ai-assistant")) return;
  let currentJobId = null;
  const panel = document.createElement("section");
  panel.id = "boss-ai-assistant";
  panel.innerHTML = `<header><span>求职助手 · 人工确认</span><button class="boss-ai-close">×</button></header><div class="body"><p class="boss-ai-status">岗位详情页可单独分析；搜索列表页可批量采集。</p><div class="boss-ai-actions"><button class="boss-ai-analyze">分析当前岗位</button><button class="boss-ai-secondary boss-ai-batch">采集并分析本页</button></div></div>`;
  document.documentElement.append(panel);
  const body = panel.querySelector(".body"); panel.querySelector(".boss-ai-close").onclick = () => panel.remove();
  const escapeHtml = value => { const d = document.createElement("div"); d.textContent = String(value ?? ""); return d.innerHTML; };
  const jobText = () => document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 18000);
  const findInput = () => [...document.querySelectorAll("textarea,[contenteditable='true'],input[type='text']")].find(el => el.offsetParent && !el.closest("#boss-ai-assistant"));
  function collectJobs() {
    const found = new Map();
    document.querySelectorAll("a[href]").forEach(a => {
      const url = new URL(a.href, location.href).href;
      if (!/zhipin\.com/.test(url) || !/job_detail|job-detail|web\/geek\/job/.test(url)) return;
      const card = a.closest("li,article,div") || a; const title = (a.innerText || card.innerText || "").trim().split("\n")[0];
      if (title && !found.has(url)) found.set(url, { url, title: title.slice(0, 100) });
    });
    return [...found.values()].slice(0, 20);
  }
  function render(result, threshold) {
    const score = Math.max(0, Math.min(100, Number(result.matchScore) || 0)), allowed = score >= threshold;
    const cls = allowed ? "boss-ai-good" : score >= threshold - 15 ? "boss-ai-warn" : "boss-ai-bad";
    const gaps = (result.skillGaps || []).map(g => `<li><b>${escapeHtml(g.skill)}</b>：${escapeHtml(g.gap)}<br><span>${escapeHtml(g.advice)}</span></li>`).join("") || "<li>未识别出明确技能缺口。</li>";
    body.innerHTML = `<div class="boss-ai-score ${cls}">${score}% · ${escapeHtml(result.verdict || "待判断")}</div><h3>匹配判断</h3><ul class="boss-ai-reasons">${(result.reasons || []).map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul><h3>关键技能差距</h3><ul class="boss-ai-gaps">${gaps}</ul><h3>待确认招呼语</h3><textarea class="boss-ai-greeting">${escapeHtml(result.greeting || "")}</textarea><div class="boss-ai-actions"><button class="boss-ai-approve" ${allowed ? "" : "disabled"}>确认并加入发送队列</button><button class="boss-ai-secondary boss-ai-analyze">重新分析</button></div><p class="boss-ai-note">${allowed ? "确认后请在扩展首页统一发出；每条会间隔 4–6 秒，且每日最多 150 条。" : "未达推荐阈值，已保存到待确认列表，但不可加入发送队列。"}</p>`;
    body.querySelector(".boss-ai-approve").onclick = () => { chrome.runtime.sendMessage({ type: "updateQueueStatus", id: currentJobId, status: "approved" }); body.querySelector(".boss-ai-note").textContent = "已加入发送队列。请在扩展首页点击“自动发送已确认项”开始。"; body.querySelector(".boss-ai-approve").disabled = true; };
    body.querySelector(".boss-ai-analyze").onclick = analyzeOne;
  }
  function analyzeOne() {
    const button = body.querySelector(".boss-ai-analyze"); button.disabled = true; button.textContent = "正在分析…";
    chrome.runtime.sendMessage({ type: "analyze", jobText: jobText() }, response => {
      if (!response?.ok) return showError(response?.error || "分析失败");
      currentJobId = response.jobId; render(response.result, response.threshold);
    });
  }
  function analyzePage() {
    const jobs = collectJobs();
    if (!jobs.length) return showError("本页未找到可识别的岗位链接。请切换到 Boss 的职位搜索列表页后重试。");
    body.innerHTML = `<p class="boss-ai-status">正在采集并依次分析 ${jobs.length} 个岗位 JD，请稍候…</p>`;
    chrome.runtime.sendMessage({ type: "analyzeBatch", jobs }, response => {
      body.innerHTML = response?.ok ? `<p class="boss-ai-status">分析完成：已加入 ${response.added} 个待确认岗位${response.failed ? `，${response.failed} 个未能读取` : ""}。</p><button class="boss-ai-batch">继续采集本页</button>` : `<p class="boss-ai-status">${escapeHtml(response?.error || "批量分析失败")}</p><button class="boss-ai-batch">重试</button>`;
      body.querySelector(".boss-ai-batch").onclick = analyzePage;
    });
  }
  function showError(error) { body.innerHTML = `<p class="boss-ai-status">${escapeHtml(error)}</p><button class="boss-ai-analyze">重试当前岗位</button>`; body.querySelector("button").onclick = analyzeOne; }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type !== "autoSend") return;
    const write = () => {
      const input = findInput();
      if (!input) return reply({ ok: false, error: "未找到聊天输入框" });
      input.focus(); if (input.isContentEditable) input.textContent = message.greeting; else input.value = message.greeting;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: message.greeting }));
      const send = [...document.querySelectorAll("button")].find(button => button.offsetParent && !button.closest("#boss-ai-assistant") && /^(发送|发 送)$/.test(button.innerText.trim()));
      if (!send) return reply({ ok: false, error: "未找到发送按钮" });
      send.click(); reply({ ok: true });
    };
    const contact = [...document.querySelectorAll("button,a")].find(el => el.offsetParent && /立即沟通|发起沟通|沟通/.test(el.innerText.trim()));
    if (!findInput() && contact) { contact.click(); setTimeout(write, 1200); } else write();
    return true;
  });
  body.querySelector(".boss-ai-analyze").onclick = analyzeOne; body.querySelector(".boss-ai-batch").onclick = analyzePage;
})();
