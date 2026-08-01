"use strict";

const SERVICE_UUID = "42f00001-9b5f-4f6e-9f19-6f4b7c9a4e10";
const COMMAND_UUID = "42f00002-9b5f-4f6e-9f19-6f4b7c9a4e10";
const RESPONSE_UUID = "42f00003-9b5f-4f6e-9f19-6f4b7c9a4e10";
const DEFAULT_STATIONS = [
  { id: "SFM", gpio: 17, stream: "https://iceant.eclipse-streaming.co.za/SFM" },
  { id: "OFM", gpio: 27, stream: "https://edge.iono.fm/xice/ofm_live_medium.mp3" },
  { id: "RSG", gpio: 22, stream: "https://27913.live.streamtheworld.com/RSGAAC_SC" },
  { id: "ALGUA", gpio: 5, stream: "https://edge.iono.fm/xice/54_medium.aac" },
  { id: "LEK", gpio: 6, stream: "https://zas3.ndx.co.za:8002/stream" },
];
const MAX_STATIONS = 12;
const DEFAULT_ACCESS_CODE = "ewrd5qyw";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const elements = {
  browserWarning: document.querySelector("#browser-warning"),
  connectButton: document.querySelector("#connect-button"),
  connectionChip: document.querySelector("#connection-chip"),
  deviceName: document.querySelector("#device-name"),
  unlockArea: document.querySelector("#unlock-area"),
  radioCode: document.querySelector("#radio-code"),
  unlockButton: document.querySelector("#unlock-button"),
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
  streamsForm: document.querySelector("#streams-form"),
  streamFields: document.querySelector("#stream-fields"),
  resetStreamsButton: document.querySelector("#reset-streams-button"),
  saveStreamsButton: document.querySelector("#save-streams-button"),
  superAdvancedButton: document.querySelector("#super-advanced-button"),
  superAdvancedSettings: document.querySelector("#super-advanced-settings"),
  hardwareForm: document.querySelector("#hardware-form"),
  accessCode: document.querySelector("#access-code"),
  gpioFields: document.querySelector("#gpio-fields"),
  addStationButton: document.querySelector("#add-station-button"),
  resetGpioButton: document.querySelector("#reset-gpio-button"),
  factoryResetButton: document.querySelector("#factory-reset-button"),
  saveHardwareButton: document.querySelector("#save-hardware-button"),
  debugButton: document.querySelector("#debug-button"),
  message: document.querySelector("#message"),
};

let device = null;
let commandCharacteristic = null;
let responseCharacteristic = null;
let setupToken = "";
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
  elements.unlockArea.hidden = !connected;
  if (!connected) {
    elements.dashboard.hidden = true;
    commandCharacteristic = null;
    responseCharacteristic = null;
    setupToken = "";
    advancedLoaded = false;
    elements.advancedSettings.hidden = true;
    elements.superAdvancedSettings.hidden = true;
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
    const codeMatch = (device.name || "").match(/^Radio-([a-z0-9]{8})$/i);
    if (codeMatch) elements.radioCode.value = codeMatch[1].toLowerCase();
    setConnected(true);
    if (codeMatch) {
      elements.unlockButton.focus();
      showMessage(`Radio found. Code ${codeMatch[1].toLowerCase()} was filled from its Bluetooth name; tap Unlock.`, "working");
    } else {
      elements.radioCode.focus();
      showMessage("Radio found. Enter its eight-character code to unlock setup.", "working");
    }
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
  await writeCommand({ id, op: operation, token: setupToken, ...payload });
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

async function unlockRadio() {
  const code = elements.radioCode.value.trim().toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(code)) {
    showMessage("Enter the radio’s eight-character lowercase code.", "error");
    return;
  }
  setupToken = code;
  setBusy(elements.unlockButton, true, "Unlocking…");
  showMessage("Reading radio status over Bluetooth…", "working");
  try {
    const status = await command("status");
    renderStatus(status);
    elements.dashboard.hidden = false;
    showMessage("Radio unlocked. You can configure it without disconnecting Bluetooth.", "success");
    await scanNetworks();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.unlockButton, false);
  }
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

function renderStreams() {
  elements.streamFields.replaceChildren();
  stationDrafts.forEach((station, index) => {
    const label = document.createElement("label");
    label.htmlFor = `stream-${index}`;
    label.textContent = `${station.id} stream URL`;
    const input = document.createElement("input");
    input.id = `stream-${index}`;
    input.type = "url";
    input.required = true;
    input.maxLength = 350;
    input.value = station.stream;
    input.dataset.station = station.id;
    input.dataset.index = String(index);
    input.autocomplete = "off";
    elements.streamFields.append(label, input);
  });
}

function renderHardware() {
  elements.gpioFields.replaceChildren();
  stationDrafts.forEach((station, index) => {
    const card = document.createElement("fieldset");
    card.className = "station-card";

    const legend = document.createElement("legend");
    legend.textContent = `Dial position ${index + 1}`;

    const idLabel = document.createElement("label");
    idLabel.htmlFor = `station-id-${index}`;
    idLabel.textContent = "Station ID";
    const idInput = document.createElement("input");
    idInput.id = `station-id-${index}`;
    idInput.dataset.field = "id";
    idInput.dataset.index = String(index);
    idInput.value = station.id;
    idInput.maxLength = 16;
    idInput.pattern = "[A-Za-z0-9_-]{1,16}";
    idInput.required = true;
    idInput.autocapitalize = "characters";
    idInput.spellcheck = false;

    const pinLabel = document.createElement("label");
    pinLabel.htmlFor = `station-gpio-${index}`;
    pinLabel.textContent = "BCM GPIO pin";
    const pinInput = document.createElement("input");
    pinInput.id = `station-gpio-${index}`;
    pinInput.dataset.field = "gpio";
    pinInput.dataset.index = String(index);
    pinInput.type = "number";
    pinInput.min = "2";
    pinInput.max = "27";
    pinInput.required = true;
    pinInput.value = station.gpio;

    const streamLabel = document.createElement("label");
    streamLabel.htmlFor = `station-stream-${index}`;
    streamLabel.textContent = "Stream URL";
    const streamInput = document.createElement("input");
    streamInput.id = `station-stream-${index}`;
    streamInput.dataset.field = "stream";
    streamInput.dataset.index = String(index);
    streamInput.type = "url";
    streamInput.maxLength = 350;
    streamInput.required = true;
    streamInput.value = station.stream;
    streamInput.autocomplete = "off";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-station-button";
    removeButton.textContent = "Remove station";
    removeButton.disabled = stationDrafts.length === 1;
    removeButton.addEventListener("click", () => removeStation(index));

    card.append(legend, idLabel, idInput, pinLabel, pinInput, streamLabel, streamInput, removeButton);
    elements.gpioFields.append(card);
  });
  elements.addStationButton.disabled = stationDrafts.length >= MAX_STATIONS;
}

async function loadAdvancedSettings() {
  const hardwareResponse = await command("get_hardware");
  const drafts = [];
  for (const [id, gpio] of Object.entries(hardwareResponse.gpio)) {
    const streamResponse = await command("get_stream", { station: id });
    drafts.push({ id, gpio, stream: streamResponse.stream });
  }
  stationDrafts = drafts;
  elements.accessCode.value = hardwareResponse.code || "";
  renderStreams();
  renderHardware();
  advancedLoaded = true;
}

async function openAdvancedSettings() {
  elements.advancedSettings.hidden = false;
  elements.advancedSettings.scrollIntoView({ behavior: "smooth", block: "start" });
  if (advancedLoaded) return;
  setBusy(elements.advancedButton, true, "Loading…");
  showMessage("Loading the radio’s current station list over Bluetooth…", "working");
  try {
    await loadAdvancedSettings();
    showMessage(`Loaded ${stationDrafts.length} station(s).`, "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.advancedButton, false);
  }
}

function collectStreams() {
  const streams = {};
  for (const input of elements.streamFields.querySelectorAll("input[data-station]")) {
    streams[input.dataset.station] = input.value.trim();
  }
  return streams;
}

async function updateStreams(streams, button, progressText) {
  setBusy(button, true, progressText);
  showMessage("Saving stream links and restarting radio playback…", "working");
  try {
    await command("update_streams", { streams }, 35000);
    stationDrafts = stationDrafts.map(station => ({ ...station, stream: streams[station.id] }));
    renderStreams();
    renderHardware();
    showMessage("Stream links saved. Radio playback restarted with the selected station.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function saveStreams(event) {
  event.preventDefault();
  await updateStreams(collectStreams(), elements.saveStreamsButton, "Saving…");
}

async function resetStreams() {
  if (!confirm("Reset the original dial positions to their default stream links? Custom extra stations keep their current links.")) return;
  const currentStreams = collectStreams();
  const streams = {};
  stationDrafts.forEach((station, index) => {
    streams[station.id] = DEFAULT_STATIONS[index]?.stream || currentStreams[station.id] || station.stream;
  });
  await updateStreams(streams, elements.resetStreamsButton, "Resetting…");
}

function syncStreamsFromAdvancedForm() {
  for (const input of elements.streamFields.querySelectorAll("input[data-index]")) {
    const index = Number.parseInt(input.dataset.index, 10);
    if (stationDrafts[index]) stationDrafts[index].stream = input.value.trim();
  }
}

function collectStationLayout() {
  return stationDrafts.map((station, index) => ({
    id: elements.gpioFields.querySelector(`[data-field="id"][data-index="${index}"]`).value.trim(),
    gpio: Number.parseInt(elements.gpioFields.querySelector(`[data-field="gpio"][data-index="${index}"]`).value, 10),
    stream: elements.gpioFields.querySelector(`[data-field="stream"][data-index="${index}"]`).value.trim(),
  }));
}

function syncDraftsFromHardwareForm() {
  if (elements.gpioFields.querySelector("[data-field=\"id\"]")) {
    stationDrafts = collectStationLayout();
  }
}

function validateStationLayout(stations) {
  if (!stations.length || stations.length > MAX_STATIONS) return "Configure between 1 and 12 stations.";
  const ids = stations.map(station => station.id.toLowerCase());
  if (stations.some(station => !/^[A-Za-z0-9_-]{1,16}$/.test(station.id))) {
    return "Each station ID must be 1–16 letters, numbers, hyphens, or underscores.";
  }
  if (new Set(ids).size !== ids.length) return "Every station ID must be unique, even when letter case differs.";
  const pins = stations.map(station => station.gpio);
  if (pins.some(pin => !Number.isInteger(pin) || pin < 2 || pin > 27) || new Set(pins).size !== pins.length) {
    return "Every station must use a unique BCM pin from 2 to 27.";
  }
  for (const station of stations) {
    try {
      const url = new URL(station.stream);
      if (!["http:", "https:"].includes(url.protocol) || station.stream.length > 350) throw new Error();
    } catch (_) {
      return `${station.id} needs a valid HTTP or HTTPS stream URL.`;
    }
  }
  return "";
}

function removeStation(index) {
  if (stationDrafts.length <= 1) return;
  syncDraftsFromHardwareForm();
  stationDrafts.splice(index, 1);
  renderStreams();
  renderHardware();
}

function addStation() {
  if (stationDrafts.length >= MAX_STATIONS) return;
  syncDraftsFromHardwareForm();
  const usedPins = new Set(stationDrafts.map(station => Number(station.gpio)));
  const gpio = Array.from({ length: 26 }, (_, index) => index + 2).find(pin => !usedPins.has(pin));
  let suffix = 1;
  const usedIds = new Set(stationDrafts.map(station => station.id.toLowerCase()));
  while (usedIds.has(`new${suffix}`)) suffix += 1;
  stationDrafts.push({ id: `NEW${suffix}`, gpio, stream: "" });
  renderStreams();
  renderHardware();
  elements.gpioFields.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function updateStations(code, stations, button, progressText) {
  const normalizedCode = code.trim().toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(normalizedCode)) {
    showMessage("The access code must be exactly eight lowercase letters or numbers.", "error");
    return;
  }
  const validationError = validateStationLayout(stations);
  if (validationError) {
    showMessage(validationError, "error");
    return;
  }

  setBusy(button, true, progressText);
  showMessage("Validating the station layout and safely restarting the radio services…", "working");
  try {
    const previousCode = setupToken;
    const response = await command("update_stations", { code: normalizedCode, stations }, 50000);
    stationDrafts = stations.map(station => ({ ...station }));
    elements.accessCode.value = response.code;
    renderStreams();
    renderHardware();
    if (response.code !== previousCode) {
      expectedDisconnectMessage = `Access code changed. Bluetooth is restarting; reconnect to ${response.bluetooth_name}. The new code will fill automatically.`;
      showMessage(`Saved. Bluetooth will restart as ${response.bluetooth_name} in a few seconds.`, "success");
    } else {
      showMessage(`${stations.length} station(s) saved. GPIO and playback restarted successfully.`, "success");
    }
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function saveHardware(event) {
  event.preventDefault();
  const stations = collectStationLayout();
  await updateStations(elements.accessCode.value, stations, elements.saveHardwareButton, "Saving…");
}

async function reloadAdvancedAfterReset() {
  advancedLoaded = false;
  await loadAdvancedSettings();
}

async function resetGpioLayout() {
  if (!confirm("Restore the original five station IDs and BCM pins? Stream links are kept by dial position, and the Bluetooth code is not changed.")) return;
  setBusy(elements.resetGpioButton, true, "Resetting…");
  showMessage("Restoring the original station IDs and GPIO layout…", "working");
  try {
    await command("reset_gpio", {}, 50000);
    await reloadAdvancedAfterReset();
    showMessage("GPIO layout reset. Stream links and Bluetooth code were preserved.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setBusy(elements.resetGpioButton, false);
  }
}

async function factoryReset() {
  if (!confirm("Factory-reset station IDs, BCM pins, stream links, and the Bluetooth/access code? Saved Wi-Fi networks will NOT be erased.")) return;
  if (!confirm("This restores every RadioLink setting to its original value. Continue?")) return;
  setBusy(elements.factoryResetButton, true, "Factory resetting…");
  showMessage("Restoring all original radio settings…", "working");
  try {
    const previousCode = setupToken;
    const response = await command("factory_reset", {}, 50000);
    stationDrafts = DEFAULT_STATIONS.map(station => ({ ...station }));
    elements.accessCode.value = DEFAULT_ACCESS_CODE;
    renderStreams();
    renderHardware();
    if (previousCode !== DEFAULT_ACCESS_CODE) {
      expectedDisconnectMessage = `Factory reset complete. Bluetooth is restarting; reconnect to Radio-${DEFAULT_ACCESS_CODE}.`;
      showMessage(`Factory reset complete. Bluetooth will restart as Radio-${DEFAULT_ACCESS_CODE}. Saved Wi-Fi was preserved.`, "success");
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
elements.unlockButton.addEventListener("click", unlockRadio);
elements.radioCode.addEventListener("keydown", event => {
  if (event.key === "Enter") unlockRadio();
});
elements.refreshButton.addEventListener("click", refreshStatus);
elements.scanButton.addEventListener("click", scanNetworks);
elements.wifiForm.addEventListener("submit", saveWifi);
elements.advancedButton.addEventListener("click", openAdvancedSettings);
elements.closeAdvancedButton.addEventListener("click", () => { elements.advancedSettings.hidden = true; });
elements.streamsForm.addEventListener("submit", saveStreams);
elements.resetStreamsButton.addEventListener("click", resetStreams);
elements.superAdvancedButton.addEventListener("click", () => {
  if (elements.superAdvancedSettings.hidden) syncStreamsFromAdvancedForm();
  elements.superAdvancedSettings.hidden = !elements.superAdvancedSettings.hidden;
  if (!elements.superAdvancedSettings.hidden) renderHardware();
  if (!elements.superAdvancedSettings.hidden) elements.superAdvancedSettings.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
elements.hardwareForm.addEventListener("submit", saveHardware);
elements.addStationButton.addEventListener("click", addStation);
elements.resetGpioButton.addEventListener("click", resetGpioLayout);
elements.factoryResetButton.addEventListener("click", factoryReset);
elements.debugButton.addEventListener("click", () => showDiagnostics());

if (!("bluetooth" in navigator)) {
  elements.browserWarning.hidden = false;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
