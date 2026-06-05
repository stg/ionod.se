const state = {
  registry: null,
  supportedTypes: new Map(),
  currentBaseUrl: "",
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const node = $("status");
  node.textContent = message || "";
  node.classList.toggle("error", !!isError);
}

function normalizeBaseUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    throw new Error("Address is required");
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (!parsed.hostname) {
    throw new Error("Invalid address");
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

async function loadRegistry() {
  const registry = await fetchJson("./registry.json");
  state.registry = registry;
  state.supportedTypes = new Map((registry.supportedDevices || []).map(item => [`${item.device}:${item.protocol || ""}`, item]));
}

function endpointPath(endpoint) {
  const descriptor = String(endpoint.device || "");
  const parts = descriptor.split(":");
  const family = parts[0] || descriptor;
  const protocol = parts[1] || "";
  const definition = state.supportedTypes.get(`${family}:${protocol}`);
  if (!definition) {
    return null;
  }
  const unit = parts.length >= 3 && /^\d+$/.test(parts[2])
    ? Number(parts[2])
    : (Number.isFinite(definition.defaultUnitId) ? definition.defaultUnitId : 0);
  const params = new URLSearchParams({
    base: state.currentBaseUrl,
    target: endpoint.id,
    unit: String(unit),
  });
  return `./${definition.path}?${params.toString()}`;
}

function renderResults(endpoints) {
  const node = $("results");
  if (!endpoints.length) {
    node.className = "results empty";
    node.innerHTML = "<p>No available devices.</p>";
    return;
  }
  node.className = "results";
  node.innerHTML = `<div class="endpoint-list">${endpoints.map(endpoint => {
    const descriptor = String(endpoint.device || "");
    const parts = descriptor.split(":");
    const family = parts[0] || descriptor;
    const protocol = parts[1] || "";
    const definition = state.supportedTypes.get(`${family}:${protocol}`);
    const href = endpointPath(endpoint);
    return `<article class="endpoint-card">
      <div>
        <strong>${endpoint.id}</strong>
        <div class="muted">${definition ? definition.title : descriptor}</div>
      </div>
      <div class="endpoint-meta">
        <span class="pill">${descriptor}</span>
        <span class="pill">raw</span>
      </div>
      <div>
        <a href="${href}"><button type="button">Open ${definition ? definition.title : descriptor}</button></a>
      </div>
    </article>`;
  }).join("")}</div>`;
}

async function loginAndLoadEndpoints(event) {
  event.preventDefault();
  const address = $("addressInput").value;
  const username = $("usernameInput").value.trim();
  const password = $("passwordInput").value;
  try {
    state.currentBaseUrl = normalizeBaseUrl(address);
    window.localStorage.setItem("ionod.devman.address", state.currentBaseUrl);
    window.localStorage.setItem("ionod.devman.username", username);
    setStatus(`Logging into ${state.currentBaseUrl} ...`);
    await fetchJson(`${state.currentBaseUrl}/api/login`, {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        remember: false,
        language: "en",
      }),
    });
    const services = await fetchJson(`${state.currentBaseUrl}/api/services`, {
      mode: "cors",
      credentials: "include",
    });
    const rawService = Array.isArray(services.services) ? services.services.find(service => service && service.name === "raw") : null;
    const supported = Array.isArray(rawService?.availableTargets)
      ? rawService.availableTargets.filter(target => {
          if (!target) return false;
          const descriptor = String(target.device || "");
          const parts = descriptor.split(":");
          const family = parts[0] || descriptor;
          const protocol = parts[1] || "";
          return state.supportedTypes.has(`${family}:${protocol}`);
        }).map(target => ({
          ...target,
          device: String(target.device || ""),
        }))
      : [];
    $("resultsTitle").textContent = `${new URL(state.currentBaseUrl).host}:${username}`;
    renderResults(supported);
    setStatus(`Loaded ${supported.length} supported endpoint${supported.length === 1 ? "" : "s"}.`);
  } catch (error) {
    renderResults([]);
    setStatus(String(error && error.message ? error.message : error), true);
  }
}

async function main() {
  await loadRegistry();
  $("loginForm").addEventListener("submit", loginAndLoadEndpoints);
  $("addressInput").value = window.localStorage.getItem("ionod.devman.address") || "";
  $("usernameInput").value = window.localStorage.getItem("ionod.devman.username") || "";
  setStatus(`Supported devices: ${(state.registry.supportedDevices || []).map(item => item.device).join(", ")}`);
}

main().catch(error => setStatus(String(error && error.message ? error.message : error), true));
