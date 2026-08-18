/*
 * app.js
 * 美容師向けシフトカレンダー作成アプリのロジック。
 * ビルド不要・素のJSのみで動作する。
 */

const STORAGE_LAST_KEY = "shiftCalendarApp:lastState";
const STORAGE_PRESETS_KEY = "shiftCalendarApp:presets";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// Service Workerを登録する（Android/デスクトップのChromeで
// 「アプリをインストール」できるようにするためのPWA対応）。
// file:// で直接開いた場合や、sw.js を同梱していないプレビュー環境
// （1つのHTMLファイルだけを共有している場合など）では登録できないため、
// 事前に sw.js の存在を確認してから静かにスキップする。
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    fetch("sw.js", { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          navigator.serviceWorker.register("sw.js").catch(() => {
            /* インストール機能が使えないだけで、アプリ自体の動作には影響しない */
          });
        }
      })
      .catch(() => {
        /* sw.js に到達できない環境（プレビューなど）では何もしない */
      });
  });
}

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
    footerNoteText: "", // 空欄ならテンプレートの初期メッセージ(footerNote)を使う
  };
};

let state = defaultState();

/* ---------------- 初期化 ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  buildYearOptions();
  buildMonthOptions();
  buildWeekdayCheckboxes();
  loadLastState(); // テンプレートのグループ初期表示を復元内容に合わせるため先に読み込む
  buildTemplateGrid();
  bindFormEvents();
  setupTabs();
  render();
  renderPresetList();
});

/* ---------------- フッタータブ切り替え ---------------- */
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${pageId}`);
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageId);
  });

  const activeSection = document.getElementById(`page-${pageId}`);
  const subtitleEl = document.getElementById("pageSubtitle");
  if (activeSection && subtitleEl) {
    subtitleEl.textContent = activeSection.dataset.title || "";
  }

  // プレビューが必要なページに切り替わったら #calendar をそのページの
  // preview-stage へ移動させる（実体は1つだけなので使い回す）
  const calendarEl = document.getElementById("calendar");
  let targetStage = null;
  if (pageId === "template") targetStage = document.getElementById("previewStageTemplate");
  if (pageId === "sns") targetStage = document.getElementById("previewStageSns");

  if (targetStage && calendarEl && calendarEl.parentElement !== targetStage) {
    targetStage.appendChild(calendarEl);
  }

  if (targetStage) {
    // レイアウト確定後にスケールを再計算する
    requestAnimationFrame(fitPreviewStage);
  }
}

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
  const container = document.getElementById("templateGrid");
  container.innerHTML = "";

  const selectedTpl = getTemplate(state.templateId);

  CALENDAR_TEMPLATE_GROUPS.forEach((group) => {
    const tplsInGroup = CALENDAR_TEMPLATES.filter((t) => group.seasons.includes(t.season));
    if (tplsInGroup.length === 0) return;

    const details = document.createElement("details");
    details.className = "template-group";
    details.dataset.season = group.key;
    if (group.seasons.includes(selectedTpl.season)) details.open = true;

    const summary = document.createElement("summary");
    summary.className = "template-group-header";
    summary.innerHTML = `
      <span class="tg-icon">${group.icon}</span>
      <span class="tg-label">${group.label}</span>
      <span class="tg-count">${tplsInGroup.length}種</span>
      <span class="tg-chevron">▾</span>
    `;
    details.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "template-grid";
    tplsInGroup.forEach((tpl) => {
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
    details.appendChild(grid);

    container.appendChild(details);
  });

  highlightSelectedTemplate();
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
  document.getElementById("footerNoteInput").addEventListener("input", (e) => {
    state.footerNoteText = e.target.value;
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
  document.getElementById("footerNoteInput").value = state.footerNoteText || "";

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

// 星座テンプレート用：星と線で構成される星座線画(SVG)を組み立てる
// メインの星座の星がしっかり輝いて見えるよう、多重の光暈(グロー)と
// 明るい星への十字のきらめき(フレア)を重ねている。
function buildConstellationHtml(c) {
  if (!c || !c.stars || !c.stars.length) return "";

  const stars = c.stars;
  const starLines = c.lines || [];
  const BRIGHT_THRESHOLD = 3;

  // 外側から: 大きく淡いグロー → 中間グロー → 明るい星には十字のきらめき → 星本体
  const outerGlowHtml = stars
    .map((s) => {
      const r = s.r || 2.2;
      return `<circle cx="${s.x}" cy="${s.y}" r="${(r * 4.4).toFixed(2)}" fill="#EAF6FF" opacity="0.16" />`;
    })
    .join("");

  const midGlowHtml = stars
    .map((s) => {
      const r = s.r || 2.2;
      return `<circle cx="${s.x}" cy="${s.y}" r="${(r * 2.4).toFixed(2)}" fill="#FFFFFF" opacity="0.28" />`;
    })
    .join("");

  const lineHtml = starLines
    .map(([a, b]) => {
      const p1 = stars[a];
      const p2 = stars[b];
      if (!p1 || !p2) return "";
      return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#FFFFFF" stroke-width="0.9" stroke-linecap="round" opacity="0.75" />`;
    })
    .join("");

  const flareHtml = stars
    .filter((s) => (s.r || 2.2) >= BRIGHT_THRESHOLD)
    .map((s) => {
      const len = (s.r || 2.2) * 3.2;
      return `<g opacity="0.9">
        <line x1="${(s.x - len).toFixed(2)}" y1="${s.y}" x2="${(s.x + len).toFixed(2)}" y2="${s.y}" stroke="#FFFFFF" stroke-width="0.5" stroke-linecap="round" opacity="0.5" />
        <line x1="${s.x}" y1="${(s.y - len).toFixed(2)}" x2="${s.x}" y2="${(s.y + len).toFixed(2)}" stroke="#FFFFFF" stroke-width="0.5" stroke-linecap="round" opacity="0.5" />
        <line x1="${(s.x - len * 0.4).toFixed(2)}" y1="${s.y}" x2="${(s.x + len * 0.4).toFixed(2)}" y2="${s.y}" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round" />
        <line x1="${s.x}" y1="${(s.y - len * 0.4).toFixed(2)}" x2="${s.x}" y2="${(s.y + len * 0.4).toFixed(2)}" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round" />
      </g>`;
    })
    .join("");

  const starHtml = stars
    .map(
      (s) =>
        `<circle cx="${s.x}" cy="${s.y}" r="${s.r || 2.2}" fill="#FFFFFF" opacity="0.97" />`
    )
    .join("");

  const pos = ["top", "left", "right", "bottom"]
    .filter((k) => c[k] !== undefined)
    .map((k) => `${k}:${c[k]}`)
    .join(";");

  return `<div class="constellation" style="${pos};width:${c.width}px;height:${c.height}px;">
    <svg viewBox="0 0 100 80" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      ${outerGlowHtml}${midGlowHtml}${lineHtml}${flareHtml}${starHtml}
    </svg>
  </div>`;
}

// 文字列から決定的な整数シードを作る(同じテンプレートなら常に同じ星屑配置になるように)
function hashStringToInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

// シード付きの簡易疑似乱数生成器(Lehmer RNG)
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function next() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// 星座テンプレートの空全体に散らす、小さな星屑(スターダスト)のレイヤーを組み立てる
function buildStardustHtml(seedKey, count) {
  const rand = seededRandom(hashStringToInt(seedKey));
  const items = [];

  for (let i = 0; i < count; i++) {
    const x = rand() * 100;
    const y = rand() * 100;
    // viewBoxは0-100だがキャンバス全体(1080px)に広がるため、
    // 星座本体の星よりずっと小さい半径にして「細かい星屑」に見せる
    const r = 0.09 + rand() * 0.22;
    const opacity = 0.3 + rand() * 0.55;

    if (rand() < 0.14) {
      // まれに、きらっと光る少し大きめの星屑(小さな十字のきらめき付き)
      const len = r * 2.2;
      items.push(`<g opacity="${(opacity + 0.15).toFixed(2)}">
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(r * 2).toFixed(2)}" fill="#EAF6FF" opacity="0.16" />
        <line x1="${(x - len).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x + len).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#FFFFFF" stroke-width="0.06" opacity="0.6" />
        <line x1="${x.toFixed(2)}" y1="${(y - len).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(y + len).toFixed(2)}" stroke="#FFFFFF" stroke-width="0.06" opacity="0.6" />
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="#FFFFFF" />
      </g>`);
    } else {
      items.push(
        `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="#FFFFFF" opacity="${opacity.toFixed(2)}" />`
      );
    }
  }

  return `<svg class="stardust" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${items.join("")}</svg>`;
}

function render() {
  applyStateToForm();

  const tpl = getTemplate(state.templateId);
  const calendarEl = document.getElementById("calendar");

  // 基本情報ページの「テンプレート下部の一言」欄は、空欄なら
  // テンプレートごとの初期メッセージをプレースホルダーとして表示する
  const footerNoteInput = document.getElementById("footerNoteInput");
  if (footerNoteInput) {
    footerNoteInput.placeholder = tpl.footerNote || "";
  }
  const effectiveFooterNote =
    state.footerNoteText && state.footerNoteText.trim()
      ? state.footerNoteText
      : tpl.footerNote || "";

  // CSS variables 適用
  Object.entries(tpl.vars).forEach(([k, v]) => {
    calendarEl.style.setProperty(k, v);
  });

  const holidayDays = parseHolidayDays(state.holidayDaysText);
  const weeks = buildWeeks(state.year, state.month);

  // 6週になる月は内容がはみ出すため、コンパクト表示に切り替える
  calendarEl.classList.toggle("compact", weeks.length >= 6);

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
      // イラスト画像を使う装飾(d.img)と、絵文字を使う装飾(d.emoji)の両方に対応
      if (d.img) {
        return `<img class="decor decor-img" src="${d.img}" style="${pos};width:${d.size}px;opacity:${d.opacity};" alt="" />`;
      }
      const colorStyle = d.color ? `color:${d.color};` : "";
      return `<div class="decor" style="${pos};font-size:${d.size}px;opacity:${d.opacity};${colorStyle}">${d.emoji}</div>`;
    })
    .join("");

  const constellationHtml = buildConstellationHtml(tpl.constellation);
  const stardustHtml = tpl.constellation ? buildStardustHtml(tpl.id, 90) : "";

  calendarEl.innerHTML = `
    ${stardustHtml}
    ${decorHtml}
    ${constellationHtml}
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
      <div class="footer-note">${escapeHtml(effectiveFooterNote)}</div>
    </div>
  `;

  fitFooterNote(calendarEl);
  fitPreviewStage();
}

// 「テンプレート下部の一言」は基本情報ページで自由に編集できるため、
// 長い文章を入れてもカレンダー枠(1080x1080)からはみ出さないよう、
// 必要な場合だけ少しずつ文字サイズを縮めて収める
function fitFooterNote(calendarEl) {
  const footer = calendarEl.querySelector(".footer-note");
  if (!footer) return;

  const baseSize = calendarEl.classList.contains("compact") ? 30 : 34;
  let size = baseSize;
  footer.style.fontSize = `${size}px`;

  const calBottom = calendarEl.getBoundingClientRect().bottom;
  let guard = 0;
  while (
    footer.getBoundingClientRect().bottom > calBottom - 4 &&
    size > 16 &&
    guard < 12
  ) {
    size -= 2;
    footer.style.fontSize = `${size}px`;
    guard++;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function fitPreviewStage() {
  const calendarEl = document.getElementById("calendar");
  const stage = calendarEl ? calendarEl.parentElement : null;
  if (!stage || !stage.clientWidth) return;
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
