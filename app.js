(function () {
  const KEY = "interview-prep-dashboard-v1";
  const SETTINGS_KEY = "interview-prep-dashboard-settings-v1";
  const DEFAULT_MODEL = "claude-sonnet-5-5";
  const FIELDS = ["products", "competitors", "news", "questions"];
  let state = load();

  const $ = (s, r = document) => r.querySelector(s);

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && Array.isArray(raw.companies)) return raw;
    } catch (e) {}
    return { companies: [], selected: null };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function current() {
    return state.companies.find(c => c.id === state.selected) || null;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function dayLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }

  function safeUrl(u) {
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (e) { return ""; }
  }

  function setStatus(msg, isError) {
    const el = $("#status");
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
  }

  function renderList() {
    const ul = $("#companyList");
    ul.innerHTML = "";
    state.companies.forEach(c => {
      const li = document.createElement("li");
      if (c.id === state.selected) li.className = "active";
      const name = document.createElement("span");
      name.textContent = c.name;
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = c.done ? "Done" : dayLabel(c.date);
      li.append(name, when);
      li.onclick = () => { state.selected = c.id; setStatus(""); save(); render(); };
      ul.appendChild(li);
    });
  }

  function renderOverview(c) {
    const site = safeUrl(c.website || "");
    const li = safeUrl(c.linkedin || "");
    const has = !!(c.about || site || li);
    $("#overview").hidden = !has;
    $("#aboutText").textContent = c.about || "";
    $("#aboutText").hidden = !c.about;
    const w = $("#websiteLink");
    w.hidden = !site;
    if (site) { w.href = site; w.textContent = "Website"; }
    const l = $("#linkedinLink");
    l.hidden = !li;
    if (li) { l.href = li; l.textContent = "LinkedIn"; }
  }

  function renderDetail() {
    const c = current();
    $("#empty").hidden = !!c;
    $("#detail").hidden = !c;
    if (!c) return;
    $("#companyName").textContent = c.name;
    $("#interviewDate").value = c.date || "";
    $("#doneBox").checked = !!c.done;
    renderOverview(c);
    FIELDS.forEach(f => {
      const ul = $(`.card[data-field="${f}"] .items`);
      ul.innerHTML = "";
      (c[f] || []).forEach((text, i) => {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = text;
        const del = document.createElement("button");
        del.textContent = "×";
        del.title = "Remove";
        del.onclick = () => { c[f].splice(i, 1); save(); renderDetail(); };
        li.append(span, del);
        ul.appendChild(li);
      });
    });
  }

  function render() { renderList(); renderDetail(); }

  // ---------- AI research ----------

  function extractJson(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON in response");
    return JSON.parse(text.slice(start, end + 1));
  }

  function cleanList(arr, max) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(x => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .slice(0, max);
  }

  function mergeList(existing, incoming) {
    const seen = new Set(existing.map(x => x.toLowerCase()));
    incoming.forEach(x => {
      if (!seen.has(x.toLowerCase())) { existing.push(x); seen.add(x.toLowerCase()); }
    });
  }

  async function researchCompany(c) {
    const settings = getSettings();
    if (!settings.apiKey) {
      openSettings();
      setStatus("Add your Anthropic API key to use AI research.", true);
      return;
    }
    const btn = $("#researchBtn");
    btn.disabled = true;
    btn.textContent = "Researching...";
    setStatus(`Searching the web for ${c.name}. This can take up to a minute.`);

    const prompt =
      `Research the company "${c.name}" using web search so someone can prepare for a job interview there. ` +
      `Return ONLY a JSON object, with no markdown and no extra text, using these keys: ` +
      `"website" (official website URL, or empty string), ` +
      `"linkedin" (the company LinkedIn page URL, only if you actually found it in search results, otherwise empty string), ` +
      `"about" (two plain sentences on what the company does and who it serves), ` +
      `"products" (up to 5 short strings), ` +
      `"competitors" (up to 4 short strings), ` +
      `"news" (up to 5 short strings, each with month and year when known). ` +
      `If you are unsure about a fact, leave it out rather than guess.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: settings.model || DEFAULT_MODEL,
          max_tokens: 2000,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json()).error.message; } catch (e) {}
        throw new Error(detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      const text = (data.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");
      const info = extractJson(text);

      const site = safeUrl(info.website || "");
      const li = safeUrl(info.linkedin || "");
      if (site) c.website = site;
      if (li && /linkedin\.com/i.test(li)) c.linkedin = li;
      if (typeof info.about === "string" && info.about.trim()) c.about = info.about.trim();
      FIELDS.slice(0, 3).forEach(f => {
        c[f] = c[f] || [];
        mergeList(c[f], cleanList(info[f], f === "competitors" ? 4 : 5));
      });
      save();
      render();
      setStatus("Research added. Review it and edit anything that looks off.");
    } catch (err) {
      setStatus(`Research failed: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Research with AI";
    }
  }

  // ---------- settings dialog ----------

  function openSettings() {
    const s = getSettings();
    $("#apiKey").value = s.apiKey || "";
    $("#modelName").value = s.model || "";
    $("#settingsDialog").showModal();
  }

  $("#settingsBtn").addEventListener("click", openSettings);
  $("#cancelSettings").addEventListener("click", () => $("#settingsDialog").close());
  $("#clearKey").addEventListener("click", () => {
    saveSettings({ model: $("#modelName").value.trim() });
    $("#apiKey").value = "";
  });
  $("#settingsForm").addEventListener("submit", () => {
    saveSettings({
      apiKey: $("#apiKey").value.trim(),
      model: $("#modelName").value.trim()
    });
  });

  $("#researchBtn").addEventListener("click", () => {
    const c = current();
    if (c) researchCompany(c);
  });

  // ---------- core interactions ----------

  $("#addForm").addEventListener("submit", e => {
    e.preventDefault();
    const input = $("#newCompany");
    const name = input.value.trim();
    if (!name) return;
    const c = { id: uid(), name, date: "", done: false };
    FIELDS.forEach(f => (c[f] = []));
    state.companies.push(c);
    state.selected = c.id;
    input.value = "";
    setStatus("");
    save(); render();
  });

  document.querySelectorAll(".card .add").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const c = current();
      if (!c) return;
      const input = $("input", form);
      const text = input.value.trim();
      if (!text) return;
      c[form.parentElement.dataset.field].push(text);
      input.value = "";
      save(); renderDetail();
    });
  });

  $("#interviewDate").addEventListener("change", e => {
    const c = current(); if (!c) return;
    c.date = e.target.value; save(); renderList();
  });
  $("#doneBox").addEventListener("change", e => {
    const c = current(); if (!c) return;
    c.done = e.target.checked; save(); renderList();
  });
  $("#deleteBtn").addEventListener("click", () => {
    const c = current(); if (!c) return;
    if (!confirm(`Delete ${c.name}?`)) return;
    state.companies = state.companies.filter(x => x.id !== c.id);
    state.selected = state.companies.length ? state.companies[0].id : null;
    setStatus("");
    save(); render();
  });

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "interview-prep-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.companies)) throw new Error("bad file");
      state = data; save(); render();
    } catch (err) {
      alert("That file could not be imported.");
    }
    e.target.value = "";
  });

  render();
})();
