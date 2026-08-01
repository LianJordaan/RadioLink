"use strict";

const SERVICE_UUID = "42f00001-9b5f-4f6e-9f19-6f4b7c9a4e10";
const COMMAND_UUID = "42f00002-9b5f-4f6e-9f19-6f4b7c9a4e10";
const RESPONSE_UUID = "42f00003-9b5f-4f6e-9f19-6f4b7c9a4e10";
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
  debugButton: document.querySelector("#debug-button"),
  message: document.querySelector("#message"),
};

let device = null;
let commandCharacteristic = null;
let responseCharacteristic = null;
let setupToken = "";
let requestId = 0;

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
      showMessage("Bluetooth disconnected. Choose the radio again to continue.", "warning");
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    commandCharacteristic = await service.getCharacteristic(COMMAND_UUID);
    responseCharacteristic = await service.getCharacteristic(RESPONSE_UUID);
    elements.deviceName.textContent = device.name || "RadioLink radio";
    setConnected(true);
    elements.radioCode.focus();
    showMessage("Radio found. Enter its eight-character code to unlock setup.", "working");
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

elements.connectButton.addEventListener("click", connectRadio);
elements.unlockButton.addEventListener("click", unlockRadio);
elements.radioCode.addEventListener("keydown", event => {
  if (event.key === "Enter") unlockRadio();
});
elements.refreshButton.addEventListener("click", refreshStatus);
elements.scanButton.addEventListener("click", scanNetworks);
elements.wifiForm.addEventListener("submit", saveWifi);
elements.debugButton.addEventListener("click", () => showDiagnostics());

if (!("bluetooth" in navigator)) {
  elements.browserWarning.hidden = false;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
