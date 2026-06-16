const state = {
  bootstrap: null,
  overview: null,
  registers: [],
  allRegisters: null,
  registerCache: {},
  reference: null,
  staticBundle: null,
  staticRegisterMap: null,
  staticClient: null,
  page: "home",
  search: "",
  writableOnly: false,
  live: true,
  currentBlock: "",
  setupValuesLoading: false,
  setupValueRequestId: 0,
  provisioning: null,
  provisioningWriteAllActive: false,
};

const staticRuntime = window.ReplicaStaticRuntime || null;

const pages = ["home", "monitoring", "setup"];

function $(id) {
  return document.getElementById(id);
}

function esc(text) {
  return String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function setStatus(text, isError = false) {
  const bar = $("statusBar");
  bar.textContent = text || "";
  bar.style.color = isError ? "var(--danger)" : "var(--muted)";
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value) {
  return value === true;
}

function normalizeLiveItem(raw) {
  const item = objectValue(raw);
  return {
    label: stringValue(item["label"]),
    value: stringValue(item["value"]),
    detail: stringValue(item["detail"]),
  };
}

function normalizeOverview(raw) {
  const groups = objectValue(raw);
  const normalized = {};
  Object.keys(groups).forEach((group) => {
    normalized[group] = arrayValue(groups[group]).map(normalizeLiveItem);
  });
  return normalized;
}

function normalizeValueEntry(raw) {
  const item = objectValue(raw);
  return {
    raw: item["raw"],
    value: item["value"],
    label: stringValue(item["label"]),
    address: numberValue(item["address"]),
    units: stringValue(item["units"]),
    type: stringValue(item["type"]),
  };
}

function normalizeValues(raw) {
  const values = objectValue(raw);
  const normalized = {};
  Object.keys(values).forEach((code) => {
    normalized[String(code)] = normalizeValueEntry(values[code]);
  });
  return normalized;
}

function normalizeSection(raw) {
  const item = objectValue(raw);
  return {
    id: stringValue(item["id"]),
    title: stringValue(item["title"]),
    groups: arrayValue(item["groups"]).map((group) => stringValue(group)),
  };
}

function normalizeBlock(raw) {
  const item = objectValue(raw);
  return {
    id: stringValue(item["id"]),
    title: stringValue(item["title"]),
    description: stringValue(item["description"]),
    count: numberValue(item["count"]),
    readableCount: numberValue(item["readableCount"]),
    writableCount: numberValue(item["writableCount"]),
  };
}

function normalizeTransport(raw) {
  const item = objectValue(raw);
  return {
    ionod: item["ionod"] ?? null,
    target: stringValue(item["target"]),
    display_host: stringValue(item["display_host"]),
    display_user: stringValue(item["display_user"]),
    mode: stringValue(item["mode"]),
    tcp_port: numberValue(item["tcp_port"]),
    proxy_command: item["proxy_command"] ?? null,
    raw_base_url: item["raw_base_url"] ?? null,
    raw_url: item["raw_url"] ?? null,
    unit_id: numberValue(item["unit_id"]),
  };
}

function normalizeCatalog(raw) {
  const item = objectValue(raw);
  return {
    registers: numberValue(item["registers"]),
    monitorCodes: arrayValue(item["monitorCodes"]).map((code) => stringValue(code)),
  };
}

function normalizeModel(raw) {
  const item = objectValue(raw);
  const coverage = objectValue(item["coverage"]);
  const groups = objectValue(item["groups"]);
  return {
    coverage: {
      registers: numberValue(coverage["registers"]),
      blocks: numberValue(coverage["blocks"]),
      subgroups: numberValue(coverage["subgroups"]),
      driveParameterBlocks: numberValue(coverage["driveParameterBlocks"]),
      communicationBlocks: numberValue(coverage["communicationBlocks"]),
      writableRegisters: numberValue(coverage["writableRegisters"]),
      readableRegisters: numberValue(coverage["readableRegisters"]),
      orphanRegisters: numberValue(coverage["orphanRegisters"]),
      subgroupFallbackRegisters: numberValue(coverage["subgroupFallbackRegisters"]),
    },
    groups: {
      driveParameter: arrayValue(groups["driveParameter"]).map(normalizeBlock),
      communication: arrayValue(groups["communication"]).map(normalizeBlock),
    },
  };
}

function normalizeUiSource(raw) {
  return arrayValue(raw).map((entry) => {
    const item = objectValue(entry);
    return {
      group: stringValue(item["group"]),
      take: item["take"] === undefined ? null : numberValue(item["take"]),
      skip: item["skip"] === undefined ? 0 : numberValue(item["skip"]),
    };
  });
}

function normalizeUiCard(raw) {
  const item = objectValue(raw);
  return {
    title: stringValue(item["title"]),
    liveGroup: stringValue(item["liveGroup"]),
    source: normalizeUiSource(item["source"]),
  };
}

function normalizeUiSection(raw) {
  const item = objectValue(raw);
  const hero = objectValue(item["hero"]);
  return {
    kind: stringValue(item["kind"]),
    eyebrow: stringValue(item["eyebrow"]),
    title: stringValue(item["title"]),
    columns: stringValue(item["columns"], "three"),
    group: stringValue(item["group"]),
    liveGroup: stringValue(item["liveGroup"]),
    description: stringValue(item["description"]),
    hero: hero && Object.keys(hero).length ? {
      group: stringValue(hero["group"]),
      liveGroup: stringValue(hero["liveGroup"]),
    } : null,
    cards: arrayValue(item["cards"]).map(normalizeUiCard),
  };
}

function normalizeUi(raw) {
  const item = objectValue(raw);
  const pages = objectValue(item["pages"]);
  const normalizePage = (pageRaw) => {
    const page = objectValue(pageRaw);
    return {
      eyebrow: stringValue(page["eyebrow"]),
      title: stringValue(page["title"]),
      sections: arrayValue(page["sections"]).map(normalizeUiSection),
    };
  };
  return {
    pages: {
      home: normalizePage(pages["home"]),
      monitoring: normalizePage(pages["monitoring"]),
    },
  };
}

function normalizeBootstrap(raw) {
  const item = objectValue(raw);
  const branding = objectValue(item["branding"]);
  return {
    title: stringValue(item["title"], "Modbus Drive Console"),
    product: stringValue(item["product"]),
    branding: {
      eyebrow: stringValue(branding["eyebrow"], stringValue(item["product"], "Drive")),
      title: stringValue(branding["title"], stringValue(item["title"], "Modbus Drive")),
    },
    sections: arrayValue(item["sections"]).map(normalizeSection),
    transport: normalizeTransport(item["transport"]),
    catalog: normalizeCatalog(item["catalog"]),
    model: normalizeModel(item["model"]),
    referencePayloads: objectValue(item["referencePayloads"]),
    ui: normalizeUi(item["ui"]),
  };
}

function normalizeRegisterRow(raw) {
  const item = objectValue(raw);
  return {
    code: stringValue(item["code"]),
    name: stringValue(item["name"]),
    address: numberValue(item["address"]),
    access: stringValue(item["access"]),
    type: stringValue(item["type"]),
    units: stringValue(item["units"]),
    category: stringValue(item["category"]),
    menu: stringValue(item["menu"]),
    menuTags: arrayValue(item["menuTags"]).map((tag) => stringValue(tag)),
    display: stringValue(item["display"]),
    range: stringValue(item["range"]),
    readable: booleanValue(item["readable"]),
    writable: booleanValue(item["writable"]),
    widget: stringValue(item["widget"]),
    word_count: numberValue(item["word_count"], 1),
    enum: arrayValue(item["enum"]).map((entry) => {
      const enumItem = objectValue(entry);
      return {
        value: enumItem["value"],
        display: stringValue(enumItem["display"]),
      };
    }),
    min_hint: item["min_hint"],
    max_hint: item["max_hint"],
    block: stringValue(item["block"]),
    blockTitle: stringValue(item["blockTitle"]),
    subgroup: stringValue(item["subgroup"]),
    subgroupTitle: stringValue(item["subgroupTitle"]),
    subgroupDescription: stringValue(item["subgroupDescription"]),
    explanation: stringValue(item["explanation"]),
    notes: arrayValue(item["notes"]).map((note) => stringValue(note)),
    signed: booleanValue(item["signed"]),
    word_order: stringValue(item["word_order"], "msw_first"),
    value_format: stringValue(item["value_format"]),
    sort_index: numberValue(item["sort_index"]),
  };
}

function normalizeOverviewPayload(raw) {
  const item = objectValue(raw);
  return {
    values: normalizeValues(item["values"]),
    overview: normalizeOverview(item["overview"]),
  };
}

function useStaticRuntime() {
  return !!(staticRuntime && staticRuntime.isEnabled && staticRuntime.isEnabled());
}

function currentValue(code) {
  return state.registerCache[code] || null;
}

function mergeRegisterCache(values) {
  if (!values) {
    return;
  }
  Object.assign(state.registerCache, values);
}

function allBlocks() {
  const groups = state.bootstrap.model.groups;
  return [...groups.driveParameter, ...groups.communication];
}

function blockById(id) {
  return allBlocks().find((block) => block.id === id) || null;
}

function renderNav() {
  $("nav").innerHTML = state.bootstrap.sections.map((section) => `
    <button class="nav-link ${section.id === state.page ? "active" : ""}" data-page="${section.id}">${esc(section.title)}</button>
  `).join("");
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });
}

function showPage(id) {
  state.page = id;
  pages.forEach((page) => $(`${page}Page`).classList.toggle("hidden", page !== id));
  const section = state.bootstrap.sections.find((item) => item.id === id);
  $("pageTitle").textContent = section ? section.title : id;
  renderNav();
  if (id === "setup") {
    ensureSetupValuesLoadedSoon();
  }
}

function liveKey(group, label) {
  return `${group}::${label}`;
}

function renderOverviewMetrics(items, group = "") {
  return `<div class="grid hero">${items.map((item) => `
    <article class="metric" ${group ? `data-live-key="${esc(liveKey(group, item.label))}"` : ""}>
      <div class="label">${esc(item.label)}</div>
      <div class="value" data-live-value>${esc(item.value)}</div>
      <div class="small dim" data-live-detail>${esc(item.detail || "")}</div>
    </article>
  `).join("")}</div>`;
}

function renderKeyValueList(items, group = "") {
  if (!items || !items.length) {
    return `<p class="small dim">No live values in this group.</p>`;
  }
  return `<div class="list compact-list">${items.map((item) => `
    <div class="kv" ${group ? `data-live-key="${esc(liveKey(group, item.label))}"` : ""}>
      <span>${esc(item.label)}</span>
      <strong data-live-value>${esc(item.value)}</strong>
      <span class="hidden" data-live-detail></span>
    </div>
  `).join("")}</div>`;
}

function renderGroupHeader(title, text = "", eyebrow = "Group") {
  return `
    <div class="section-head">
      <div>
        <div class="eyebrow">${esc(eyebrow)}</div>
        <h3>${esc(title)}</h3>
        ${text ? `<p>${esc(text)}</p>` : ""}
      </div>
    </div>
  `;
}

function gridClass(columns) {
  if (columns === "two" || columns === "three" || columns === "four") {
    return columns;
  }
  return "three";
}

function configuredPage(pageId) {
  return state.bootstrap?.ui?.pages?.[pageId] || null;
}

function selectOverviewItems(overview, source) {
  const parts = Array.isArray(source) ? source : [];
  const items = [];
  parts.forEach((part) => {
    const groupItems = Array.isArray(overview?.[part.group]) ? overview[part.group] : [];
    const start = Math.max(Number(part.skip || 0), 0);
    const slice = groupItems.slice(start);
    if (part.take === null || part.take === undefined) {
      items.push(...slice);
      return;
    }
    items.push(...slice.slice(0, Math.max(Number(part.take), 0)));
  });
  return items;
}

function renderConfiguredCards(cards, overview, columns) {
  return `<div class="grid ${gridClass(columns)}">${cards.map((card) => `
    <article class="card">
      <h3>${esc(card.title)}</h3>
      ${renderKeyValueList(selectOverviewItems(overview, card.source), card.liveGroup)}
    </article>
  `).join("")}</div>`;
}

function renderCurrentCell(row, current) {
  if (!current) {
    return `<span class="dim">not loaded</span>`;
  }
  return `${esc(current.value)}${current.label ? ` <span class="dim">${esc(current.label)}</span>` : ""}`;
}

function renderCurrentCellContent(row, current) {
  const meta = scalingMeta(row);
  return `${renderCurrentCell(row, current)}${meta.units ? ` <span class="small dim inline-unit">(${esc(meta.units)})</span>` : ""}`;
}

function clearCurrentCell(code) {
  const row = state.registers.find((item) => item.code === code);
  delete state.registerCache[code];
  const cell = document.querySelector(`.current-cell[data-code="${CSS.escape(code)}"]`);
  if (row && cell) {
    cell.classList.remove("provision-match", "provision-mismatch");
    cell.innerHTML = `<span class="dim">updating...</span>${scalingMeta(row).units ? ` <span class="small dim inline-unit">(${esc(scalingMeta(row).units)})</span>` : ""}`;
  }
}

function invalidateSetupValues() {
  state.setupValueRequestId += 1;
  state.setupValuesLoading = false;
}

function syncWriteControlFromValue(code, valueInfo) {
  if (!valueInfo) {
    return;
  }
  const control = document.querySelector(`.write-input[data-code="${CSS.escape(code)}"], .write-select[data-code="${CSS.escape(code)}"]`);
  if (!control || document.activeElement === control) {
    return;
  }
  const nextValue = valueInfo.raw ?? valueInfo.value;
  if (nextValue === undefined || nextValue === null) {
    return;
  }
  const textValue = String(nextValue);
  if (control.value !== textValue) {
    control.value = textValue;
  }
}

function hasProvisioningView() {
  return !!state.provisioning;
}

function provisioningExpectedValue(code) {
  if (!state.provisioning) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(state.provisioning.expectedByCode, code)
    ? state.provisioning.expectedByCode[code]
    : null;
}

function provisioningWriteState(row, fallbackValue) {
  if (!row?.writable) {
    return { value: fallbackValue, edited: false };
  }
  const expected = provisioningExpectedValue(row.code);
  if (expected === null || expected === undefined) {
    return { value: fallbackValue, edited: false };
  }
  return { value: expected, edited: true };
}

function provisioningCurrentClass(row, current) {
  const expected = provisioningExpectedValue(row.code);
  if (expected === null || expected === undefined || !current) {
    return "";
  }
  return Number(current.raw) === Number(expected) ? "provision-match" : "provision-mismatch";
}

function updateCurrentCellPresentation(cell, row) {
  if (!cell || !row) {
    return;
  }
  const current = currentValue(row.code);
  const next = renderCurrentCellContent(row, current);
  if (cell.innerHTML !== next) {
    cell.innerHTML = next;
  }
  const comparisonClass = provisioningCurrentClass(row, current);
  cell.classList.toggle("provision-match", comparisonClass === "provision-match");
  cell.classList.toggle("provision-mismatch", comparisonClass === "provision-mismatch");
}

function shouldPreserveEditedState(code) {
  return provisioningExpectedValue(code) !== null;
}

function syncSetupWriteControls() {
  const active = document.activeElement;
  state.registers.forEach((row) => {
    const control = document.querySelector(`.write-input[data-code="${CSS.escape(row.code)}"], .write-select[data-code="${CSS.escape(row.code)}"]`);
    if (!control || control === active || control.dataset.userEdited === "1") {
      return;
    }
    syncWriteControlFromValue(row.code, currentValue(row.code));
  });
}

let dragDepth = 0;

function hasDraggedFiles(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }
  if (dataTransfer.files && dataTransfer.files.length) {
    return true;
  }
  const types = dataTransfer.types;
  if (!types) {
    return false;
  }
  if (typeof types.includes === "function") {
    return types.includes("Files");
  }
  return typeof types.contains === "function" && types.contains("Files");
}

function setDragActive(active) {
  document.body.classList.toggle("drag-accept", active);
}

function clearDragActive() {
  dragDepth = 0;
  setDragActive(false);
}

function setNodeTextIfChanged(node, value) {
  const next = value ?? "";
  if (node && node.textContent !== next) {
    node.textContent = next;
  }
}

function patchLiveItems(group, items) {
  for (const item of items || []) {
    const node = document.querySelector(`[data-live-key="${CSS.escape(liveKey(group, item.label))}"]`);
    if (!node) {
      continue;
    }
    const valueNode = node.querySelector("[data-live-value]");
    const detailNode = node.querySelector("[data-live-detail]");
    setNodeTextIfChanged(valueNode, item.value);
    setNodeTextIfChanged(detailNode, item.detail || "");
  }
}

function renderMonitorTableRows(values) {
  return Object.entries(values).map(([code, item]) => `
    <tr data-monitor-code="${code}">
      <td class="monospace">${esc(code)}</td>
      <td>${item.address}</td>
      <td data-monitor-value>${esc(item.value)}</td>
      <td class="monospace" data-monitor-raw>0x${Number(item.raw).toString(16).toUpperCase()}</td>
      <td data-monitor-label>${esc(item.label || "")}</td>
    </tr>
  `).join("");
}

function updateMonitorTable(values) {
  for (const [code, item] of Object.entries(values || {})) {
    const row = document.querySelector(`[data-monitor-code="${CSS.escape(code)}"]`);
    if (!row) {
      continue;
    }
    setNodeTextIfChanged(row.querySelector("[data-monitor-value]"), item.value);
    setNodeTextIfChanged(row.querySelector("[data-monitor-raw]"), `0x${Number(item.raw).toString(16).toUpperCase()}`);
    setNodeTextIfChanged(row.querySelector("[data-monitor-label]"), item.label || "");
  }
}

function renderBlockCards(blocks, activeId, actionLabel = "Open block") {
  return `
    ${blocks.map((block) => `
      <article class="block-card ${block.id === activeId ? "active" : ""}">
        <div class="card-head">
          <div>
            <h4>${esc(block.title)}</h4>
          </div>
          <button class="secondary block-open" data-block="${block.id}">${esc(actionLabel)}</button>
        </div>
        <p class="small dim">${esc(block.description)}</p>
        <div class="block-meta">
          <span class="stat-pill">${block.count} regs (${block.writableCount}w ${block.readableCount}r)</span>
        </div>
      </article>
    `).join("")}
  `;
}

function parameterBlockRow(row) {
  return `
    <div class="register-grid-section block-section-row">
      <div class="table-section-copy">
        <strong>${esc(row.blockTitle)}</strong>
      </div>
    </div>
  `;
}

function parameterSubgroupRow(row) {
  return `
    <div class="register-grid-section subgroup-section-row">
      <div class="table-section-copy">
        <strong>${esc(row.subgroupTitle)}</strong>
        ${row.subgroupDescription ? `<div class="small dim">${esc(row.subgroupDescription)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderHome() {
  const layout = configuredPage("home");
  const overview = state.overview?.overview || {};
  const coverage = state.bootstrap.model.coverage;
  const sections = Array.isArray(layout?.sections) ? layout.sections : [];
  $("homePage").innerHTML = `
    <div class="section-head">
      <div>
        <div class="eyebrow">${esc(layout?.eyebrow || "Drive Overview")}</div>
        <h3>${esc(layout?.title || state.bootstrap.title)}</h3>
      </div>
    </div>
    <div class="summary-strip">
      <article class="summary-tile">
        <span class="summary-label">Registers</span>
        <strong>${coverage.registers}</strong>
      </article>
      <article class="summary-tile">
        <span class="summary-label">Writable</span>
        <strong>${coverage.writableRegisters}</strong>
      </article>
      <article class="summary-tile">
        <span class="summary-label">Areas</span>
        <strong>${coverage.driveParameterBlocks + coverage.communicationBlocks}</strong>
      </article>
      <article class="summary-tile">
        <span class="summary-label">Mode</span>
        <strong>${esc(formatTransportModeSummary(state.bootstrap.transport))}</strong>
      </article>
      <article class="summary-tile">
        <span class="summary-label">Unit</span>
        <strong>${esc(state.bootstrap.transport.unit_id)}</strong>
      </article>
      <article class="summary-tile">
        <span class="summary-label">Monitor points</span>
        <strong>${state.bootstrap.catalog.monitorCodes.length}</strong>
      </article>
    </div>
    ${sections.map((section) => {
      if (section.kind === "hero") {
        return renderOverviewMetrics(overview?.[section.group] || [], section.liveGroup);
      }
      if (section.kind === "cardRow") {
        return `
          ${section.title ? renderGroupHeader(section.title, section.description || "", section.eyebrow || "Home") : ""}
          ${renderConfiguredCards(section.cards, overview, section.columns)}
        `;
      }
      return "";
    }).join("")}
  `;
}

function renderMonitoring() {
  if (!state.overview) {
    $("monitoringPage").innerHTML = `<article class="card"><p>Loading live overview...</p></article>`;
    return;
  }
  const layout = configuredPage("monitoring");
  const { overview, values } = state.overview;
  const monitorCount = Object.keys(values).length;
  $("monitoringPage").innerHTML = `
    <div class="group-shell">
      ${arrayValue(layout?.sections).map((section) => {
        if (section.kind === "monitorSection") {
          return `
            ${section.title ? renderGroupHeader(section.title, section.description || "", section.eyebrow || "Group") : ""}
            ${section.hero ? renderOverviewMetrics(overview?.[section.hero.group] || [], section.hero.liveGroup) : ""}
            ${renderConfiguredCards(section.cards, overview, section.columns)}
          `;
        }
        if (section.kind === "monitorTable") {
          return `
            <article class="card">
              <div class="card-head">
                <div>
                  <h3>${esc(section.title || "Monitor variables")}</h3>
                  <p class="small dim">${esc((section.description || "{monitorCount} live monitor points.").replace("{monitorCount}", String(monitorCount)))}</p>
                </div>
              </div>
              <div class="table-wrap compact-table">
                <table>
                  <thead><tr><th>Code</th><th>Address</th><th>Value</th><th>Raw</th><th>Label</th></tr></thead>
                  <tbody>${renderMonitorTableRows(values)}</tbody>
                </table>
              </div>
            </article>
          `;
        }
        return "";
      }).join("")}
    </div>
  `;
}

function updateHomeValues() {
  const layout = configuredPage("home");
  const overview = state.overview?.overview || {};
  if (!overview) {
    return;
  }
  arrayValue(layout?.sections).forEach((section) => {
    if (section.kind === "hero") {
      patchLiveItems(section.liveGroup, overview[section.group] || []);
      return;
    }
    if (section.kind === "cardRow") {
      section.cards.forEach((card) => {
        patchLiveItems(card.liveGroup, selectOverviewItems(overview, card.source));
      });
    }
  });
}

function updateMonitoringValues() {
  const layout = configuredPage("monitoring");
  const overview = state.overview?.overview || {};
  const values = state.overview?.values || {};
  if (!overview) {
    return;
  }
  arrayValue(layout?.sections).forEach((section) => {
    if (section.kind !== "monitorSection") {
      return;
    }
    if (section.hero) {
      patchLiveItems(section.hero.liveGroup, overview[section.hero.group] || []);
    }
    section.cards.forEach((card) => {
      patchLiveItems(card.liveGroup, selectOverviewItems(overview, card.source));
    });
  });
  updateMonitorTable(values);
}

function modelMetaRow(label, value) {
  if (!value) {
    return "";
  }
  return `<div class="small dim model-meta-line"><span class="model-label">${esc(label)}:</span> ${esc(value)}</div>`;
}

function displayUnits(units) {
  const text = String(units || "").trim();
  if (!text || text === "-" || text === "1" || text === "Refer to programming manual") {
    return "";
  }
  return text;
}

function scalingMeta(row) {
  return {
    units: displayUnits(row.units),
    range: row.range || "",
  };
}

function isDevmanTransport(transport) {
  const config = window.REPLICA_STATIC_CONFIG || null;
  const loginUrl = String(config?.loginUrl || "").trim();
  return transport.mode === "raw_ws" && loginUrl === "../index.html";
}

function formatTransportMeta(transport) {
  const displayUser = String(transport.display_user || "").trim();
  const rawUrl = String(transport.raw_url || transport.ionod || "").trim();
  const target = String(transport.target || "").trim();
  if (isDevmanTransport(transport) && rawUrl && target) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.host;
      const endpointTarget = parsed.searchParams.get("id") || target;
      if (host && /\.ionod\.se$/i.test(host) && endpointTarget) {
        const node = host.replace(/\.ionod\.se$/i, "");
        return [node, displayUser, endpointTarget].filter(Boolean).join(" ");
      }
    } catch (_error) {
      // fall back below
    }
  }
  const unitText = `unit ${transport.unit_id}`;
  return `${transport.mode} ${unitText}`;
}

function formatTransportModeSummary(transport) {
  const displayUser = String(transport.display_user || "").trim();
  const rawUrl = String(transport.raw_url || transport.ionod || "").trim();
  const target = String(transport.target || "").trim();
  if (isDevmanTransport(transport) && rawUrl) {
    try {
      const parsed = new URL(String(transport.raw_base_url || rawUrl));
      return [parsed.host, displayUser, target].filter(Boolean).join(" ");
    } catch (_error) {
      return [rawUrl, displayUser, target].filter(Boolean).join(" ");
    }
  }
  if (rawUrl) {
    return rawUrl;
  }
  if (transport.mode === "tcp") {
    const host = String(transport.display_host || "").trim();
    const port = transport.tcp_port;
    return host && port ? `${host}:${port}` : host || transport.mode;
  }
  const proxyCommand = transport.proxy_command;
  if (Array.isArray(proxyCommand) && proxyCommand.length) {
    return proxyCommand.join(" ");
  }
  if (typeof proxyCommand === "string" && proxyCommand.trim()) {
    return proxyCommand.trim();
  }
  return String(transport.display_host || transport.mode || "");
}

function accessMeta(row) {
  const parts = [];
  if (row.type) {
    parts.push(row.type);
  }
  if (row.access) {
    parts.push(`[${row.access}]`);
  }
  return parts.join(" ");
}

function renderValueCell(row, current) {
  const meta = scalingMeta(row);
  const comparisonClass = provisioningCurrentClass(row, current);
  return `
    <div class="value-stack">
      <div class="current-cell ${comparisonClass}" data-code="${row.code}">
        ${renderCurrentCellContent(row, current)}
      </div>
      ${meta.range ? `<div class="small dim value-meta">range ${esc(meta.range)}</div>` : ""}
    </div>
  `;
}

function renderWriteCell(row, writer) {
  const meta = scalingMeta(row);
  return `
    <div class="write-stack">
      <div class="write-cell">${writer}${row.writable && meta.units ? ` <span class="small dim inline-unit">(${esc(meta.units)})</span>` : ""}</div>
    </div>
  `;
}

function parameterRow(row) {
  const current = currentValue(row.code);
  const currentRaw = current ? Number(current.raw) : null;
  const writeState = provisioningWriteState(row, currentRaw);
  const writeValue = writeState.value;
  const editedAttr = writeState.edited ? ` data-user-edited="1"` : "";
  const options = (row.enum || []).map((item) => `
    <option value="${item.value}" ${writeValue === Number(item.value) ? "selected" : ""}>${esc(`${item.value} - ${item.display}`)}</option>
  `).join("");
  let writer = `<span class="dim">read only</span>`;
  if (row.writable) {
    if (row.widget === "select") {
      writer = `<select data-code="${row.code}" class="write-select"${editedAttr}>${options}</select><button data-code="${row.code}" class="write-btn">Write</button>`;
    } else if (row.widget === "checkbox") {
      writer = `<select data-code="${row.code}" class="write-select"${editedAttr}><option value="0" ${writeValue === 0 ? "selected" : ""}>0</option><option value="1" ${writeValue === 1 ? "selected" : ""}>1</option></select><button data-code="${row.code}" class="write-btn">Write</button>`;
    } else {
      writer = `<input data-code="${row.code}" class="write-input" type="number" step="1" value="${writeValue ?? ""}"${editedAttr}><button data-code="${row.code}" class="write-btn">Write</button>`;
    }
  }
  return `
    <div class="register-grid-row">
      <div class="register-grid-cell monospace col-code-cell">${esc(row.code)}</div>
      <div class="register-grid-cell col-address-cell">${row.address}</div>
      <div class="register-grid-cell col-access-cell">${esc(accessMeta(row))}</div>
      <div class="register-grid-cell col-name-cell">
        <strong>${esc(row.name)}</strong>
        <div class="small dim">${esc(row.display || "")}</div>
        ${row.explanation ? `<div class="small dim">${esc(row.explanation)}</div>` : ""}
      </div>
      <div class="register-grid-cell col-value-cell">${renderValueCell(row, current)}</div>
      <div class="register-grid-cell col-write-cell">${renderWriteCell(row, writer)}</div>
      <div class="register-grid-cell model-meta-cell">
        ${modelMetaRow("Category", row.category)}
        ${row.menuTags.length ? `<div class="small dim menu-line"><span class="model-label">Menus:</span> ${row.menuTags.map(esc).join(" | ")}</div>` : ""}
      </div>
    </div>
  `;
}

function renderParameterTableBody() {
  const rows = [];
  let lastBlock = "";
  let lastSubgroup = "";
  state.registers.forEach((row) => {
    if ((hasProvisioningView() || !state.currentBlock) && row.block !== lastBlock) {
      rows.push(parameterBlockRow(row));
      lastBlock = row.block;
      lastSubgroup = "";
    }
    if (row.subgroup !== lastSubgroup) {
      rows.push(parameterSubgroupRow(row));
      lastSubgroup = row.subgroup;
    }
    rows.push(parameterRow(row));
  });
  return rows.join("");
}

function renderParameterGrid() {
  return `
    <div class="register-grid">
      <div class="register-grid-row register-grid-head">
        <div class="register-grid-cell">Code</div>
        <div class="register-grid-cell">Address</div>
        <div class="register-grid-cell">Access</div>
        <div class="register-grid-cell">Name</div>
        <div class="register-grid-cell">Value</div>
        <div class="register-grid-cell">Write</div>
        <div class="register-grid-cell">Model</div>
      </div>
      ${renderParameterTableBody()}
    </div>
  `;
}

function renderSetup() {
  if (hasProvisioningView()) {
    renderProvisioningSetup();
    return;
  }
  const groups = state.bootstrap.model.groups;
  const currentBlock = blockById(state.currentBlock);
  const blockLabel = currentBlock ? currentBlock.title : "All blocks";
  $("setupPage").innerHTML = `
    <div class="group-shell">
      <div class="block-grid">
        <div class="block-group-line">${renderGroupHeader("Function Blocks")}</div>
        ${renderBlockCards(groups.driveParameter, state.currentBlock, "Inspect")}
        <div class="block-group-line">${renderGroupHeader("Communication Blocks")}</div>
        ${renderBlockCards(groups.communication, state.currentBlock, "Inspect")}
      </div>
      <article class="card" id="setupFilterCard">
        <div class="toolbar">
          <input id="searchInput" value="${esc(state.search)}" placeholder="Search code, name, category, menu">
          <label class="toggle"><input id="writableOnly" type="checkbox" ${state.writableOnly ? "checked" : ""}> Writable only</label>
          <button id="searchBtn" class="secondary">Apply filters</button>
          <button id="viewAllBtn" class="secondary">All blocks</button>
          <button id="loadVisibleBtn">Load visible values</button>
        </div>
        <div class="selection-bar">
          <span class="chip strong">${esc(blockLabel)}</span>
          <span class="small dim">${state.registers.length} registers in current view</span>
        </div>
      </article>
      <article class="card">
        <div id="setupRegisterList" class="card-head">
          <div>
            <h3>${esc(blockLabel)}</h3>
            ${currentBlock?.description ? `<p class="small dim">${esc(currentBlock.description)}</p>` : ""}
          </div>
        </div>
        <div class="table-wrap">
          ${renderParameterGrid()}
        </div>
      </article>
    </div>
  `;

  $("searchBtn").addEventListener("click", async () => {
    state.search = $("searchInput").value.trim();
    state.writableOnly = $("writableOnly").checked;
    invalidateSetupValues();
    await loadRegisters();
    renderSetup();
  });
  $("searchInput").addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    state.search = $("searchInput").value.trim();
    state.writableOnly = $("writableOnly").checked;
    invalidateSetupValues();
    await loadRegisters();
    renderSetup();
  });
  $("viewAllBtn").addEventListener("click", async () => {
    state.currentBlock = "";
    state.search = "";
    state.writableOnly = false;
    invalidateSetupValues();
    await loadRegisters();
    renderSetup();
  });
  $("loadVisibleBtn").addEventListener("click", async () => {
    await loadCurrentRegisterValues();
    updateSetupValueCells();
  });
  bindWriteButtons();
  bindCommonButtons();
}

function renderProvisioningSetup() {
  const provisioning = state.provisioning;
  const missingCount = provisioning?.missingAddresses.length || 0;
  $("setupPage").innerHTML = `
    <div class="group-shell">
      <article class="card" id="setupFilterCard">
        <div class="card-head">
          <div>
            <div class="eyebrow">Provisioning File</div>
            <h3>${esc(provisioning.fileName || "Dropped JSON")}</h3>
            <p class="small dim">${state.registers.length} matched registers, ${provisioning.writeSequence.length} queued writes${missingCount ? `, ${missingCount} unresolved addresses` : ""}.</p>
          </div>
          <div class="toolbar">
            <button id="writeAllProvisionBtn">Write all provisioning values</button>
            <button id="loadVisibleBtn" class="secondary">Load visible values</button>
            <button id="closeProvisionBtn" class="secondary">Return to setup</button>
          </div>
        </div>
      </article>
      <article class="card">
        <div id="setupRegisterList" class="card-head">
          <div>
            <h3>Provisioning registers</h3>
            <p class="small dim">Dropped provisioning expectations are prefilled in the Write column and protected from live overwrite.</p>
          </div>
        </div>
        <div class="table-wrap">
          ${renderParameterGrid()}
        </div>
      </article>
    </div>
  `;
  $("loadVisibleBtn").addEventListener("click", async () => {
    await loadCurrentRegisterValues();
    updateSetupValueCells();
  });
  $("closeProvisionBtn").addEventListener("click", async () => {
    await closeProvisioningView();
  });
  $("writeAllProvisionBtn").addEventListener("click", async () => {
    await writeAllProvisioningValues();
  });
  bindWriteButtons();
}

function updateSetupValueCells() {
  document.querySelectorAll(".current-cell[data-code]").forEach((cell) => {
    const row = state.registers.find((item) => item.code === cell.dataset.code);
    if (!row) {
      return;
    }
    updateCurrentCellPresentation(cell, row);
  });
  syncSetupWriteControls();
}

async function writeRegisterValue(code, value, input) {
  try {
    setStatus(`Writing ${code}...`);
    clearCurrentCell(code);
    const result = useStaticRuntime()
      ? await staticRuntime.write(state, code, value)
      : await getJson("/api/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, value }),
      });
    const readback = result.write?.readback ? normalizeValueEntry(result.write.readback) : null;
    if (readback) {
      mergeRegisterCache({ [code]: readback });
      if (input && !shouldPreserveEditedState(code)) {
        delete input.dataset.userEdited;
        syncWriteControlFromValue(code, readback);
      }
    }
    updateSetupValueCells();
    return result;
  } catch (error) {
    setStatus(String(error), true);
    throw error;
  }
}

function bindWriteButtons() {
  document.querySelectorAll(".write-input, .write-select").forEach((control) => {
    const markEdited = () => {
      control.dataset.userEdited = "1";
    };
    control.addEventListener("input", markEdited);
    control.addEventListener("change", markEdited);
  });
  document.querySelectorAll(".write-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.dataset.code;
      const input = document.querySelector(`.write-input[data-code="${code}"], .write-select[data-code="${code}"]`);
      if (!input) {
        return;
      }
      const value = Number(input.value);
      try {
        await writeRegisterValue(code, value, input);
        setStatus(`Wrote ${code} = ${value}`);
        await loadOverview();
      } catch (error) {
        setStatus(String(error), true);
      }
    });
  });
}

async function fetchRegisters(options = {}) {
  const data = useStaticRuntime()
    ? await staticRuntime.loadRegisters(state, options)
    : await (async () => {
      const params = new URLSearchParams();
      if (options.block) {
        params.set("block", options.block);
      }
      if (options.search) {
        params.set("search", options.search);
      }
      if (options.writableOnly) {
        params.set("writable", "1");
      }
      return getJson(`/api/registers?${params.toString()}`);
    })();
  return arrayValue(objectValue(data)["items"]).map(normalizeRegisterRow);
}

async function loadAllRegisters() {
  if (state.allRegisters?.length) {
    return state.allRegisters;
  }
  state.allRegisters = await fetchRegisters({});
  return state.allRegisters;
}

function normalizeProvisioningEntries(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("Provisioning JSON must be an array.");
  }
  const entries = [];
  raw.forEach((item) => {
    if (!Array.isArray(item) || !item.length) {
      return;
    }
    const address = Number(item[0]);
    if (!Number.isFinite(address)) {
      return;
    }
    const expected = item.length > 1 && Number.isFinite(Number(item[1])) ? Number(item[1]) : null;
    entries.push({
      address,
      expected,
      raw: item,
    });
  });
  if (!entries.length) {
    throw new Error("Provisioning JSON did not contain any valid address rows.");
  }
  return entries;
}

async function openProvisioningFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const entries = normalizeProvisioningEntries(parsed);
  const allRegisters = await loadAllRegisters();
  const byAddress = new Map();
  allRegisters.forEach((row) => {
    const address = Number(row.address);
    if (!byAddress.has(address)) {
      byAddress.set(address, row);
    }
  });
  const includedCodes = new Set();
  const expectedByCode = {};
  const writeSequence = [];
  const missingAddresses = [];
  entries.forEach((entry) => {
    const row = byAddress.get(entry.address);
    if (!row) {
      missingAddresses.push(entry.address);
      return;
    }
    entry.code = row.code;
    entry.row = row;
    includedCodes.add(row.code);
    if (entry.expected !== null) {
      expectedByCode[row.code] = entry.expected;
      writeSequence.push({
        code: row.code,
        address: entry.address,
        value: entry.expected,
        writable: !!row.writable,
      });
    }
  });
  const subset = allRegisters.filter((row) => includedCodes.has(row.code));
  if (!subset.length) {
    throw new Error("Provisioning JSON did not match any known registers.");
  }
  state.provisioning = {
    fileName: file.name || "provisioning.json",
    entries,
    expectedByCode,
    writeSequence,
    missingAddresses,
  };
  state.registers = subset;
  invalidateSetupValues();
  renderSetup();
  showPage("setup");
  ensureSetupValuesLoadedSoon();
  setStatus(`Loaded provisioning file with ${subset.length} matched registers${missingAddresses.length ? ` and ${missingAddresses.length} unresolved addresses` : ""}.`);
}

async function closeProvisioningView() {
  state.provisioning = null;
  invalidateSetupValues();
  await loadRegisters();
  renderSetup();
  showPage("setup");
  focusSetupFilterCard();
  ensureSetupValuesLoadedSoon();
  setStatus("Returned to normal setup view.");
}

async function writeAllProvisioningValues() {
  if (!state.provisioning) {
    return;
  }
  const sequence = state.provisioning.writeSequence.filter((item) => item.writable);
  if (!sequence.length) {
    setStatus("No writable provisioning values were found in the dropped file.", true);
    return;
  }
  state.provisioningWriteAllActive = true;
  try {
    for (let index = 0; index < sequence.length; index += 1) {
      const item = sequence[index];
      const input = document.querySelector(`.write-input[data-code="${CSS.escape(item.code)}"], .write-select[data-code="${CSS.escape(item.code)}"]`);
      setStatus(`Writing provisioning value ${index + 1}/${sequence.length}: ${item.code}...`);
      await writeRegisterValue(item.code, item.value, input);
    }
  } finally {
    state.provisioningWriteAllActive = false;
  }
  setStatus(`Wrote ${sequence.length} provisioning values.`);
  await loadOverview();
}

function bindCommonButtons() {
  document.querySelectorAll(".block-open").forEach((button) => {
    button.addEventListener("click", async () => {
      await openBlock(button.dataset.block);
    });
  });
}

function driveEditorActive() {
  if (state.page !== "setup") {
    return false;
  }
  const active = document.activeElement;
  if (!active) {
    return false;
  }
  if (active.id === "searchInput" || active.id === "writableOnly") {
    return true;
  }
  return active.classList?.contains("write-input") || active.classList?.contains("write-select");
}

function focusSetupFilterCard() {
  requestAnimationFrame(() => {
    const target = $("setupFilterCard");
    const searchInput = $("searchInput");
    const topbar = document.querySelector(".topbar");
    if (!target) {
      return;
    }
    const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
    const targetTop = target.getBoundingClientRect().top + window.scrollY;
    const top = Math.max(targetTop - topbarHeight - 12, 0);
    window.scrollTo({ top, behavior: "smooth" });
    if (searchInput) {
      searchInput.focus({ preventScroll: true });
    }
  });
}

async function openBlock(blockId) {
  try {
    state.currentBlock = blockId || "";
    state.search = "";
    state.writableOnly = false;
    invalidateSetupValues();
    setStatus(`Loading ${blockById(state.currentBlock)?.title || "catalog"}...`);
    await loadRegisters();
    renderSetup();
    showPage("setup");
    focusSetupFilterCard();
    setStatus(`Showing ${blockById(state.currentBlock)?.title || "catalog"}; loading values...`);
    ensureSetupValuesLoadedSoon();
  } catch (error) {
    setStatus(String(error), true);
  }
}

async function loadBootstrap() {
  state.bootstrap = normalizeBootstrap(useStaticRuntime()
    ? await staticRuntime.loadBootstrap(state)
    : await getJson("/api/bootstrap"));
  state.currentBlock = state.bootstrap.model.groups.driveParameter[0]?.id || "";
  document.title = state.bootstrap.title || document.title;
  const brandEyebrow = $("brandEyebrow");
  const brandTitle = $("brandTitle");
  if (brandEyebrow) {
    brandEyebrow.textContent = state.bootstrap.branding.eyebrow;
  }
  if (brandTitle) {
    brandTitle.textContent = state.bootstrap.branding.title;
  }
  $("transportMeta").textContent = formatTransportMeta(state.bootstrap.transport);
  renderNav();
}

async function loadOverview() {
  state.overview = normalizeOverviewPayload(useStaticRuntime()
    ? await staticRuntime.loadOverview(state)
    : await getJson("/api/overview"));
  mergeRegisterCache(state.overview.values || {});
  if (!$("homePage").innerHTML.trim()) {
    renderHome();
  } else {
    updateHomeValues();
  }
  if (!$("monitoringPage").innerHTML.trim()) {
    renderMonitoring();
  } else {
    updateMonitoringValues();
  }
}

async function loadRegisters() {
  state.registers = await fetchRegisters({
    block: state.currentBlock,
    search: state.search,
    writableOnly: state.writableOnly,
  });
}

async function loadCurrentRegisterValues() {
  const readableCodes = state.registers.filter((item) => item.readable).map((item) => item.code);
  const requestId = ++state.setupValueRequestId;
  if (!readableCodes.length) {
    if (requestId === state.setupValueRequestId) {
      state.setupValuesLoading = false;
      updateSetupValueCells();
    }
    return;
  }
  state.setupValuesLoading = true;
  setStatus(`Reading ${readableCodes.length} visible registers...`);
  let data;
  try {
    data = useStaticRuntime()
      ? await staticRuntime.loadValues(state, readableCodes)
      : await getJson("/api/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: readableCodes }),
      });
  } catch (error) {
    if (requestId === state.setupValueRequestId) {
      state.setupValuesLoading = false;
    }
    throw error;
  }
  if (requestId !== state.setupValueRequestId) {
    return;
  }
  mergeRegisterCache(normalizeValues(objectValue(data)["values"]));
  state.setupValuesLoading = false;
  updateSetupValueCells();
  setStatus(`Loaded ${Object.keys(objectValue(data)["values"]).length} register values`);
}

function ensureSetupValuesLoadedSoon() {
  if (state.setupValuesLoading) {
    return;
  }
  if (!state.registers.some((item) => item.readable)) {
    return;
  }
  if (state.registers.every((item) => !item.readable || state.registerCache[item.code])) {
    return;
  }
  const requestId = state.setupValueRequestId + 1;
  void loadCurrentRegisterValues().catch((error) => {
    if (requestId === state.setupValueRequestId) {
      setStatus(String(error), true);
    }
  });
}

async function loadReference() {
  state.reference = useStaticRuntime()
    ? await staticRuntime.loadReference(state)
    : await getJson("/api/reference");
}

async function refreshVisiblePage() {
  try {
    if (state.page === "setup") {
      if (state.setupValuesLoading) {
        return;
      }
      const editingDrive = driveEditorActive();
      if (editingDrive) {
        setStatus("Live refresh paused while editing drive filters or write fields");
        return;
      }
      if (state.registers.length && state.registers.length <= 80) {
        await loadCurrentRegisterValues();
      }
      setStatus(`Last refresh ${new Date().toLocaleTimeString()}`);
      return;
    }

    if (state.page === "home" || state.page === "monitoring") {
      setStatus("Refreshing live data...");
      await loadOverview();
      setStatus(`Last refresh ${new Date().toLocaleTimeString()}`);
    }
  } catch (error) {
    setStatus(String(error), true);
  }
}

async function main() {
  await loadBootstrap();
  await loadOverview();
  await loadReference();
  await loadRegisters();
  renderSetup();
  showPage("home");
  ensureSetupValuesLoadedSoon();
  $("refreshBtn").addEventListener("click", refreshVisiblePage);
  $("liveToggle").addEventListener("change", (event) => {
    state.live = event.target.checked;
  });
  window.addEventListener("dragenter", (event) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepth += 1;
    setDragActive(true);
  });
  window.addEventListener("dragover", (event) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    setDragActive(true);
    event.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (event) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) {
      setDragActive(false);
    }
  });
  window.addEventListener("drop", (event) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    clearDragActive();
    const file = [...event.dataTransfer.files].find((item) => /\.json$/i.test(item.name)) || event.dataTransfer.files[0];
    if (!file) {
      return;
    }
    void openProvisioningFile(file).catch((error) => setStatus(String(error), true));
  });
  window.addEventListener("dragend", clearDragActive);
  window.addEventListener("blur", clearDragActive);
  setInterval(() => {
    if (state.live && !state.provisioningWriteAllActive) {
      refreshVisiblePage();
    }
  }, 3000);
}

main().catch((error) => setStatus(String(error), true));
