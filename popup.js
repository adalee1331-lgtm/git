const fields = ["endpoint", "model", "apiKey", "target", "resume", "threshold"];
chrome.storage.local.get({ endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini", threshold: 70 }, values => {
  fields.forEach(id => { document.getElementById(id).value = values[id] ?? ""; });
});
document.getElementById("save").addEventListener("click", () => {
  const values = Object.fromEntries(fields.map(id => [id, document.getElementById(id).value.trim()]));
  chrome.storage.local.set(values, () => {
    document.getElementById("status").textContent = "已保存";
    setTimeout(() => document.getElementById("status").textContent = "", 1800);
  });
});
