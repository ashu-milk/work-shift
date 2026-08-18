/*
 * app.js
 * 美容師向けシフトカレンダー作成アプリのロジック。
 * ビルド不要・素のJSのみで動作する。
 */

const STORAGE_LAST_KEY = "shiftCalendarApp:lastState";
const STORAGE_PRESETS_KEY = "shiftCalendarApp:presets";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const defaultState = () => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    salonName: "Solakira",
    stylistName: "やぎゅう",
    closedWeekdays: [1], // 0=日 ... 6=土。デフォルトは月曜定休
    holidayDaysText: "",
    templateId: CALENDAR_TEMPLATES[0].id,
  };
};

let state = defaultState();

/* ---------------- 初期化 ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  buildYearOptions();
  buildMonthOptions();
  buildWeekdayCheckboxes();
  buildTemplateGrid();
  loadLastState();
  bindFormEvents();
  render();
  renderPresetList();
});

function buildYearOptions() {
  const sel = document.getElementById("yearSelect");
  const current = new Date().getFullYear();
  for (let y = current - 1; y <= current + 3; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = `${y}年`;
    sel.appendChild(opt);
  }
}

function buildMonthOptions() {
  const sel = document.getElementById("monthSelect");
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = `${m}月`;
    sel.appendChild(opt);
  }
}

function buildWeekdayCheckboxes() {
  const wrap = document.getElementById("weekdayGrid");
  wrap.innerHTML = "";
  WEEKDAY_LABELS.forEach((label, idx) => {
    const wrapLabel = document.createElement("label");
    wrapLabel.dataset.idx = idx;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = idx;
    const span = document.createElement("span");
    span.textContent = label;
    wrapLabel.appendChild(input);
    wrapLabel.appendChild(span);
    wrap.appendChild(wrapLabel);

    input.addEventListener("change", () => {
      const checked = new Set(state.closedWeekdays);
      if (input.checked) checked.add(idx);
      else checked.delete(idx);
      state.closedWeekdays = Array.from(checked).sort();
      wrapLabel.classList.toggle("checked", input.checked);
      onStateChanged();
    });
  });
}

function buildTemplateGrid() {
  const grid = document.getElementById("templateGrid");
  grid.innerHTML = "";
  CALENDAR_TEMPLATES.forEach((tpl) => {
    const el = document.createElement("div");
    el.className = "template-swatch";
    el.dataset.id = tpl.id;
    el.innerHTML = `<div class="icon">${tpl.thumb}</div><span class="name">${tpl.label}<br>${tpl.subLabel}</span>`;
    el.addEventListener("click", () => {
      state.templateId = tpl.id;
      highlightSelectedTemplate();
      onStateChanged();
    });
    grid.appendChild(el);
  });
}

function highlightSelectedTemplate() {
  document.querySelectorAll(".template-swatch").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === state.templateId);
  });
}

function bindFormEvents() {
  document.getElementById("yearSelect").addEventListener("change", (e) => {
    state.year = parseInt(e.target.value, 10);
    onStateChanged();
  });
  document.getElementById("monthSelect").addEventListener("change", (e) => {
    state.month = parseInt(e.target.value, 10);
    onStateChanged();
  });
  document.getElementById("salonNameInput").addEventListener("input", (e) => {
    state.salonName = e.target.value;
    onStateChanged();
  });
  document.getElementById("stylistNameInput").addEventListener("input", (e) => {
    state.stylistName = e.target.value;
    onStateChanged();
  });
  document.getElementById("holidayInput").addEventListener("input", (e) => {
    state.holidayDaysText = e.target.value;
    onStateChanged();
  });

  document.getElementById("downloadBtn").addEventListener("click", downloadPng);
  document.getElementById("savePresetBtn").addEventListener("click", saveAsPreset);
}

function onStateChanged() {
  saveLastState();
  render();
}

/* ---------------- 状態 → フォームへ反映 ---------------- */
function applyStateToForm() {
  document.getElementById("yearSelect").value = state.year;
  document.getElementById("monthSelect").value = state.month;
  document.getElementById("salonNameInput").value = state.salonName;
  document.getElementById("stylistNameInput").value = state.stylistName;
  document.getElementById("holidayInput").value = state.holidayDaysText;

  document.querySelectorAll("#weekdayGrid label").forEach((label) => {
    const idx = parseInt(label.dataset.idx, 10);
    const checked = state.closedWeekdays.includes(idx);
    label.classList.toggle("checked", checked);
    label.querySelector("input").checked = checked;
  });

  highlightSelectedTemplate();
}

/* ---------------- カレンダー描画 ---------------- */
function parseHolidayDays(text) {
  return Array.from(
    new Set(
      text
        .split(/[,、\s]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
    )
  );
}

function buildWeeks(year, month) {
  // month: 1-12 の JS 標準
  const firstDay = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0=日

  const days = [];
  for (let i = 0; i < startWeekday; i++) days.push(0);
  for (let d = 1; d <= lastDate; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(0);

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

function getTemplate(id) {
  return CALENDAR_TEMPLATES.find((t) => t.id === id) || CALENDAR_TEMPLATES[0];
}

function render() {
  applyStateToForm();

  const tpl = getTemplate(state.templateId);
  const calendarEl = document.getElementById("calendar");

  // CSS variables 適用
  Object.entries(tpl.vars).forEach(([k, v]) => {
    calendarEl.style.setProperty(k, v);
  });

  const holidayDays = parseHolidayDays(state.holidayDaysText);
  const weeks = buildWeeks(state.year, state.month);

  const rowsHtml = weeks
    .map((week) => {
      const cells = week
        .map((day, colIdx) => {
          if (day === 0) return `<td class="empty"></td>`;

          const classes = [];
          let tagHtml = "";

          if (state.closedWeekdays.includes(colIdx)) {
            classes.push("teiky");
            tagHtml = `<span class="tag teiky-tag">定休日</span>`;
          } else if (holidayDays.includes(day)) {
            classes.push("koukyu");
            tagHtml = `<span class="tag koukyu-tag">公休</span>`;
          }

          if (colIdx === 0) classes.push("sun");
          if (colIdx === 6) classes.push("sat");

          const clsAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
          return `<td${clsAttr}><div class="daynum">${day}</div>${tagHtml}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const decorHtml = tpl.decor
    .map((d) => {
      const pos = ["top", "left", "right", "bottom"]
        .filter((k) => d[k] !== undefined)
        .map((k) => `${k}:${d[k]}`)
        .join(";");
      return `<div class="decor" style="${pos};font-size:${d.size}px;opacity:${d.opacity};">${d.emoji}</div>`;
    })
    .join("");

  calendarEl.innerHTML = `
    ${decorHtml}
    <div class="wrap">
      <div class="header">
        <div class="salon-name">${escapeHtml(state.salonName || "Salon Name")}</div>
        <div class="stylist">${escapeHtml(state.stylistName || "")}</div>
      </div>
      <div class="month-badge">
        <div class="month-year">${state.year}</div>
        <div class="month-num">${state.month}</div>
        <div class="month-jp">Shift Calendar</div>
      </div>
      <table class="cal">
        <tr>
          <th class="sun">日</th><th>月</th><th>火</th><th>水</th><th>木</th><th>金</th><th class="sat">土</th>
        </tr>
        ${rowsHtml}
      </table>
      <div class="legend">
        <div class="legend-item"><span class="dot teiky"></span>定休日</div>
        <div class="legend-item"><span class="dot koukyu"></span>公休日</div>
      </div>
      <div class="footer-note">${escapeHtml(tpl.footerNote || "")}</div>
    </div>
  `;

  fitPreviewStage();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function fitPreviewStage() {
  const stage = document.getElementById("previewStage");
  const calendarEl = document.getElementById("calendar");
  const scale = stage.clientWidth / 1080;
  calendarEl.style.transform = `scale(${scale})`;
}
window.addEventListener("resize", fitPreviewStage);

/* ---------------- PNG ダウンロード ---------------- */
function downloadPng() {
  const calendarEl = document.getElementById("calendar");
  const statusEl = document.getElementById("downloadStatus");
  statusEl.textContent = "画像を作成中…";

  // 一時的に等倍表示に戻してからキャプチャする(スケール変換をキャンセル)
  const originalTransform = calendarEl.style.transform;
  calendarEl.style.transform = "none";

  html2canvas(calendarEl, {
    width: 1080,
    height: 1080,
    scale: 2,
    backgroundColor: null,
    useCORS: true,
  })
    .then((canvas) => {
      calendarEl.style.transform = originalTransform;
      const link = document.createElement("a");
      const fname = `shift_${state.year}${String(state.month).padStart(2, "0")}.png`;
      link.download = fname;
      link.href = canvas.toDataURL("image/png");
      link.click();
      statusEl.textContent = "ダウンロードしました✔";
      setTimeout(() => (statusEl.textContent = ""), 2500);
    })
    .catch((err) => {
      calendarEl.style.transform = originalTransform;
      statusEl.textContent = "画像の作成に失敗しました";
      console.error(err);
    });
}

/* ---------------- 保存・読み込み ---------------- */
function saveLastState() {
  try {
    localStorage.setItem(STORAGE_LAST_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("localStorage への保存に失敗しました", e);
  }
}

function loadLastState() {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_KEY);
    if (raw) {
      state = Object.assign(defaultState(), JSON.parse(raw));
    }
  } catch (e) {
    console.warn("前回の内容を読み込めませんでした", e);
  }
}

function getPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setPresets(presets) {
  localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(presets));
}

function saveAsPreset() {
  const name = prompt("プリセット名を入力してください(例: 2026年9月分)");
  if (!name) return;
  const presets = getPresets();
  presets.push({ name, state: { ...state }, savedAt: Date.now() });
  setPresets(presets);
  renderPresetList();
}

function renderPresetList() {
  const listEl = document.getElementById("presetList");
  const presets = getPresets();
  listEl.innerHTML = "";

  if (presets.length === 0) {
    listEl.innerHTML = `<div class="preset-empty">保存されたプリセットはまだありません</div>`;
    return;
  }

  presets.forEach((preset, idx) => {
    const item = document.createElement("div");
    item.className = "preset-item";
    item.innerHTML = `
      <span class="preset-load" data-idx="${idx}" style="cursor:pointer;">${escapeHtml(preset.name)}</span>
      <button data-idx="${idx}" class="preset-delete">削除</button>
    `;
    listEl.appendChild(item);
  });

  listEl.querySelectorAll(".preset-load").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx, 10);
      const presets = getPresets();
      if (presets[idx]) {
        state = Object.assign(defaultState(), presets[idx].state);
        onStateChanged();
      }
    });
  });

  listEl.querySelectorAll(".preset-delete").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx, 10);
      const presets = getPresets();
      presets.splice(idx, 1);
      setPresets(presets);
      renderPresetList();
    });
  });
}
