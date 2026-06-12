"use strict";

const state = {
  data: null,
  i18n: null,
  language: "ja",
  category: "all",
  query: "",
  selected: null,
  answers: {}
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindStaticEvents();
  await loadData();
}

function bindStaticEvents() {
  $$(".language-button").forEach((button) => button.addEventListener("click", () => {
    state.language = button.dataset.language;
    document.documentElement.lang = state.language;
    renderAll();
  }));
  $("#search-input").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLocaleLowerCase();
    renderList();
  });
  $("#back-button").addEventListener("click", showList);
  $("#home-button").addEventListener("click", showList);
  $("#restart-button").addEventListener("click", restartCheck);
  $("#retry-button").addEventListener("click", loadData);
  $$(".detail-tab").forEach((button) => button.addEventListener("click", () => switchPanel(button.dataset.panel)));
}

async function loadData() {
  showOnly("loading-view");
  try {
    const [dataResponse, i18nResponse] = await Promise.all([
      fetch("data/subsidies.json", { cache: "no-store" }),
      fetch("data/i18n.json", { cache: "no-store" })
    ]);
    if (!dataResponse.ok || !i18nResponse.ok) throw new Error("HTTP error");
    [state.data, state.i18n] = await Promise.all([dataResponse.json(), i18nResponse.json()]);
    validateData(state.data);
    renderAll();
    showList();
  } catch (error) {
    console.error(error);
    applyTranslations();
    showOnly("error-view");
  }
}

function validateData(data) {
  if (!data || !Array.isArray(data.subsidies)) throw new Error("Invalid subsidies data");
  const ids = new Set();
  data.subsidies.forEach((item) => {
    if (!item.id || !item.name?.ja || ids.has(item.id)) throw new Error(`Invalid subsidy: ${item.id || "unknown"}`);
    ids.add(item.id);
    if (!Array.isArray(item.requirements)) throw new Error(`Missing requirements: ${item.id}`);
  });
}

function t(key, params = {}) {
  const table = state.i18n?.[state.language] || state.i18n?.ja || {};
  let text = table[key] ?? state.i18n?.ja?.[key] ?? key;
  Object.entries(params).forEach(([name, value]) => {
    text = text.replaceAll(`{${name}}`, String(value));
  });
  return text;
}

function localized(value) {
  if (typeof value === "string") return value;
  return value?.[state.language] || value?.ja || "";
}

function translatedLookup(section, value) {
  if (!value || state.language === "ja") return value || "";
  return state.i18n?.[state.language]?.[section]?.[value] || value;
}

function contactText(value) {
  return translatedLookup("contacts", value);
}

function groupText(value) {
  return translatedLookup("groups", value);
}

function applyTranslations() {
  $$("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
  $$("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $$(".language-button").forEach((button) => {
    const active = button.dataset.language === state.language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderAll() {
  applyTranslations();
  renderFooter();
  renderCategories();
  renderList();
  if (state.selected) renderDetail();
}

function renderFooter() {
  if (!state.data) return;
  $("#data-notice").textContent = t("data_notice");
  $("#data-version").textContent = t("data_version", {
    version: state.data.version,
    date: state.data.lastUpdated
  });
}

function renderCategories() {
  if (!state.data) return;
  const categories = ["all", ...new Set(state.data.subsidies.map((item) => item.category))];
  $("#category-tabs").innerHTML = categories.map((category) => `
    <button class="category-tab ${state.category === category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
      ${escapeHtml(category === "all" ? t("all") : t(categoryKey(category)))}
    </button>`).join("");
  $$(".category-tab").forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.category;
    renderCategories();
    renderList();
  }));
}

function categoryKey(category) {
  return { "移住・定住": "category_migration", "住宅": "category_housing", "子育て・妊娠": "category_family" }[category] || category;
}

function filteredSubsidies() {
  return state.data.subsidies.filter((item) => {
    const categoryMatches = state.category === "all" || item.category === state.category;
    const searchable = [localized(item.name), item.name.ja, localized(item.summary), item.summary?.ja, localized(item.contact?.dept)].join(" ").toLocaleLowerCase();
    return categoryMatches && searchable.includes(state.query);
  });
}

function renderList() {
  if (!state.data) return;
  const items = filteredSubsidies();
  $("#result-count").textContent = t("result_count", { count: items.length });
  $("#empty-state").classList.toggle("hidden", items.length > 0);
  $("#subsidy-list").innerHTML = items.map((item) => `
    <button class="subsidy-card" type="button" data-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}">
      <span class="card-top">
        <span class="category-label">${escapeHtml(t(categoryKey(item.category)))}</span>
        ${item.status === "closed"
          ? `<span class="closed-badge">${escapeHtml(t("closed"))}</span>`
          : `<span class="active-badge">${escapeHtml(t("active"))}</span>`}
      </span>
      <h2>${escapeHtml(localized(item.name))}</h2>
      <p>${escapeHtml(localized(item.summary))}</p>
      <span class="card-meta">
        <span class="amount">${escapeHtml(t("amount"))}: ${escapeHtml(localized(item.amount))}</span>
        <span>${escapeHtml(t("contact"))}: ${escapeHtml(contactText(item.contact.dept || item.contact.name))}</span>
      </span>
      <span class="card-arrow" aria-hidden="true">›</span>
    </button>`).join("");
  $$(".subsidy-card").forEach((card) => card.addEventListener("click", () => selectSubsidy(card.dataset.id)));
}

function selectSubsidy(id) {
  state.selected = state.data.subsidies.find((item) => item.id === id);
  state.answers = {};
  renderDetail();
  showOnly("detail-view");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDetail() {
  const item = state.selected;
  if (!item) return;
  $("#detail-header").innerHTML = `
    <article class="detail-summary">
      <span class="category-label">${escapeHtml(t(categoryKey(item.category)))}</span>
      ${item.status === "closed" ? `<span class="closed-badge">${escapeHtml(t("closed"))}</span>` : ""}
      <h1>${escapeHtml(localized(item.name))}</h1>
      <p>${escapeHtml(localized(item.summary))}</p>
      <p><strong>${escapeHtml(t("amount"))}:</strong> ${escapeHtml(localized(item.amount))}</p>
      <div class="detail-contact">
        <strong>${escapeHtml(contactText(item.contact.dept || ""))}</strong>
        ${item.contact.name ? `<br>${escapeHtml(contactText(item.contact.name))}` : ""}
        ${item.contact.tel ? `<br><a href="tel:${escapeHtml(item.contact.tel)}">☎ ${escapeHtml(item.contact.tel)}</a>` : ""}
      </div>
    </article>`;
  renderRequirements();
  renderInfo();
  updateResult();
}

function renderRequirements() {
  const groups = groupBy(state.selected.requirements, (requirement) => requirement.group);
  let number = 0;
  $("#requirements-list").innerHTML = Object.entries(groups).map(([group, requirements]) => `
    <section class="requirement-group">
      <h2><span class="group-count">${requirements.length}</span>${escapeHtml(groupText(group))}</h2>
      ${requirements.map((requirement) => {
        number += 1;
        return requirementHtml(requirement, number);
      }).join("")}
    </section>`).join("");
  $$(".answer-button").forEach((button) => button.addEventListener("click", () => answerRequirement(button)));
}

function requirementHtml(requirement, number) {
  const answer = state.answers[requirement.id];
  const question = localized(requirement.question);
  const fallback = state.language !== "ja" && !requirement.question?.[state.language];
  const options = requirement.type === "yesno"
    ? [{ value: "yes", label: t("yes") }, { value: "no", label: t("no"), disqualify: requirement.required }]
    : requirement.choices.map((choice) => ({ ...choice, label: localized(choice.label) }));
  return `
    <article id="requirement-${escapeHtml(requirement.id)}" class="requirement ${answer ? "answered" : ""} ${answer?.disqualify ? "disqualified" : ""}">
      <p class="question-number">${escapeHtml(t("question_number", { number }))}</p>
      <p class="question">${escapeHtml(question)}</p>
      ${fallback ? `<p class="translation-note">${escapeHtml(t("japanese_only"))}</p>` : ""}
      <div class="answer-options ${requirement.type === "choice" ? "choices" : ""}">
        ${options.map((option) => `
          <button class="answer-button ${answer?.value === option.value ? `selected ${option.disqualify ? "disqualifying" : ""}` : ""}"
            type="button" data-requirement="${escapeHtml(requirement.id)}" data-value="${escapeHtml(option.value)}"
            data-disqualify="${Boolean(option.disqualify)}">
            ${escapeHtml(option.label)}
          </button>`).join("")}
      </div>
    </article>`;
}

function answerRequirement(button) {
  const requirement = state.selected.requirements.find((item) => item.id === button.dataset.requirement);
  state.answers[requirement.id] = {
    value: button.dataset.value,
    disqualify: button.dataset.disqualify === "true",
    requirementId: requirement.id
  };
  renderRequirements();
  updateResult();
  const index = state.selected.requirements.findIndex((item) => item.id === requirement.id);
  const next = state.selected.requirements[index + 1];
  if (next) {
    setTimeout(() => document.querySelector(`#requirement-${CSS.escape(next.id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  } else {
    setTimeout(() => $("#result-banner").scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
}

function updateResult() {
  const banner = $("#result-banner");
  const failed = Object.values(state.answers).find((answer) => answer.disqualify);
  const required = state.selected.requirements.filter((item) => item.required);
  const answeredRequired = required.filter((item) => state.answers[item.id]).length;
  const completed = required.every((item) => state.answers[item.id]);
  const percent = required.length ? Math.round((answeredRequired / required.length) * 100) : 0;
  $("#progress-text").textContent = `${answeredRequired} / ${required.length}`;
  $("#progress-fill").style.width = `${percent}%`;
  $("#progress-bar").setAttribute("aria-valuenow", String(percent));
  banner.className = "result-banner";
  if (failed) {
    const failedRequirement = state.selected.requirements.find((item) => item.id === failed.requirementId);
    banner.classList.add("ng");
    banner.innerHTML = `<strong>${escapeHtml(t("result_ng"))}</strong><br><span>${escapeHtml(t("failed_reason", {
      group: groupText(failedRequirement.group),
      question: localized(failedRequirement.question)
    }))}</span><br><small>${escapeHtml(t("continue_note"))}</small>`;
  } else if (completed) {
    banner.classList.add("ok");
    banner.innerHTML = `<strong>${escapeHtml(t("result_ok"))}</strong><br><span>${escapeHtml(t("final_check"))}</span>`;
  } else if (Object.keys(state.answers).length) {
    banner.classList.add("pending");
    banner.textContent = t("progress", { answered: Object.keys(state.answers).length, total: required.length });
  } else {
    banner.classList.add("hidden");
  }
}

function renderInfo() {
  const item = state.selected;
  const grouped = groupBy(item.requirements, (requirement) => requirement.group);
  $("#info-panel").innerHTML = `
    <article class="info-card">
      <h2>${escapeHtml(t("official_requirements"))}</h2>
      ${Object.entries(grouped).map(([group, requirements]) => `
        <h3>${escapeHtml(groupText(group))}</h3>
        <ul class="official-list">${requirements.map((requirement) => `<li>${escapeHtml(requirement.question.ja)}</li>`).join("")}</ul>
      `).join("")}
    </article>
    ${item.note?.ja ? `<article class="info-card"><h2>${escapeHtml(t("notes"))}</h2><p>${escapeHtml(localized(item.note))}</p></article>` : ""}
    <article class="info-card">
      <h2>${escapeHtml(t("contact_info"))}</h2>
      <p><strong>${escapeHtml(contactText(item.contact.dept || ""))}</strong>${item.contact.name ? `<br>${escapeHtml(contactText(item.contact.name))}` : ""}</p>
      ${item.contact.tel ? `<p><a href="tel:${escapeHtml(item.contact.tel)}">${escapeHtml(item.contact.tel)}</a></p>` : ""}
    </article>
    <article class="info-card">
      <h2>${escapeHtml(t("sources"))}</h2>
      <div class="source-links">
        ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(t("source_page"))} ↗</a>` : `<p>${escapeHtml(t("source_unavailable"))}</p>`}
        ${item.kiyouUrl ? `<a href="${escapeHtml(item.kiyouUrl)}" target="_blank" rel="noopener">${escapeHtml(t("guideline_pdf"))} ↗</a>` : `<p>${escapeHtml(t("guideline_unavailable"))}</p>`}
      </div>
    </article>
    <button class="button primary full-width print-hide" type="button" onclick="window.print()">${escapeHtml(t("print"))}</button>
    <p class="translation-note">${escapeHtml(t("data_notice"))}</p>`;
}

function restartCheck() {
  state.answers = {};
  renderRequirements();
  updateResult();
  window.scrollTo({ top: $("#detail-header").offsetTop, behavior: "smooth" });
}

function switchPanel(panelId) {
  $$(".detail-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== panelId));
  $$(".detail-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.panel === panelId));
}

function showList() {
  state.selected = null;
  state.answers = {};
  showOnly("list-view");
  switchPanel("check-panel");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showOnly(id) {
  ["loading-view", "error-view", "list-view", "detail-view"].forEach((viewId) => {
    document.getElementById(viewId).classList.toggle("hidden", viewId !== id);
  });
}

function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    (groups[key] ||= []).push(item);
    return groups;
  }, {});
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}
