"use strict";

const SERVICE_UUID = "42f00001-9b5f-4f6e-9f19-6f4b7c9a4e10";
const COMMAND_UUID = "42f00002-9b5f-4f6e-9f19-6f4b7c9a4e10";
const RESPONSE_UUID = "42f00003-9b5f-4f6e-9f19-6f4b7c9a4e10";
const DEFAULT_STATIONS = [
  { id: "SFM", gpio: 17, pin: 11, stream: "https://iceant.eclipse-streaming.co.za/SFM" },
  { id: "OFM", gpio: 27, pin: 13, stream: "https://edge.iono.fm/xice/ofm_live_medium.mp3" },
  { id: "RSG", gpio: 22, pin: 15, stream: "https://27913.live.streamtheworld.com/RSGAAC_SC" },
  { id: "ALGUA", gpio: 5, pin: 29, stream: "https://edge.iono.fm/xice/54_medium.aac" },
  { id: "LEK", gpio: 6, pin: 31, stream: "https://zas3.ndx.co.za:8002/stream" },
  { id: "", gpio: 26, pin: 37, stream: "" },
  { id: "", gpio: 23, pin: 16, stream: "" },
  { id: "", gpio: 24, pin: 18, stream: "" },
  { id: "", gpio: 25, pin: 22, stream: "" },
  { id: "", gpio: 16, pin: 36, stream: "" },
];
const DEFAULT_ACCESS_CODE = "ewrd5qyw";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const elements = {
  browserWarning: document.querySelector("#browser-warning"),
  connectButton: document.querySelector("#connect-button"),
  connectionChip: document.querySelector("#connection-chip"),
  deviceName: document.querySelector("#device-name"),
  dashboard: document.querySelector("#dashboard"),
  radioName: document.querySelector("#radio-name"),
  wifiStatus: document.querySelector("#wifi-status"),
  ipAddress: document.querySelector("#ip-address"),
  stationName: document.querySelector("#station-name"),
  refreshButton: document.querySelector("#refresh-button"),
  scanButton: document.querySelector("#scan-button"),
  networkSelect: document.querySelector("#network-select"),
  manualSsid: document.querySelector("#manual-ssid"),
  wifiPassword: document.querySelector("#wifi-password"),
  wifiForm: document.querySelector("#wifi-form"),
  saveButton: document.querySelector("#save-button"),
  advancedButton: document.querySelector("#advanced-button"),
  advancedSettings: document.querySelector("#advanced-settings"),
  closeAdvancedButton: document.querySelector("#close-advanced-button"),
  advancedLoading: document.querySelector("#advanced-loading"),
  advancedProgress: document.querySelector("#advanced-progress"),
  advancedProgressPercent: document.querySelector("#advanced-progress-percent"),
  advancedProgressText: document.querySelector("#advanced-progress-text"),
  stationsForm: document.querySelector("#stations-form"),
  stationFields: document.querySelector("#station-fields"),
  resetStreamsButton: document.querySelector("#reset-streams-button"),
  resetIdsButton: document.querySelector("#reset-ids-button"),
  saveStationsButton: document.querySelector("#save-stations-button"),
  accessForm: document.querySelector("#access-form"),
  accessCode: document.querySelector("#access-code"),
  factoryResetButton: document.querySelector("#factory-reset-button"),
  saveAccessButton: document.querySelector("#save-access-button"),
  debugButton: document.querySelector("#debug-button"),
  message: document.querySelector("#message"),
};

let device = null;
let commandCharacteristic = null;
let responseCharacteristic = null;
let requestId = 0;
let advancedLoaded = false;
let expectedDisconnectMessage = "";
let stationDrafts = [];

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function showMessage(text, type = "working") {
  elements.message.textContent = text;
  elements.message.className = `notice ${type}`;
  elements.message.hidden = false;
  requestAnimationFrame(() => elements.message.scrollIntoView({ behavior: "smooth", block: "nearest" }));
}

function clearMessage() {
  elements.message.hidden = true;
  elements.message.textContent = "";
}

function setConnected(connected) {
  elements.connectionChip.classList.toggle("connected", connected);
  elements.connectionChip.innerHTML = connected ? "<i></i>Bluetooth connected" : "<i></i>Not connected";
  if (!connected) {
    elements.dashboard.hidden = true;
    commandCharacteristic = null;
    responseCharacteristic = null;
    advancedLoaded = false;
    elements.advancedSettings.hidden = true;
    elements.advancedLoading.hidden = true;
  }
}

function setBusy(button, busy, busyText = "Working…") {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.originalText;
}

async function browserDiagnostics(error = null) {
  let brave = false;
  try {
    brave = Boolean(navigator.brave && await navigator.brave.isBrave());
  } catch (_) {
    brave = Boolean(navigator.brave);
  }
  const lines = [
    "RadioLink Bluetooth diagnostics",
    "",
    `Browser: ${brave ? "Brave" : "Not identified as Brave"}`,
    `Secure HTTPS context: ${window.isSecureContext ? "yes" : "NO"}`,
    `Web Bluetooth API present: ${"bluetooth" in navigator ? "yes" : "NO"}`,
    `Bluetooth request function: ${typeof navigator.bluetooth?.requestDevice === "function" ? "yes" : "NO"}`,
    `Platform: ${navigator.platform || "unknown"}`,
  ];
  if (error) {
    lines.push(`Error name: ${error.name || "unknown"}`);
    lines.push(`Error message: ${error.message || String(error)}`);
  }
  if (brave) {
    lines.push("");
    lines.push("RESULT: Brave disables Web Bluetooth. Open this URL in Chrome.");
  } else if (!("bluetooth" in navigator)) {
    lines.push("");
    lines.push("RESULT: This browser does not expose Web Bluetooth.");
  }
  return { brave, text: lines.join("\n") };
}

async function showDiagnostics(error = null) {
  const report = await browserDiagnostics(error);
  alert(report.text);
  return report;
}

async function connectRadio() {
  clearMessage();
  const diagnostics = await browserDiagnostics();
  if (diagnostics.brave) {
    alert(diagnostics.text);
    showMessage("Brave disables Web Bluetooth, so it cannot open the radio chooser. Copy this page's address into Chrome on Android.", "error");
    return;
  }
  if (!("bluetooth" in navigator)) {
    elements.browserWarning.hidden = false;
    showMessage("This browser cannot open a Web Bluetooth device picker. Use Chrome on Android or a supported desktop computer. iPhone and iPad browsers are not supported.", "error");
    return;
  }
  setBusy(elements.connectButton, true, "Looking…");
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
    });
    device.addEventListener("gattserverdisconnected", () => {
      setConnected(false);
      if (expectedDisconnectMessage) {
        showMessage(expectedDisconnectMessage, "warning");
        expectedDisconnectMessage = "";
      } else {
        showMessage("Bluetooth disconnected. Choose the radio again to continue.", "warning");
      }
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    commandCharacteristic = await service.getCharacteristic(COMMAND_UUID);
    responseCharacteristic = await service.getCharacteristic(RESPONSE_UUID);
    elements.deviceName.textContent = device.name || "RadioLink radio";
    setConnected(true);
    showMessage("Radio connected. Loading its status and nearby Wi-Fi networks…", "working");
    renderStatus(await command("status"));
    elements.dashboard.hidden = false;
    await scanNetworks();
  } catch (error) {
    if (error.name === "NotAllowedError" || /permission.*block/i.test(error.message)) {
      await showDiagnostics(error);
      showMessage("Bluetooth permission is blocked. Tap the site-information icon beside the address, open Permissions, reset this site's permissions, and reload. On Android, also allow Chrome's Nearby devices permission in the phone's Settings app.", "error");
    } else if (error.name !== "NotFoundError") {
      await showDiagnostics(error);
      showMessage(`Could not connect: ${error.message}`, "error");
    }
  } finally {
    setBusy(elements.connectButton, false);
  }
}

async function writeFrame(marker, payload = new Uint8Array()) {
  const frame = new Uint8Array(payload.length + 1);
  frame[0] = marker;
  frame.set(payload, 1);
  if (typeof commandCharacteristic.writeValueWithResponse === "function") {
    await commandCharacteristic.writeValueWithResponse(frame);
  } else {
    await commandCharacteristic.writeValue(frame);
  }
}

async function writeCommand(message) {
  const bytes = encoder.encode(JSON.stringify(message));
  let offset = 0;
  await writeFrame(0x01, bytes.slice(offset, offset + 19));
  offset += 19;
  while (bytes.length - offset > 19) {
    await writeFrame(0x02, bytes.slice(offset, offset + 19));
    offset += 19;
  }
  await writeFrame(0x03, bytes.slice(offset));
}

async function readResponse() {
  const value = await responseCharacteristic.readValue();
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return JSON.parse(decoder.decode(bytes));
}

async function command(operation, payload = {}, timeout = 80000) {
  if (!commandCharacteristic || !responseCharacteristic) throw new Error("Bluetooth is not connected");
  const id = ++requestId;
  await writeCommand({ id, op: operation, ...payload });
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await delay(450);
    const response = await readResponse();
    if (Number(response.id) !== id) continue;
    if (response.state === "working") continue;
    if (!response.ok) throw new Error(response.error || "The radio rejected the request");
    return response;
  }
  throw new Error("The radio took too long to respond");
}

function renderStatus(status) {
  elements.radioName.textContent = status.device || device?.name || "Your radio";
  elements.wifiStatus.textContent = status.wifi ? (status.connection || "Connected") : "Not connected";
  elements.ipAddress.textContent = status.ip || "No address";
  elements.stationName.textContent = status.station || "Nothing selected";
}

async function refreshStatus() {
  setBusy(elements.refreshButton, true, "…");
  try {
    renderStatus(await command("status"));
    showMessage("Status refreshed.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.refreshButton, false);
  }
}

function renderNetworks(networks) {
  elements.networkSelect.replaceChildren();
  if (!networks.length) {
    elements.networkSelect.add(new Option("No networks found — enter one manually", ""));
    return;
  }
  for (const network of networks) {
    const security = network.x || "Open";
    elements.networkSelect.add(new Option(`${network.s} · ${network.q}% · ${security}`, network.s));
  }
}

async function scanNetworks() {
  setBusy(elements.scanButton, true, "Scanning…");
  showMessage("Scanning nearby Wi-Fi from the radio…", "working");
  try {
    const response = await command("scan", {}, 35000);
    renderNetworks(response.networks || []);
    showMessage(`Found ${(response.networks || []).length} nearby network(s).`, "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.scanButton, false);
  }
}

async function saveWifi(event) {
  event.preventDefault();
  const ssid = elements.manualSsid.value || elements.networkSelect.value;
  const password = elements.wifiPassword.value;
  if (!ssid) {
    showMessage("Choose a network or enter its name manually.", "error");
    return;
  }
  if (password && (password.length < 8 || password.length > 63)) {
    showMessage("The password must be blank for an open network, or 8 to 63 characters.", "error");
    return;
  }

  setBusy(elements.saveButton, true, "Saving and connecting…");
  showMessage(`Sending details for ${ssid} directly to the radio…`, "working");
  try {
    const response = await command("configure", { ssid, password }, 90000);
    renderStatus(response);
    elements.wifiPassword.value = "";
    showMessage(`Connected successfully to ${response.connection || ssid}.`, "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.saveButton, false);
  }
}

function renderStations() {
  elements.stationFields.replaceChildren();
  stationDrafts.forEach((station, index) => {
    const card = document.createElement("fieldset");
    card.className = `fixed-station-card${station.id ? "" : " empty"}`;

    const legend = document.createElement("legend");
    legend.textContent = `Dial position ${index + 1}`;

    const pinStrip = document.createElement("div");
    pinStrip.className = "pin-strip";
    const gpioBadge = document.createElement("span");
    gpioBadge.textContent = `BCM GPIO ${station.gpio}`;
    const physicalBadge = document.createElement("span");
    physicalBadge.textContent = `Physical pin ${station.pin}`;
    pinStrip.append(gpioBadge, physicalBadge);

    const fields = document.createElement("div");
    fields.className = "station-field-grid";

    const idWrap = document.createElement("div");
    const idLabel = document.createElement("label");
    idLabel.htmlFor = `station-id-${index}`;
    idLabel.textContent = "Character ID";
    const idInput = document.createElement("input");
    idInput.id = `station-id-${index}`;
    idInput.dataset.field = "id";
    idInput.dataset.index = String(index);
    idInput.value = station.id;
    idInput.placeholder = "Empty position";
    idInput.autocomplete = "off";
    idInput.spellcheck = false;
    idWrap.append(idLabel, idInput);

    const streamWrap = document.createElement("div");
    const streamLabel = document.createElement("label");
    streamLabel.htmlFor = `station-stream-${index}`;
    streamLabel.textContent = "Stream URL";
    const streamInput = document.createElement("input");
    streamInput.id = `station-stream-${index}`;
    streamInput.dataset.field = "stream";
    streamInput.dataset.index = String(index);
    streamInput.type = "url";
    streamInput.maxLength = 300;
    streamInput.value = station.stream;
    streamInput.placeholder = station.id ? "https://…" : "Leave empty until this position is used";
    streamInput.autocomplete = "off";
    streamWrap.append(streamLabel, streamInput);

    fields.append(idWrap, streamWrap);
    card.append(legend, pinStrip, fields);
    elements.stationFields.append(card);
  });
}

function setAdvancedProgress(completed, total, text) {
  const percentage = Math.round((completed / total) * 100);
  elements.advancedProgress.value = percentage;
  elements.advancedProgress.textContent = `${percentage}%`;
  elements.advancedProgressPercent.textContent = `${percentage}%`;
  elements.advancedProgressText.textContent = text;
}

async function loadAdvancedSettings() {
  const totalItems = DEFAULT_STATIONS.length + 1;
  elements.advancedLoading.hidden = false;
  setAdvancedProgress(0, totalItems, "Reading device identity…");
  const hardwareResponse = await command("get_hardware");
  setAdvancedProgress(1, totalItems, "Device identity loaded. Reading dial position 1 of 10…");
  const drafts = [];
  for (let index = 0; index < DEFAULT_STATIONS.length; index += 1) {
    try {
      const slotResponse = await command("get_slot", { index });
      drafts.push(slotResponse.slot);
    } catch (error) {
      if (!/too large|one response/i.test(error.message)) throw error;
      setAdvancedProgress(index + 1, totalItems, `Dial position ${index + 1} is large; loading it in two parts…`);
      const identityResponse = await command("get_slot", { index, part: "identity" });
      const streamResponse = await command("get_slot", { index, part: "stream" });
      drafts.push({ ...identityResponse.slot, stream: streamResponse.stream });
    }
    const completed = index + 2;
    const nextText = index + 1 < DEFAULT_STATIONS.length
      ? `Dial position ${index + 1} loaded. Reading position ${index + 2} of 10…`
      : "All radio settings loaded.";
    setAdvancedProgress(completed, totalItems, nextText);
  }
  stationDrafts = drafts;
  elements.accessCode.value = hardwareResponse.code || "";
  renderStations();
  advancedLoaded = true;
  setTimeout(() => {
    if (advancedLoaded) elements.advancedLoading.hidden = true;
  }, 600);
}

async function openAdvancedSettings() {
  elements.advancedSettings.hidden = false;
  elements.advancedSettings.scrollIntoView({ behavior: "smooth", block: "start" });
  if (advancedLoaded) return;
  setBusy(elements.advancedButton, true, "Loading…");
  try {
    await loadAdvancedSettings();
    showMessage("The fixed dial layout is ready to edit.", "success");
  } catch (error) {
    elements.advancedLoading.hidden = true;
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.advancedButton, false);
  }
}

function collectStations() {
  return stationDrafts.map((station, index) => {
    const id = elements.stationFields.querySelector(`[data-field="id"][data-index="${index}"]`).value.trim();
    const stream = elements.stationFields.querySelector(`[data-field="stream"][data-index="${index}"]`).value.trim();
    return { gpio: station.gpio, pin: station.pin, id, stream: id ? stream : "" };
  });
}

function validateStations(stations) {
  const usedIds = new Set();
  for (const station of stations) {
    if (!station.id) continue;
    const folded = station.id.toLocaleLowerCase();
    if (usedIds.has(folded)) return `Character ID “${station.id}” is duplicated.`;
    usedIds.add(folded);
    try {
      const url = new URL(station.stream);
      if (!["http:", "https:"].includes(url.protocol) || station.stream.length > 300) throw new Error();
    } catch (_) {
      return `${station.id} needs a valid HTTP or HTTPS stream URL.`;
    }
  }
  return "";
}

async function updateStationSlots(stations, button, progressText, successText) {
  const validationError = validateStations(stations);
  if (validationError) {
    showMessage(validationError, "error");
    return;
  }
  setBusy(button, true, progressText);
  showMessage("Validating the station IDs and restarting the dial and playback services…", "working");
  try {
    await command("update_slots", { stations }, 50000);
    stationDrafts = stations.map(station => ({ ...station }));
    renderStations();
    showMessage(successText, "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function saveStations(event) {
  event.preventDefault();
  await updateStationSlots(collectStations(), elements.saveStationsButton, "Saving…", "Station IDs and streams saved. The current dial position was read again.");
}

async function resetStreams() {
  if (!confirm("Restore the original stream links for the first five dial positions? Custom links on the other positions are preserved.")) return;
  const stations = collectStations();
  stations.forEach((station, index) => {
    if (index < 5) station.stream = station.id ? DEFAULT_STATIONS[index].stream : "";
  });
  await updateStationSlots(stations, elements.resetStreamsButton, "Resetting…", "Preset stream links restored. Character IDs were not changed.");
}

async function resetIds() {
  if (!confirm("Restore SFM, OFM, RSG, ALGUA, and LEK on the first five positions and clear the other five IDs?")) return;
  setBusy(elements.resetIdsButton, true, "Resetting…");
  showMessage("Restoring the preset character IDs…", "working");
  try {
    await command("reset_ids", {}, 50000);
    await loadAdvancedSettings();
    showMessage("Character ID presets restored. The first five stream links were preserved.", "success");
  } catch (error) {
    elements.advancedLoading.hidden = true;
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.resetIdsButton, false);
  }
}

async function saveAccessCode(event) {
  event.preventDefault();
  const code = elements.accessCode.value.trim().toLowerCase();
  if (!/^[a-z0-9]{1,256}$/.test(code)) {
    showMessage("The device character code must contain at least one lowercase letter or number.", "error");
    return;
  }
  setBusy(elements.saveAccessButton, true, "Saving…");
  showMessage("Saving the device character code…", "working");
  try {
    const response = await command("update_access_code", { code }, 35000);
    showMessage(`Saved. Reloading now; choose ${response.bluetooth_name} again to reconnect.`, "success");
    setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.saveAccessButton, false);
  }
}

async function factoryReset() {
  if (!confirm("Factory-reset all character IDs, stream links, and the device character code? Saved Wi-Fi networks will NOT be erased.")) return;
  if (!confirm("Restore every original RadioLink value now?")) return;
  setBusy(elements.factoryResetButton, true, "Factory resetting…");
  showMessage("Restoring all original radio settings…", "working");
  try {
    const previousCode = elements.accessCode.value.trim().toLowerCase();
    await command("factory_reset", {}, 50000);
    stationDrafts = DEFAULT_STATIONS.map(station => ({ ...station }));
    elements.accessCode.value = DEFAULT_ACCESS_CODE;
    renderStations();
    if (previousCode !== DEFAULT_ACCESS_CODE) {
      expectedDisconnectMessage = `Factory reset complete. Bluetooth is restarting; reconnect to Radio-${DEFAULT_ACCESS_CODE}.`;
      showMessage(`Factory reset complete. Bluetooth will restart as Radio-${DEFAULT_ACCESS_CODE}; saved Wi-Fi was preserved.`, "success");
    } else {
      showMessage("Factory reset complete. All radio defaults restored; saved Wi-Fi was preserved.", "success");
    }
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.factoryResetButton, false);
  }
}

elements.connectButton.addEventListener("click", connectRadio);
elements.refreshButton.addEventListener("click", refreshStatus);
elements.scanButton.addEventListener("click", scanNetworks);
elements.wifiForm.addEventListener("submit", saveWifi);
elements.advancedButton.addEventListener("click", openAdvancedSettings);
elements.closeAdvancedButton.addEventListener("click", () => { elements.advancedSettings.hidden = true; });
elements.stationsForm.addEventListener("submit", saveStations);
elements.resetStreamsButton.addEventListener("click", resetStreams);
elements.resetIdsButton.addEventListener("click", resetIds);
elements.accessForm.addEventListener("submit", saveAccessCode);
elements.factoryResetButton.addEventListener("click", factoryReset);
elements.debugButton.addEventListener("click", () => showDiagnostics());

if (!("bluetooth" in navigator)) {
  elements.browserWarning.hidden = false;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
