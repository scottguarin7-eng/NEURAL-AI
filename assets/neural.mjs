import { NeuralMotion } from "./motion.mjs";

const $ = (id) => document.getElementById(id);
const motion = new NeuralMotion();
const input = $("promptInput");
const sendButton = $("sendBtn");
const messageList = $("messagesList");
const featuresGrid = $("featuresGrid");
const searchInput = $("moduleSearchInput");
const typedText = $("typedText");
const defaultPlaceholder = input.placeholder;
const state = { messages: [], wordCount: 0, lastAssistant: null, controller: null, activeFeature: null };
let toastTimer;
let composerFrame;
let searchFrame;
let featureCatalog;
let openDialog = null;
let retryPrompt = "";
let listening = false;

/* TYPEWRITER HERO ENGINE */
const wordsToType = [
  "HYPER-LIQUID REFRACTION ENGINE",
  "PROCEDURAL LIGHTNING CORE v9.0",
  "100 AUTONOMOUS NEURAL MODULES",
  "SOVEREIGN SPATIAL GLASS DESIGN",
  "ZERO-LATENCY QUANTUM INTELLIGENCE",
];
let wordIndex = 0;
let characterIndex = 0;
let deleting = false;
let typingTimer;

function typeNext() {
  typingTimer = undefined;
  if (!motion.heroActive) return;
  const word = wordsToType[wordIndex];
  characterIndex += deleting ? -1 : 1;
  typedText.textContent = word.slice(0, characterIndex);
  let delay = deleting ? 22 : 52;
  if (!deleting && characterIndex === word.length) { deleting = true; delay = 2300; }
  else if (deleting && characterIndex === 0) { deleting = false; wordIndex = (wordIndex + 1) % wordsToType.length; delay = 280; }
  typingTimer = setTimeout(typeNext, delay);
}

function syncTypewriter() {
  clearTimeout(typingTimer);
  if (motion.reducedMotion) {
    typedText.textContent = wordsToType[0];
    characterIndex = 0;
    wordIndex = 0;
    deleting = false;
  } else if (motion.heroActive) typingTimer = setTimeout(typeNext, 350);
}
motion.addEventListener("statechange", syncTypewriter);
syncTypewriter();

/* MODAL DRAWERS */
function showDrawer(id) {
  const dialog = $(id);
  if (openDialog === dialog) return;
  if (openDialog) finishClosing(openDialog);
  openDialog = dialog;
  dialog.classList.remove("is-closing");
  dialog.showModal();
  document.documentElement.classList.add("dialog-open");
  motion.setDialogOpen(true);
}

function finishClosing(dialog) {
  clearTimeout(dialog.closeTimer);
  dialog.classList.remove("is-closing");
  if (dialog.open) dialog.close();
  if (openDialog === dialog) openDialog = null;
  document.documentElement.classList.toggle("dialog-open", Boolean(openDialog));
  motion.setDialogOpen(Boolean(openDialog));
}

function closeDrawer(dialog = openDialog) {
  if (!dialog || dialog.classList.contains("is-closing")) return;
  if (motion.reducedMotion) { finishClosing(dialog); return; }
  dialog.classList.add("is-closing");
  const panel = dialog.querySelector(".drawer-panel");
  const complete = () => {
    panel.removeEventListener("transitionend", onEnd);
    finishClosing(dialog);
  };
  const onEnd = (event) => { if (event.target === panel && event.propertyName === "transform") complete(); };
  panel.addEventListener("transitionend", onEnd);
  dialog.closeTimer = setTimeout(complete, 360);
}

for (const dialog of document.querySelectorAll("dialog.drawer-backdrop")) {
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDrawer(dialog); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDrawer(dialog); });
  dialog.addEventListener("close", () => {
    if (openDialog === dialog) finishClosing(dialog);
    if (dialog.id === "featuresDrawer") featuresGrid.replaceChildren();
  });
}
$("openHubBtn").addEventListener("click", () => showDrawer("hubDrawer"));
$("settingsBtn").addEventListener("click", () => showDrawer("settingsDrawer"));
$("closeHubBtn").addEventListener("click", () => closeDrawer($("hubDrawer")));
$("closeFeaturesBtn").addEventListener("click", () => closeDrawer($("featuresDrawer")));
$("closeSettingsBtn").addEventListener("click", () => closeDrawer($("settingsDrawer")));

/* 100 FUNCTIONAL MODULES & SEARCH ENGINE */
async function loadFeatures() {
  const { featureTitles } = await import("./modules.mjs");
  featureCatalog ||= featureTitles.map((title, index) => ({ title, index, search: `${title.toLowerCase()} ${index + 1}` }));
  return featureCatalog;
}

function renderFeatures() {
  if (!featureCatalog || !$("featuresDrawer").open) return;
  const query = searchInput.value.trim().toLowerCase();
  const fragment = document.createDocumentFragment();
  let count = 0;
  for (const feature of featureCatalog) {
    if (query && !feature.search.includes(query)) continue;
    const button = document.createElement("button");
    button.className = "feature-chip";
    button.type = "button";
    button.dataset.index = String(feature.index);
    button.setAttribute("aria-pressed", String(state.activeFeature === feature.title));
    const number = document.createElement("span");
    number.className = "feature-num";
    number.textContent = `MODULE #${String(feature.index + 1).padStart(3, "0")}`;
    const title = document.createElement("span");
    title.className = "feature-title";
    title.textContent = feature.title;
    button.append(number, title);
    fragment.append(button);
    count++;
  }
  if (!count) {
    const empty = document.createElement("p");
    empty.className = "module-empty";
    empty.textContent = "No matching modules. Try a different name or module number.";
    fragment.append(empty);
  }
  featuresGrid.replaceChildren(fragment);
  featuresGrid.scrollTop = 0;
  $("moduleResults").textContent = `${count} of 100 modules`;
}

$("openFeaturesBtn").addEventListener("click", async () => {
  showDrawer("featuresDrawer");
  searchInput.focus({ preventScroll: true });
  featuresGrid.setAttribute("aria-busy", "true");
  try { await loadFeatures(); renderFeatures(); }
  catch { $("moduleResults").textContent = "Modules could not load. Close and reopen to retry."; }
  finally { featuresGrid.removeAttribute("aria-busy"); }
});
searchInput.addEventListener("input", () => {
  cancelAnimationFrame(searchFrame);
  searchFrame = requestAnimationFrame(renderFeatures);
});
featuresGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-index]");
  if (!button || !featureCatalog) return;
  const feature = featureCatalog[Number(button.dataset.index)];
  state.activeFeature = feature.title;
  $("selectedFeatureName").textContent = feature.title;
  $("activeFeatureBadge").hidden = false;
  const dialog = $("featuresDrawer");
  dialog.addEventListener("close", () => {
    input.focus({ preventScroll: true });
    motion.discharge(null, null, 5);
  }, { once: true });
  closeDrawer(dialog);
  input.placeholder = `[Active: ${feature.title}] Ask anything...`;
  showToast(`Module activated: ${feature.title}`);
});

/* CHAT STREAMING & UI CONTROLS */
function showToast(text) {
  const toast = $("toastPopup");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

const nativeFieldSizing = CSS.supports("field-sizing", "content");
function updateComposer() {
  $("charCount").textContent = String(input.value.length);
  if (!nativeFieldSizing) {
    cancelAnimationFrame(composerFrame);
    composerFrame = requestAnimationFrame(() => {
      input.style.height = "0px";
      input.style.height = `${Math.min(130, Math.max(44, input.scrollHeight))}px`;
    });
  }
}
new ResizeObserver(([entry]) => {
  const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
  document.documentElement.style.setProperty("--composer-height", `${Math.ceil(height)}px`);
}).observe(document.querySelector(".sticky-composer"));

function updateTelemetry() {
  const count = state.messages.length;
  $("msgCountBadge").textContent = `${count} messages`;
  $("mCount").textContent = String(count);
  $("mWords").textContent = String(state.wordCount);
  $("transcriptPanel").classList.toggle("visible", count > 0);
}

function appendMessage(text, role) {
  const wasNearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 80;
  const message = { text: String(text), role };
  state.messages.push(message);
  state.wordCount += message.text.match(/\S+/g)?.length || 0;
  if (role === "assistant") state.lastAssistant = message;
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const tag = document.createElement("div");
  tag.className = "message-tag";
  tag.textContent = role === "user" ? "Operator" : "Neural Ultra Core";
  const content = document.createElement("div");
  content.textContent = message.text;
  article.append(tag, content);
  messageList.append(article);
  updateTelemetry();
  if (wasNearBottom || role === "user") requestAnimationFrame(() => {
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: motion.reducedMotion ? "instant" : "smooth" });
  });
}

function updateLoading() {
  const loading = Boolean(state.controller);
  sendButton.textContent = loading ? "■" : "↑";
  sendButton.classList.toggle("stop", loading);
  sendButton.setAttribute("aria-label", loading ? "Stop response" : "Send message");
  sendButton.title = loading ? "Stop response" : "Execute command";
  $("chatStatus").textContent = loading ? "Neural Ultra is responding…" : "";
}

async function handleSend(value, retry = false) {
  const rawPrompt = String(value || "").trim();
  if (!rawPrompt || state.controller) return;
  if (rawPrompt.length > 12000) { showToast("Keep your command within 12,000 characters."); return; }
  const prompt = retry ? rawPrompt : state.activeFeature ? `[Module: ${state.activeFeature}] ${rawPrompt}` : rawPrompt;
  const controller = new AbortController();
  const start = performance.now();
  state.controller = controller;
  $("chatError").hidden = true;
  if (!retry) appendMessage(prompt, "user");
  input.value = "";
  updateComposer();
  updateLoading();
  motion.discharge(null, null, 5);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 125000);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt, mode: "fast" }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("The AI service is unavailable. Your command is kept here; please retry.");
    const data = await response.json();
    if (typeof data.text !== "string" || !data.text.trim()) throw new Error("The AI service returned no answer. Please retry.");
    if (state.controller !== controller || controller.signal.aborted) return;
    $("mLatency").textContent = `${Math.round(performance.now() - start)} ms`;
    appendMessage(data.text.trim(), "assistant");
    retryPrompt = "";
  } catch (error) {
    if (state.controller !== controller) return;
    if (error.name === "AbortError" && !timedOut) showToast("Response stopped.");
    else {
      retryPrompt = prompt;
      $("chatErrorText").textContent = timedOut ? "The AI service took too long. You can retry your command." : "The AI service could not respond. Your command is kept here; please retry.";
      $("chatError").hidden = false;
      $("mLatency").textContent = "Unavailable";
    }
  } finally {
    clearTimeout(timeout);
    if (state.controller === controller) { state.controller = null; updateLoading(); }
  }
}

$("retryChatBtn").addEventListener("click", () => handleSend(retryPrompt, true));
$("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.controller) state.controller.abort();
  else handleSend(input.value);
});
input.addEventListener("input", updateComposer);
input.addEventListener("keydown", (event) => {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Enter" && !event.shiftKey && $("enterToggle").checked) {
    event.preventDefault();
    $("chatForm").requestSubmit();
  }
});
$("clearInputBtn").addEventListener("click", () => {
  input.value = "";
  input.placeholder = defaultPlaceholder;
  state.activeFeature = null;
  $("activeFeatureBadge").hidden = true;
  updateComposer();
  showToast("Input and active module reset.");
});
$("clearChatBtn").addEventListener("click", () => {
  state.controller?.abort();
  state.controller = null;
  state.messages.length = 0;
  state.wordCount = 0;
  state.lastAssistant = null;
  retryPrompt = "";
  messageList.replaceChildren();
  $("chatError").hidden = true;
  $("mLatency").textContent = "—";
  updateLoading();
  updateTelemetry();
  closeDrawer($("hubDrawer"));
  showToast("Session memory purged.");
});
$("exportChatBtn").addEventListener("click", () => {
  if (!state.messages.length) { showToast("No transcript to export."); return; }
  const text = state.messages.map((message) => `${message.role.toUpperCase()}: ${message.text}`).join("\n\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "neural-ultra-quantum-log.txt";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Transcript exported.");
});
$("copyLastBtn").addEventListener("click", async () => {
  if (!state.lastAssistant) { showToast("No AI output to copy."); return; }
  try { await navigator.clipboard.writeText(state.lastAssistant.text); showToast("Response copied."); }
  catch { showToast("Clipboard access was blocked by your browser."); }
});
$("speakLastBtn").addEventListener("click", () => {
  if (!state.lastAssistant) { showToast("No response to synthesize."); return; }
  if (!("speechSynthesis" in window)) { showToast("Voice playback is not available in this browser."); return; }
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(state.lastAssistant.text));
  showToast("Reading the latest response.");
});
$("themeSelect").addEventListener("change", (event) => {
  document.documentElement.dataset.theme = event.target.value;
  document.querySelector('meta[name="theme-color"]').content = event.target.value === "light" ? "#eef3ff" : "#010207";
  showToast(`Theme switched to ${event.target.selectedOptions[0].textContent}.`);
});
$("lightningIntensity").addEventListener("change", () => motion.setIntensity());
$("orbStage").addEventListener("click", (event) => {
  motion.discharge(event.detail ? event.clientX : null, event.detail ? event.clientY : null, 7);
  showToast("Quantum plasma surge released.");
});
$("brandDischargeTrigger").addEventListener("click", () => { motion.discharge(null, null, 8); showToast("Sovereign core synchronized."); });

document.querySelector(".suggestions-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (!button) return;
  input.value = button.dataset.prompt;
  updateComposer();
  input.focus({ preventScroll: true });
  if (event.detail) motion.burst(event.clientX, event.clientY, 12);
});
document.querySelector(".chips").addEventListener("click", (event) => {
  const button = event.target.closest("[data-insert]");
  if (!button) return;
  input.value = `${input.value.trim()} ${button.dataset.insert}`.trim().slice(0, 12000);
  updateComposer();
  input.focus({ preventScroll: true });
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceButton = $("voiceBtn");
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = false;
  recognition.onstart = () => { listening = true; voiceButton.setAttribute("aria-pressed", "true"); showToast("Listening…"); };
  recognition.onend = () => { listening = false; voiceButton.setAttribute("aria-pressed", "false"); };
  recognition.onresult = (event) => {
    const transcript = event.results[0]?.[0]?.transcript;
    if (transcript) { input.value = `${input.value.trim()} ${transcript}`.trim().slice(0, 12000); updateComposer(); }
  };
  recognition.onerror = () => showToast("Voice input is unavailable or microphone access was declined.");
  voiceButton.addEventListener("click", () => {
    try { if (listening) recognition.stop(); else recognition.start(); }
    catch { showToast("Voice input is not ready. Please try again."); }
  });
  window.addEventListener("pagehide", () => recognition.abort());
} else {
  voiceButton.disabled = true;
  voiceButton.title = "Voice input is not supported in this browser";
}
window.addEventListener("pagehide", () => { state.controller?.abort(); window.speechSynthesis?.cancel(); });
updateComposer();
document.documentElement.dataset.ready = "true";
