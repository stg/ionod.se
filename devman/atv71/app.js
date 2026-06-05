const state = {
  bootstrap: null,
  overview: null,
  registers: [],
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
  return [
    ...groups.driveParameter,
    ...groups.communication,
  ];
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
  if (!control) {
    return;
  }
  if (document.activeElement === control) {
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

function syncSetupWriteControls() {
  const active = document.activeElement;
  state.registers.forEach((row) => {
    const control = document.querySelector(`.write-input[data-code="${CSS.escape(row.code)}"], .write-select[data-code="${CSS.escape(row.code)}"]`);
    if (!control) {
      return;
    }
    if (control === active || control.dataset.userEdited === "1") {
      return;
    }
    syncWriteControlFromValue(row.code, currentValue(row.code));
  });
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
    <tr class="table-section-row block-section-row">
      <td colspan="7">
        <div class="table-section-copy">
          <strong>${esc(row.blockTitle)}</strong>
        </div>
      </td>
    </tr>
  `;
}

function parameterSubgroupRow(row) {
  return `
    <tr class="table-section-row subgroup-section-row">
      <td colspan="7">
        <div class="table-section-copy">
          <strong>${esc(row.subgroupTitle)}</strong>
          ${row.subgroupDescription ? `<div class="small dim">${esc(row.subgroupDescription)}</div>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function renderHome() {
  const overview = state.overview?.overview;
  const coverage = state.bootstrap.model.coverage;
  $("homePage").innerHTML = `
    <div class="section-head">
      <div>
        <div class="eyebrow">Drive Overview</div>
        <h3>ATV71 overview</h3>
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
    ${renderOverviewMetrics(overview?.hero || [], "homeHero")}
    ${renderGroupHeader("Drive", "", "Home")}
    <div class="grid three">
      <article class="card">
        <h3>Status and channels</h3>
        ${renderKeyValueList(overview?.states || [], "homeStates")}
      </article>
      <article class="card">
        <h3>Reference and PID</h3>
        ${renderKeyValueList(overview?.references || [], "homeReferences")}
      </article>
      <article class="card">
        <h3>Electrical and thermal</h3>
        ${renderKeyValueList([...(overview?.electrical || []), ...(overview?.thermal || []).slice(0, 3)], "homeElectricalThermal")}
      </article>
    </div>
    ${renderGroupHeader("Diagnostic", "", "Home")}
    <div class="grid two">
      <article class="card">
        <h3>Current fault summary</h3>
        ${renderKeyValueList(overview?.diagnostics || [], "homeDiagnostics")}
      </article>
      <article class="card">
        <h3>Network and session</h3>
        ${renderKeyValueList(overview?.network || [], "homeNetwork")}
      </article>
    </div>
  `;
}

function renderMonitoring() {
  if (!state.overview) {
    $("monitoringPage").innerHTML = `<article class="card"><p>Loading live overview...</p></article>`;
    return;
  }
  const { overview, values } = state.overview;
  const monitorCount = Object.keys(values).length;
  $("monitoringPage").innerHTML = `
    <div class="group-shell">
      ${renderGroupHeader("Drive")}
      ${renderOverviewMetrics(overview.hero, "monitorHero")}
      <div class="grid four">
        <article class="card">
          <h3>Status and channels</h3>
          ${renderKeyValueList(overview.states, "monitorStates")}
        </article>
        <article class="card">
          <h3>Reference and PID</h3>
          ${renderKeyValueList(overview.references, "monitorReferences")}
        </article>
        <article class="card">
          <h3>Electrical state</h3>
          ${renderKeyValueList(overview.electrical, "monitorElectrical")}
        </article>
        <article class="card">
          <h3>Thermal state</h3>
          ${renderKeyValueList(overview.thermal, "monitorThermal")}
        </article>
      </div>
      ${renderGroupHeader("I/O")}
      <div class="grid three">
        <article class="card">
          <h3>Base digital I/O</h3>
          ${renderKeyValueList(overview.digitalBase, "monitorDigitalBase")}
        </article>
        <article class="card">
          <h3>Card digital I/O</h3>
          ${renderKeyValueList(overview.digitalCard, "monitorDigitalCard")}
        </article>
        <article class="card">
          <h3>Analog channels</h3>
          ${renderKeyValueList(overview.analog, "monitorAnalog")}
        </article>
      </div>
      <article class="card">
        <div class="card-head">
          <div>
            <h3>Monitor variables</h3>
            <p class="small dim">${monitorCount} live monitor points.</p>
          </div>
        </div>
        <div class="table-wrap compact-table">
          <table>
            <thead><tr><th>Code</th><th>Address</th><th>Value</th><th>Raw</th><th>Label</th></tr></thead>
            <tbody>
              ${renderMonitorTableRows(values)}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}

function updateHomeValues() {
  const overview = state.overview?.overview;
  if (!overview) {
    return;
  }
  patchLiveItems("homeHero", overview.hero || []);
  patchLiveItems("homeStates", overview.states || []);
  patchLiveItems("homeReferences", overview.references || []);
  patchLiveItems("homeElectricalThermal", [...(overview.electrical || []), ...(overview.thermal || []).slice(0, 3)]);
  patchLiveItems("homeDiagnostics", overview.diagnostics || []);
  patchLiveItems("homeNetwork", overview.network || []);
}

function updateMonitoringValues() {
  const overview = state.overview?.overview;
  const values = state.overview?.values || {};
  if (!overview) {
    return;
  }
  patchLiveItems("monitorHero", overview.hero || []);
  patchLiveItems("monitorStates", overview.states || []);
  patchLiveItems("monitorReferences", overview.references || []);
  patchLiveItems("monitorElectrical", overview.electrical || []);
  patchLiveItems("monitorThermal", overview.thermal || []);
  patchLiveItems("monitorDigitalBase", overview.digitalBase || []);
  patchLiveItems("monitorDigitalCard", overview.digitalCard || []);
  patchLiveItems("monitorAnalog", overview.analog || []);
  updateMonitorTable(values);
}

function modelMetaRow(label, value) {
  if (!value) {
    return "";
  }
  return `<div class="small dim"><span class="model-label">${esc(label)}:</span> ${esc(value)}</div>`;
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

function formatTransportMeta(transport) {
  const unitText = `unit ${transport.unit_id}`;
  const rawUrl = String(transport.raw_url || transport.ionod || "").trim();
  const target = String(transport.target || "").trim();
  if (rawUrl && target) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.host;
      const endpointTarget = parsed.searchParams.get("id") || target;
      if (host && /\.ionod\.se$/i.test(host) && endpointTarget) {
        const node = host.replace(/\.ionod\.se$/i, "");
        return `${node} ${endpointTarget} ${unitText}`;
      }
    } catch (_error) {
      // fall back to generic label below
    }
  }
  return `${transport.mode} ${unitText}`;
}

function formatTransportModeSummary(transport) {
  const rawUrl = String(transport.raw_url || transport.ionod || "").trim();
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

function renderValueMeta(row) {
  const meta = scalingMeta(row);
  if (!meta.units && !meta.range) {
    return "";
  }
  return `
    ${meta.range ? `<div class="small dim value-meta">range ${esc(meta.range)}</div>` : ""}
  `;
}

function renderValueCell(row, current) {
  const meta = scalingMeta(row);
  return `
    <div class="value-stack">
      <div class="current-cell" data-code="${row.code}">
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
  const options = (row.enum || []).map((item) => `
    <option value="${item.value}" ${currentRaw === Number(item.value) ? "selected" : ""}>${esc(`${item.value} - ${item.display}`)}</option>
  `).join("");
  let writer = `<span class="dim">read only</span>`;
  if (row.writable) {
    if (row.widget === "select") {
      writer = `<select data-code="${row.code}" class="write-select">${options}</select><button data-code="${row.code}" class="write-btn">Write</button>`;
    } else if (row.widget === "checkbox") {
      writer = `<select data-code="${row.code}" class="write-select"><option value="0" ${currentRaw === 0 ? "selected" : ""}>0</option><option value="1" ${currentRaw === 1 ? "selected" : ""}>1</option></select><button data-code="${row.code}" class="write-btn">Write</button>`;
    } else {
      writer = `<input data-code="${row.code}" class="write-input" type="number" step="1" value="${currentRaw ?? ""}"><button data-code="${row.code}" class="write-btn">Write</button>`;
    }
  }
  return `
    <tr>
      <td class="monospace">${esc(row.code)}</td>
      <td>${row.address}</td>
      <td>${esc(accessMeta(row))}</td>
      <td>
        <strong>${esc(row.name)}</strong>
        <div class="small dim">${esc(row.display || "")}</div>
        ${row.explanation ? `<div class="small dim">${esc(row.explanation)}</div>` : ""}
      </td>
      <td>${renderValueCell(row, current)}</td>
      <td>${renderWriteCell(row, writer)}</td>
      <td>
        ${modelMetaRow("Category", row.category)}
        ${row.menuTags.length ? `<div class="small dim"><span class="model-label">Menus:</span> ${row.menuTags.map(esc).join(" | ")}</div>` : ""}
      </td>
    </tr>
  `;
}

function renderParameterTableBody() {
  const rows = [];
  let lastBlock = "";
  let lastSubgroup = "";
  state.registers.forEach((row) => {
    if (!state.currentBlock && row.block !== lastBlock) {
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

function renderSetup() {
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
          <table>
            <thead>
              <tr><th>Code</th><th>Address</th><th>Access</th><th>Name</th><th>Value</th><th>Write</th><th>Model</th></tr>
            </thead>
            <tbody>${renderParameterTableBody()}</tbody>
          </table>
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

function updateSetupValueCells() {
  document.querySelectorAll(".current-cell[data-code]").forEach((cell) => {
    const row = state.registers.find((item) => item.code === cell.dataset.code);
    if (!row) {
      return;
    }
    const next = renderCurrentCellContent(row, currentValue(row.code));
    if (cell.innerHTML !== next) {
      cell.innerHTML = next;
    }
  });
  syncSetupWriteControls();
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
        setStatus(`Writing ${code}...`);
        clearCurrentCell(code);
        const result = useStaticRuntime()
          ? await staticRuntime.write(state, code, value)
          : await getJson("/api/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, value }),
          });
        const readback = result.write?.readback;
        if (readback) {
          mergeRegisterCache({ [code]: readback });
          delete input.dataset.userEdited;
          syncWriteControlFromValue(code, readback);
        }
        updateSetupValueCells();
        setStatus(`Wrote ${code} = ${value}`);
        await loadOverview();
      } catch (error) {
        setStatus(String(error), true);
      }
    });
  });
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
  state.bootstrap = useStaticRuntime()
    ? await staticRuntime.loadBootstrap(state)
    : await getJson("/api/bootstrap");
  state.currentBlock = state.bootstrap.model.groups.driveParameter[0]?.id || "";
  $("transportMeta").textContent = formatTransportMeta(state.bootstrap.transport);
  renderNav();
}

async function loadOverview() {
  state.overview = useStaticRuntime()
    ? await staticRuntime.loadOverview(state)
    : await getJson("/api/overview");
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
  const data = useStaticRuntime()
    ? await staticRuntime.loadRegisters(state, {
      block: state.currentBlock,
      search: state.search,
      writableOnly: state.writableOnly,
    })
    : await (async () => {
      const params = new URLSearchParams();
      if (state.currentBlock) {
        params.set("block", state.currentBlock);
      }
      if (state.search) {
        params.set("search", state.search);
      }
      if (state.writableOnly) {
        params.set("writable", "1");
      }
      return getJson(`/api/registers?${params.toString()}`);
    })();
  state.registers = data.items;
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
  mergeRegisterCache(data.values || {});
  state.setupValuesLoading = false;
  updateSetupValueCells();
  setStatus(`Loaded ${Object.keys(data.values || {}).length} register values`);
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
  setInterval(() => {
    if (state.live) {
      refreshVisiblePage();
    }
  }, 3000);
}

main().catch((error) => setStatus(String(error), true));
