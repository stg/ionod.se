(function () {
  const STATIC_CONFIG = window.REPLICA_STATIC_CONFIG || null;
  const WORD_ORDER_MSW_FIRST = "msw_first";
  const WORD_ORDER_LSW_FIRST = "lsw_first";
  const MAX_BATCH_WORDS = 16;

  function isEnabled() {
    return !!STATIC_CONFIG;
  }

  function configValue(key, fallback = "") {
    if (!STATIC_CONFIG || typeof STATIC_CONFIG !== "object") {
      return fallback;
    }
    const value = STATIC_CONFIG[key];
    return value === undefined || value === null ? fallback : value;
  }

  function loginUrl() {
    return String(configValue("loginUrl", "../index.html"));
  }

  function requireSearchParam(name) {
    const value = new URLSearchParams(window.location.search).get(name);
    if (!value) {
      throw new Error(`Missing ${name} in URL. Return to ${loginUrl()}.`);
    }
    return value.trim();
  }

  function staticBaseUrl() {
    const raw = requireSearchParam("base");
    if (/^https?:\/\//i.test(raw)) {
      return raw.replace(/\/+$/, "");
    }
    return `https://${raw.replace(/^\/+|\/+$/g, "")}`;
  }

  function staticTarget() {
    return requireSearchParam("target");
  }

  function staticUser() {
    return new URLSearchParams(window.location.search).get("user") || "";
  }

  function staticUnitId() {
    const raw = new URLSearchParams(window.location.search).get("unit");
    if (!raw) {
      return 0;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function staticRawUrl() {
    const base = new URL(staticBaseUrl());
    const scheme = base.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${base.host}/raw?id=${encodeURIComponent(staticTarget())}`;
  }

  function parseUnits(units) {
    const text = String(units || "").trim();
    if (!text || text === "-" || text === "1" || text === "Refer to programming manual") {
      return { divisor: null, suffix: "" };
    }
    const match = text.match(/^(0\.\d+|1)\s+(.+)$/);
    if (!match) {
      return { divisor: null, suffix: text };
    }
    const scale = match[1];
    const suffix = match[2].trim();
    if (scale === "1") {
      return { divisor: 1, suffix };
    }
    if (/^0\.0*1$/.test(scale)) {
      return { divisor: 10 ** scale.split(".")[1].length, suffix };
    }
    return { divisor: null, suffix };
  }

  function formatNumber(value) {
    if (Number.isInteger(value)) {
      return String(value);
    }
    if (Math.abs(value - Math.round(value)) < 1e-9) {
      return String(Math.round(value));
    }
    return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function formatRegisterValue(values, registerMap, code, options = {}) {
    const entry = values[code];
    if (!entry) {
      return "n/a";
    }
    const register = registerMap[code] || {};
    const parsedUnits = parseUnits(register.units);
    let current = entry.value;
    const divisor = options.divisor === undefined ? parsedUnits.divisor : options.divisor;
    const suffix = options.suffix === undefined ? parsedUnits.suffix : options.suffix;
    if (typeof current === "number" && divisor !== null && divisor !== 0) {
      current = current / divisor;
    }
    let text = typeof current === "number" ? formatNumber(current) : String(current);
    if (suffix) {
      text = `${text} ${suffix}`;
    }
    if (options.includeLabel && entry.label) {
      text = `${text} (${entry.label})`;
    }
    return text;
  }

  function wordState(values, code) {
    const entry = values[code];
    if (!entry || typeof entry.raw !== "number") {
      return ["n/a", ""];
    }
    return [`0x${entry.raw.toString(16).toUpperCase().padStart(4, "0")}`, entry.label || ""];
  }

  function formatBitState(raw, bit) {
    if (raw === undefined || raw === null) {
      return "n/a";
    }
    return (raw & (1 << bit)) !== 0 ? "On" : "Off";
  }

  function deriveOverview(values, registerMap) {
    const [etaValue, etaDetail] = wordState(values, "ETA");
    const [etiValue, etiDetail] = wordState(values, "ETI");
    const [cmdValue, cmdDetail] = wordState(values, "CMD");
    const inputImage = values.IL1I ? values.IL1I.raw : null;
    const outputImage = values.OL1R ? values.OL1R.raw : null;
    return {
      hero: [
        { label: "Output frequency", value: formatRegisterValue(values, registerMap, "LFR", { divisor: 10, suffix: "Hz" }) },
        { label: "Reference frequency", value: formatRegisterValue(values, registerMap, "RFR", { divisor: 10, suffix: "Hz" }) },
        { label: "Speed", value: formatRegisterValue(values, registerMap, "SPD", { divisor: 10, suffix: "Hz" }) },
        { label: "Motor current", value: formatRegisterValue(values, registerMap, "LCR", { divisor: 10, suffix: "A" }) },
        { label: "Output power", value: formatRegisterValue(values, registerMap, "EPRW", { divisor: 10, suffix: "kW" }) },
        { label: "Efficiency", value: formatRegisterValue(values, registerMap, "EFY", { divisor: 10, suffix: "%" }) },
      ],
      drive: [
        { label: "Status word", value: etaValue, detail: etaDetail },
        { label: "Drive state", value: etiValue, detail: etiDetail },
        { label: "Command word", value: cmdValue, detail: cmdDetail },
        { label: "Command channel", value: formatRegisterValue(values, registerMap, "CCC", { includeLabel: true }) },
        { label: "Reference channel", value: formatRegisterValue(values, registerMap, "CRC", { includeLabel: true }) },
        { label: "HMI state", value: formatRegisterValue(values, registerMap, "HMIS", { includeLabel: true }) },
        { label: "Active set", value: formatRegisterValue(values, registerMap, "CFPS", { includeLabel: true }) },
        { label: "Switching frequency", value: formatRegisterValue(values, registerMap, "SFR", { suffix: "kHz" }) },
      ],
      electrical: [
        { label: "Mains voltage", value: formatRegisterValue(values, registerMap, "ULN", { divisor: 10, suffix: "V" }) },
        { label: "DC bus", value: formatRegisterValue(values, registerMap, "VBUS", { divisor: 10, suffix: "V" }) },
        { label: "Motor voltage", value: formatRegisterValue(values, registerMap, "UOP", { suffix: "V" }) },
        { label: "Motor power", value: formatRegisterValue(values, registerMap, "OPR", { suffix: "kW" }) },
        { label: "Motor torque", value: formatRegisterValue(values, registerMap, "OTR", { suffix: "%" }) },
        { label: "Drive thermal", value: formatRegisterValue(values, registerMap, "THD", { suffix: "%" }) },
        { label: "Motor thermal", value: formatRegisterValue(values, registerMap, "THR", { suffix: "%" }) },
      ],
      io: [
        { label: "AI1", value: formatRegisterValue(values, registerMap, "AI1C", { divisor: 1000 }) },
        { label: "AI2", value: formatRegisterValue(values, registerMap, "AI2C", { divisor: 1000 }) },
        { label: "AI3", value: formatRegisterValue(values, registerMap, "AI3C", { divisor: 1000 }) },
        { label: "AI4", value: formatRegisterValue(values, registerMap, "AI4C", { divisor: 1000 }) },
        { label: "AI5", value: formatRegisterValue(values, registerMap, "AI5C", { divisor: 1000 }) },
        { label: "AO1", value: formatRegisterValue(values, registerMap, "AO1C", { divisor: 1000 }) },
        { label: "AO2", value: formatRegisterValue(values, registerMap, "AO2C", { divisor: 1000 }) },
        { label: "DI1", value: formatBitState(inputImage, 0) },
        { label: "DI2", value: formatBitState(inputImage, 1) },
        { label: "DI3", value: formatBitState(inputImage, 2) },
        { label: "DI4", value: formatBitState(inputImage, 3) },
        { label: "DI5", value: formatBitState(inputImage, 4) },
        { label: "DI6", value: formatBitState(inputImage, 5) },
        { label: "R1", value: formatBitState(outputImage, 0) },
        { label: "R2", value: formatBitState(outputImage, 1) },
        { label: "R3", value: formatBitState(outputImage, 2) },
      ],
      process: [
        { label: "Internal PID ref", value: formatRegisterValue(values, registerMap, "RPI", { divisor: 100, suffix: "bar" }) },
        { label: "PID reference", value: formatRegisterValue(values, registerMap, "RPC", { divisor: 100, suffix: "bar" }) },
        { label: "PID feedback", value: formatRegisterValue(values, registerMap, "RPF", { divisor: 100, suffix: "bar" }) },
        { label: "PID error", value: formatRegisterValue(values, registerMap, "RPE", { divisor: 100, suffix: "bar" }) },
        { label: "PID output", value: formatRegisterValue(values, registerMap, "RPO", { divisor: 10, suffix: "Hz" }) },
        { label: "Flow sensor 1", value: formatRegisterValue(values, registerMap, "FS1V", { divisor: 100 }) },
        { label: "Flow sensor 2", value: formatRegisterValue(values, registerMap, "FS2V", { divisor: 100 }) },
        { label: "Inlet pressure", value: formatRegisterValue(values, registerMap, "PS1V", { divisor: 100, suffix: "bar" }) },
        { label: "Outlet pressure", value: formatRegisterValue(values, registerMap, "PS2V", { divisor: 100, suffix: "bar" }) },
        { label: "Total quantity", value: formatRegisterValue(values, registerMap, "FS1C", { divisor: 100 }) },
        { label: "Application state", value: formatRegisterValue(values, registerMap, "APPS", { includeLabel: true }) },
      ],
      energy: [
        { label: "Electrical power", value: formatRegisterValue(values, registerMap, "EPRW", { divisor: 10, suffix: "kW" }) },
        { label: "Electrical power sum", value: formatRegisterValue(values, registerMap, "EPRS", { divisor: 10, suffix: "kW" }) },
        { label: "Input power", value: formatRegisterValue(values, registerMap, "IPRW", { divisor: 10, suffix: "kW" }) },
        { label: "Efficiency", value: formatRegisterValue(values, registerMap, "EFY", { divisor: 10, suffix: "%" }) },
        { label: "Efficiency sum", value: formatRegisterValue(values, registerMap, "EFYS", { divisor: 10, suffix: "%" }) },
        { label: "Energy consumption index", value: formatRegisterValue(values, registerMap, "ECI", { divisor: 10, suffix: "%" }) },
        { label: "Energy performance index", value: formatRegisterValue(values, registerMap, "EPI", { divisor: 10, suffix: "%" }) },
        { label: "Runtime thermal", value: formatRegisterValue(values, registerMap, "RTH") },
        { label: "Power on time", value: formatRegisterValue(values, registerMap, "PTH") },
      ],
      pump: [
        { label: "Booster status", value: formatRegisterValue(values, registerMap, "BCS", { includeLabel: true }) },
        { label: "Tank level", value: formatRegisterValue(values, registerMap, "LCTL") },
        { label: "Available pumps", value: formatRegisterValue(values, registerMap, "MPAN") },
        { label: "Staged pumps", value: formatRegisterValue(values, registerMap, "MPSN") },
        { label: "Next staged pump", value: formatRegisterValue(values, registerMap, "PNTS") },
        { label: "Next destaged pump", value: formatRegisterValue(values, registerMap, "PNTD") },
        { label: "Lead pump", value: formatRegisterValue(values, registerMap, "PLID") },
        { label: "Highest efficiency", value: formatRegisterValue(values, registerMap, "EFYK", { divisor: 10, suffix: "%" }) },
        { label: "Lowest efficiency", value: formatRegisterValue(values, registerMap, "EFYJ", { divisor: 10, suffix: "%" }) },
      ],
      diagnostics: [
        { label: "Last fault", value: formatRegisterValue(values, registerMap, "LFT", { includeLabel: true }) },
        { label: "Last warning", value: formatRegisterValue(values, registerMap, "LALR", { includeLabel: true }) },
        { label: "Fieldbus fault", value: formatRegisterValue(values, registerMap, "CNF", { includeLabel: true }) },
        { label: "Ethernet error", value: formatRegisterValue(values, registerMap, "ERR", { includeLabel: true }) },
        { label: "Ethernet fault", value: formatRegisterValue(values, registerMap, "ETHF", { includeLabel: true }) },
        { label: "Trip journal", value: formatRegisterValue(values, registerMap, "TJD") },
        { label: "Number of starts", value: formatRegisterValue(values, registerMap, "NSM") },
      ],
    };
  }

  function decodeRegisterValue(raw, signed, wordCount) {
    const bits = 16 * wordCount;
    const signBit = 2 ** (bits - 1);
    if (signed && raw >= signBit) {
      return raw - 2 ** bits;
    }
    return raw;
  }

  function decodeRegisterWords(register, words) {
    const ordered = Array.from(words);
    if ((register.word_order || WORD_ORDER_MSW_FIRST) === WORD_ORDER_LSW_FIRST) {
      ordered.reverse();
    }
    let raw = 0;
    for (const word of ordered) {
      raw = (raw * 65536) + (Number(word) & 0xffff);
    }
    return {
      raw,
      value: decodeRegisterValue(raw, !!register.signed, Number(register.word_count || 1)),
    };
  }

  function encodeRegisterValue(value, signed, wordCount) {
    const bits = 16 * wordCount;
    const maxUnsigned = (2 ** bits) - 1;
    if (signed) {
      const lower = -(2 ** (bits - 1));
      const upper = (2 ** (bits - 1)) - 1;
      if (value < lower || value > upper) {
        throw new Error(`signed value outside ${bits}-bit range`);
      }
      return value < 0 ? (2 ** bits) + value : value;
    }
    if (value < 0 || value > maxUnsigned) {
      throw new Error(`unsigned value outside ${bits}-bit range`);
    }
    return value;
  }

  function encodeRegisterWords(register, value) {
    const wordCount = Number(register.word_count || 1);
    const encoded = encodeRegisterValue(Number(value), !!register.signed, wordCount);
    const words = [];
    for (let index = wordCount - 1; index >= 0; index -= 1) {
      words.push(Math.floor(encoded / (2 ** (16 * index))) & 0xffff);
    }
    if ((register.word_order || WORD_ORDER_MSW_FIRST) === WORD_ORDER_LSW_FIRST) {
      words.reverse();
    }
    return { raw: encoded, words };
  }

  function buildBatches(registerMap, codes) {
    const requested = [];
    for (const code of codes) {
      const register = registerMap[code];
      if (register && register.readable) {
        requested.push([code, register]);
      }
    }
    requested.sort((left, right) => {
      if (left[1].address !== right[1].address) {
        return left[1].address - right[1].address;
      }
      return String(left[0]).localeCompare(String(right[0]));
    });
    const batches = [];
    let currentStart = 0;
    let currentEnd = 0;
    let currentCodes = [];
    for (const [code, register] of requested) {
      const regStart = Number(register.address);
      const regEnd = regStart + Number(register.word_count || 1);
      if (!currentCodes.length) {
        currentStart = regStart;
        currentEnd = regEnd;
        currentCodes = [[code, register]];
        continue;
      }
      const nextSpan = regEnd - currentStart;
      if (regStart > currentEnd || nextSpan > MAX_BATCH_WORDS) {
        batches.push([currentStart, currentEnd - currentStart, currentCodes]);
        currentStart = regStart;
        currentEnd = regEnd;
        currentCodes = [[code, register]];
        continue;
      }
      currentEnd = Math.max(currentEnd, regEnd);
      currentCodes.push([code, register]);
    }
    if (currentCodes.length) {
      batches.push([currentStart, currentEnd - currentStart, currentCodes]);
    }
    return batches;
  }

  class RawModbusClient {
    constructor(rawUrl, unitId) {
      this.rawUrl = rawUrl;
      this.unitId = unitId;
      this.socket = null;
      this.connectPromise = null;
      this.pending = new Map();
      this.nextTransactionId = 1;
      this.queue = Promise.resolve();
      this.timeoutMs = 5000;
    }

    async ensureOpen() {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        return this.socket;
      }
      if (this.connectPromise) {
        return this.connectPromise;
      }
      this.connectPromise = new Promise((resolve, reject) => {
        const socket = new WebSocket(this.rawUrl);
        socket.binaryType = "arraybuffer";
        socket.onopen = () => {
          this.socket = socket;
          this.connectPromise = null;
          resolve(socket);
        };
        socket.onerror = () => {
          this.connectPromise = null;
          reject(new Error(`Failed to open raw websocket ${this.rawUrl}`));
        };
        socket.onclose = () => {
          if (this.socket === socket) {
            this.socket = null;
          }
          this.rejectPending(new Error("Raw websocket closed"));
        };
        socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      });
      return this.connectPromise;
    }

    rejectPending(error) {
      for (const [, pending] of this.pending) {
        pending.reject(error);
      }
      this.pending.clear();
    }

    handleMessage(data) {
      const processBuffer = (buffer) => {
        const bytes = new Uint8Array(buffer);
        if (bytes.length < 8) {
          return;
        }
        const transactionId = (bytes[0] << 8) | bytes[1];
        const pending = this.pending.get(transactionId);
        if (!pending) {
          return;
        }
        this.pending.delete(transactionId);
        pending.resolve(bytes);
      };

      if (data instanceof ArrayBuffer) {
        processBuffer(data);
        return;
      }
      if (data && typeof data.arrayBuffer === "function") {
        data.arrayBuffer().then(processBuffer).catch(() => {});
      }
    }

    enqueue(work) {
      const next = this.queue.then(work, work);
      this.queue = next.catch(() => {});
      return next;
    }

    async request(functionCode, bodyBytes) {
      return this.enqueue(async () => {
        const socket = await this.ensureOpen();
        const transactionId = this.nextTransactionId;
        this.nextTransactionId = (this.nextTransactionId + 1) & 0xffff;
        if (this.nextTransactionId === 0) {
          this.nextTransactionId = 1;
        }

        const pduLength = 1 + bodyBytes.length;
        const frame = new Uint8Array(7 + pduLength);
        frame[0] = (transactionId >> 8) & 0xff;
        frame[1] = transactionId & 0xff;
        frame[2] = 0;
        frame[3] = 0;
        frame[4] = ((pduLength + 1) >> 8) & 0xff;
        frame[5] = (pduLength + 1) & 0xff;
        frame[6] = this.unitId & 0xff;
        frame[7] = functionCode & 0xff;
        frame.set(bodyBytes, 8);

        const response = await new Promise((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            this.pending.delete(transactionId);
            reject(new Error("Timed out waiting for Modbus response"));
          }, this.timeoutMs);
          this.pending.set(transactionId, {
            resolve: (bytes) => {
              window.clearTimeout(timeout);
              resolve(bytes);
            },
            reject: (error) => {
              window.clearTimeout(timeout);
              reject(error);
            },
          });
          socket.send(frame);
        });

        const bytes = response;
        const responseFunction = bytes[7];
        if ((responseFunction & 0x80) !== 0) {
          throw new Error(`Modbus error ${bytes[8] || "unknown"} for function ${functionCode}`);
        }
        if (responseFunction !== functionCode) {
          throw new Error(`Unexpected Modbus function ${responseFunction}, expected ${functionCode}`);
        }
        return bytes.slice(8);
      });
    }

    async readHoldingRegisters(start, count) {
      const body = new Uint8Array([
        (start >> 8) & 0xff,
        start & 0xff,
        (count >> 8) & 0xff,
        count & 0xff,
      ]);
      const response = await this.request(3, body);
      const byteCount = response[0];
      if (byteCount !== count * 2) {
        throw new Error(`Unexpected Modbus read response length ${byteCount}`);
      }
      const words = [];
      for (let index = 0; index < count; index += 1) {
        const offset = 1 + (index * 2);
        words.push((response[offset] << 8) | response[offset + 1]);
      }
      return words;
    }

    async writeSingleRegister(address, word) {
      const body = new Uint8Array([
        (address >> 8) & 0xff,
        address & 0xff,
        (word >> 8) & 0xff,
        word & 0xff,
      ]);
      await this.request(6, body);
    }

    async writeHoldingRegisters(address, words) {
      const body = new Uint8Array(5 + (words.length * 2));
      body[0] = (address >> 8) & 0xff;
      body[1] = address & 0xff;
      body[2] = (words.length >> 8) & 0xff;
      body[3] = words.length & 0xff;
      body[4] = words.length * 2;
      for (let index = 0; index < words.length; index += 1) {
        const offset = 5 + (index * 2);
        body[offset] = (words[index] >> 8) & 0xff;
        body[offset + 1] = words[index] & 0xff;
      }
      await this.request(16, body);
    }
  }

  async function ensureBundle(state) {
    if (state.staticBundle) {
      return state.staticBundle;
    }
    const response = await fetch(String(configValue("bundleUrl", "./bundle.json")));
    const bundle = await response.json();
    if (!response.ok) {
      throw new Error(bundle.error || `${response.status} ${response.statusText}`);
    }
    state.staticBundle = bundle;
    state.staticRegisterMap = Object.fromEntries((bundle.registers || []).map((item) => [item.code, item]));
    return bundle;
  }

  function buildBootstrap(bundle) {
    const base = staticBaseUrl();
    return {
      ...bundle.bootstrap,
      transport: {
        ionod: staticRawUrl(),
        target: staticTarget(),
        display_host: new URL(base).host,
        display_user: staticUser(),
        mode: "raw_ws",
        tcp_port: 502,
        proxy_command: "browser-websocket",
        raw_base_url: base,
        raw_url: staticRawUrl(),
        unit_id: staticUnitId(),
      },
    };
  }

  async function ensureClient(state) {
    if (state.staticClient) {
      return state.staticClient;
    }
    state.staticClient = new RawModbusClient(staticRawUrl(), staticUnitId());
    return state.staticClient;
  }

  function staticRegisterSearch(items, search) {
    if (!search) {
      return items;
    }
    const needle = search.toLowerCase();
    return items.filter((item) => (
      `${item.code} ${item.address} ${item.name} ${item.display || ""} ${item.category || ""} ${item.menu || ""} ${item.units || ""}`.toLowerCase().includes(needle)
    ));
  }

  async function readMany(state, codes) {
    await ensureBundle(state);
    const registerMap = state.staticRegisterMap || {};
    const client = await ensureClient(state);
    const values = {};
    for (const [batchStart, batchCount, batchCodes] of buildBatches(registerMap, codes)) {
      const block = await client.readHoldingRegisters(batchStart, batchCount);
      for (const [code, register] of batchCodes) {
        const offset = Number(register.address) - batchStart;
        const words = block.slice(offset, offset + Number(register.word_count || 1));
        const decoded = decodeRegisterWords(register, words);
        let label = null;
        for (const enumItem of register.enum || []) {
          if (enumItem.value === decoded.value || enumItem.value === decoded.raw) {
            label = enumItem.display;
            break;
          }
        }
        values[code] = {
          raw: decoded.raw,
          value: decoded.value,
          label,
          address: register.address,
          units: register.units,
          type: register.type,
        };
      }
    }
    return { ok: true, values };
  }

  async function writeOne(state, code, value) {
    await ensureBundle(state);
    const register = state.staticRegisterMap[code];
    if (!register) {
      throw new Error(`unknown register code ${code}`);
    }
    if (!register.writable) {
      throw new Error(`register ${code} is not writable`);
    }
    const client = await ensureClient(state);
    const encoded = encodeRegisterWords(register, Number(value));
    if (encoded.words.length === 1) {
      await client.writeSingleRegister(Number(register.address), encoded.words[0]);
    } else {
      await client.writeHoldingRegisters(Number(register.address), encoded.words);
    }
    const readback = register.readable ? (await readMany(state, [code])).values[code] : null;
    return {
      ok: true,
      write: {
        code,
        raw: encoded.raw,
        value: Number(value),
        words: encoded.words,
        readback,
      },
    };
  }

  window.ReplicaStaticRuntime = {
    isEnabled,
    loginUrl,
    async loadBootstrap(state) {
      const bundle = await ensureBundle(state);
      return buildBootstrap(bundle);
    },
    async loadOverview(state) {
      await ensureBundle(state);
      const bootstrap = buildBootstrap(state.staticBundle);
      const codes = (bootstrap.catalog && bootstrap.catalog.monitorCodes) || [];
      const result = await readMany(state, codes);
      return {
        ok: true,
        values: result.values,
        overview: deriveOverview(result.values, state.staticRegisterMap || {}),
      };
    },
    async loadReference(state) {
      const bundle = await ensureBundle(state);
      return bundle.reference || { ok: true, liveRestFiles: [], referencePayloads: bundle.bootstrap.referencePayloads || {} };
    },
    async loadRegisters(state, options) {
      const bundle = await ensureBundle(state);
      let items = Array.isArray(bundle.registers) ? [...bundle.registers] : [];
      if (options.block) {
        items = items.filter((item) => item.block === options.block);
      }
      items = staticRegisterSearch(items, options.search || "");
      if (options.writableOnly) {
        items = items.filter((item) => item.writable);
      }
      return { ok: true, total: items.length, items };
    },
    async loadValues(state, codes) {
      return readMany(state, codes);
    },
    async write(state, code, value) {
      return writeOne(state, code, value);
    },
  };
})();
