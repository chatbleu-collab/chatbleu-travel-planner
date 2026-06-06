// =========================================================
// AI 여행 일정 플래너 - 앱 로직 (프레임워크 없이 순수 JS)
// =========================================================

// ---- 앱 상태 ----
const state = {
  start: "",
  destination: "",
  duration: "",
  transport: "car",
  itinerary: [],   // { id, day, time, activity, location, type, note }
  editingId: null, // 수정 중인 일정 id (추가 모드면 null)
  addingDay: null  // 추가 중인 날짜 (수정 모드면 null)
};

// ---- 자주 쓰는 요소 ----
const $ = (id) => document.getElementById(id);
const resultEl = $("result");

// ---- 유형별 아이콘/색상 ----
const TYPE_META = {
  "이동": { icon: "🚗", cls: "t-move" },
  "식사": { icon: "🍴", cls: "t-food" },
  "관광": { icon: "📷", cls: "t-view" },
  "휴식": { icon: "☕", cls: "t-rest" },
  "쇼핑": { icon: "🛍️", cls: "t-shop" },
  "숙박": { icon: "🛏️", cls: "t-stay" }
};
function typeMeta(t) {
  const m = TYPE_META[t] || { icon: "📍", cls: "t-spot" };
  // 대중교통이면 '이동'은 버스 아이콘으로 표시
  if (t === "이동" && state.transport === "public") return { icon: "🚌", cls: "t-move" };
  return m;
}

// 시간 문자열("HH:MM")을 분으로 변환 (정렬용)
function timeToMin(t) {
  const m = String(t).match(/(\d{1,2})\D+(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9999;
}

// 분 → "HH:MM" (0~23:59 범위로 보정)
function minToTime(total) {
  if (total < 0) total = 0;
  if (total > 24 * 60 - 1) total = 24 * 60 - 1;
  const h = Math.floor(total / 60), m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

// 소요시간 메모("체류 1시간 30분", "20분", "약 2시간")에서 분 추출. 없으면 null
function parseDurationMin(note) {
  if (!note) return null;
  let total = 0, found = false;
  const h = String(note).match(/(\d+)\s*시간/);
  if (h) { total += Number(h[1]) * 60; found = true; }
  const m = String(note).match(/(\d+)\s*분/);
  if (m) { total += Number(m[1]); found = true; }
  return found ? total : null;
}

// 기준 일정부터 같은 날짜의 '다음 일정들' 시작시간을 소요시간 기준으로 자동 재계산
// 다음 일정 시작 = 직전 일정 시작 + 직전 일정 소요시간(없으면 기본 60분)
const DEFAULT_DURATION_MIN = 60;
function cascadeTimes(fromStop) {
  const dayStops = state.itinerary.filter((x) => x.day === fromStop.day);
  const startIdx = dayStops.indexOf(fromStop);
  if (startIdx < 0) return;
  for (let k = startIdx; k < dayStops.length - 1; k++) {
    const dur = parseDurationMin(dayStops[k].note);
    const durMin = dur == null ? DEFAULT_DURATION_MIN : dur;
    dayStops[k + 1].time = minToTime(timeToMin(dayStops[k].time) + durMin);
  }
}

// =========================================================
// 1) 일정 생성 (지금은 예시 데이터. 실제 AI API 연동 시 buildItinerary 교체)
// =========================================================
function parseDays(text) {
  const nums = (text.match(/\d+/g) || []).map(Number);
  if (nums.length === 0) return 2;
  return Math.min(Math.max(...nums), 7); // 최대 7일
}

function buildItinerary(dest, start, days, transport) {
  const D = dest || "목적지";
  const S = start || "출발지";
  const car = transport !== "public";

  const first = car
    ? [
        { t: "08:00", a: "자가용으로 집에서 출발", l: S, y: "이동", n: "약 2시간" },
        { t: "10:00", a: "휴게소에서 간식 & 휴식", l: "중간 휴게소", y: "휴식", n: "20분" },
        { t: "12:00", a: "점심 — 현지 맛집", l: D + " 맛집 거리", y: "식사", n: "1시간" },
        { t: "14:30", a: "대표 관광지 방문 (주차장 확인)", l: D + " 대표 명소", y: "관광", n: "체류 1시간 30분" },
        { t: "18:00", a: "숙소 체크인 & 저녁", l: D + " 숙소", y: "숙박", n: "자유시간" }
      ]
    : [
        { t: "08:30", a: "역/터미널에서 기차·버스 탑승", l: S + " 역", y: "이동", n: "약 3시간" },
        { t: "11:30", a: "목적지 도착 — 짐 보관", l: D + " 역", y: "이동", n: "20분" },
        { t: "13:00", a: "점심 — 역 근처 맛집", l: D + " 역 맛집", y: "식사", n: "1시간" },
        { t: "15:00", a: "대표 관광지 방문 (도보·버스)", l: D + " 대표 명소", y: "관광", n: "체류 1시간 30분" },
        { t: "18:00", a: "숙소 체크인 & 저녁", l: D + " 숙소", y: "숙박", n: "자유시간" }
      ];

  const middle = car
    ? [
        { t: "09:00", a: "조식 후 차량으로 이동", l: D + " 숙소", y: "이동", n: "40분" },
        { t: "10:30", a: "자연/바다 드라이브 코스", l: D + " 해변도로", y: "관광", n: "체류 2시간" },
        { t: "12:30", a: "점심 식사", l: D + " 로컬 식당", y: "식사", n: "1시간" },
        { t: "14:30", a: "카페 & SNS 핫플", l: D + " 인기 카페", y: "휴식", n: "체류 1시간" },
        { t: "17:00", a: "기념품 쇼핑 (주차 가능)", l: D + " 전통시장", y: "쇼핑", n: "체류 1시간" }
      ]
    : [
        { t: "09:00", a: "조식 후 도보 산책", l: D + " 숙소", y: "이동", n: "30분" },
        { t: "10:30", a: "시내버스로 명소 이동", l: D + " 해변 산책로", y: "관광", n: "체류 2시간" },
        { t: "12:30", a: "점심 식사", l: D + " 로컬 식당", y: "식사", n: "1시간" },
        { t: "14:30", a: "카페 & SNS 핫플", l: D + " 인기 카페", y: "휴식", n: "체류 1시간" },
        { t: "17:00", a: "기념품 쇼핑", l: D + " 전통시장", y: "쇼핑", n: "체류 1시간" }
      ];

  const last = car
    ? [
        { t: "09:30", a: "느긋한 아침", l: D + " 숙소", y: "휴식", n: "1시간" },
        { t: "11:00", a: "전망대 & 포토존", l: D + " 전망대", y: "관광", n: "체류 1시간" },
        { t: "13:00", a: "마지막 식사", l: D + " 맛집", y: "식사", n: "1시간" },
        { t: "15:00", a: "자가용으로 집에 출발", l: S, y: "이동", n: "약 2시간" }
      ]
    : [
        { t: "09:30", a: "느긋한 아침", l: D + " 숙소", y: "휴식", n: "1시간" },
        { t: "11:00", a: "전망대 & 포토존", l: D + " 전망대", y: "관광", n: "체류 1시간" },
        { t: "12:30", a: "마지막 식사 (역 근처)", l: D + " 역 맛집", y: "식사", n: "1시간" },
        { t: "15:00", a: "기차·버스로 귀가", l: D + " 역", y: "이동", n: "약 3시간" }
      ];

  const arr = [];
  let id = 1;
  for (let d = 1; d <= days; d++) {
    const tpl = d === 1 ? first : d === days ? last : middle;
    tpl.forEach((s) => {
      arr.push({ id: id++, day: d, time: s.t, activity: s.a, location: s.l, type: s.y, note: s.n });
    });
  }
  return arr;
}

function nextId() {
  return state.itinerary.reduce((mx, x) => Math.max(mx, x.id), 0) + 1;
}

function generateItinerary() {
  state.start = $("start").value.trim();
  state.destination = $("destination").value.trim();
  state.duration = $("duration").value.trim();
  state.transport = $("transport").value;

  if (!state.destination) {
    alert("목적지를 입력해 주세요.");
    $("destination").focus();
    return;
  }

  const btn = $("generateBtn");
  btn.disabled = true;
  btn.textContent = "일정 생성 중...";
  resultEl.innerHTML = '<div class="loading"><div class="spinner"></div>맞춤형 일정을 만들고 있어요...</div>';

  setTimeout(() => {
    const days = parseDays(state.duration);
    state.itinerary = buildItinerary(state.destination, state.start, days, state.transport);
    btn.disabled = false;
    btn.textContent = "맞춤형 일정 생성하기";
    saveState();
    renderItinerary();
    resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 900);
}

// =========================================================
// 2) 결과 렌더링 (날짜별 타임라인)
// =========================================================
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderItinerary() {
  if (state.itinerary.length === 0) {
    resultEl.innerHTML = "";
    return;
  }
  const transportLabel = state.transport === "public" ? "🚌 대중교통" : "🚗 차량 이동";

  // 날짜별 그룹화
  const byDay = {};
  state.itinerary.forEach((it) => (byDay[it.day] = byDay[it.day] || []).push(it));
  const dayKeys = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const maxDay = dayKeys[dayKeys.length - 1];
  const showDayMove = dayKeys.length > 1; // 2일 이상일 때만 날짜 이동 버튼 표시

  let html =
    '<div class="result-head">' +
      '<h2 class="result-title">📅 생성된 여행 일정 <small>(' + esc(transportLabel) + ')</small></h2>' +
      '<button class="reset-btn" data-clear="1">초기화</button>' +
    '</div>';

  dayKeys.forEach((day) => {
    // 배열에 담긴 순서 그대로 표시 (수동 위/아래 이동 결과가 유지되도록 시간순 강제정렬 안 함)
    const stops = byDay[day];
    const colorClass = "day-" + (((day - 1) % 5) + 1);

    html += '<section class="day-sec ' + colorClass + '">';
    html += '<div class="day-head"><span class="day-badge">' + day + '일차</span>' +
            '<span class="day-meta">' + stops.length + '개 일정 · ' + esc(transportLabel) + '</span></div>';
    html += '<div class="timeline">';

    stops.forEach((it, i) => {
      const m = typeMeta(it.type);
      const upDis = i === 0 ? " disabled" : "";
      const downDis = i === stops.length - 1 ? " disabled" : "";
      // 전일/다음일 날짜 이동 버튼 (해당 날짜가 있을 때만)
      const prevBtn = day > 1
        ? '<button class="btn-day" data-dayid="' + it.id + '" data-target="' + (day - 1) + '" title="전날로 이동">📅 ' + (day - 1) + '일차로</button>'
        : '';
      const nextBtn = day < maxDay
        ? '<button class="btn-day" data-dayid="' + it.id + '" data-target="' + (day + 1) + '" title="다음날로 이동">📅 ' + (day + 1) + '일차로</button>'
        : '';
      html +=
        '<div class="tl-item ' + m.cls + '">' +
          '<div class="tl-time">' + esc(it.time) + '</div>' +
          '<div class="tl-mid"><div class="tl-dot"></div></div>' +
          '<div class="tl-content">' +
            '<div class="tl-top">' +
              '<span class="tl-icon">' + m.icon + '</span>' +
              '<div class="tl-info">' +
                '<div class="tl-act">' + esc(it.activity) + '</div>' +
                '<div class="tl-loc">📍 ' + esc(it.location) + '</div>' +
                (it.note ? '<div class="tl-note">⏱ ' + esc(it.note) + '</div>' : '') +
              '</div>' +
              '<span class="tl-type">' + esc(it.type) + '</span>' +
            '</div>' +
            '<div class="tl-btns">' +
              '<button class="btn-naver" data-map="naver" data-id="' + it.id + '">네이버지도</button>' +
              '<button class="btn-kakao" data-map="kakao" data-id="' + it.id + '">카카오맵</button>' +
            '</div>' +
            '<div class="tl-tools">' +
              '<button class="btn-move" data-move="up" data-id="' + it.id + '"' + upDis + ' title="위로">▲</button>' +
              '<button class="btn-move" data-move="down" data-id="' + it.id + '"' + downDis + ' title="아래로">▼</button>' +
              '<button class="btn-edit" data-edit="' + it.id + '" title="수정">✏️ 수정</button>' +
              (showDayMove ? prevBtn + nextBtn : '') +
              '<button class="btn-del" data-del="' + it.id + '" title="삭제">🗑️ 삭제</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div>'; // .timeline
    html += '<button class="add-stop" data-add="' + day + '">＋ ' + day + '일차에 장소 추가</button>';
    html += '</section>';
  });

  // 하단 요약 박스
  const totalStops = state.itinerary.length;
  const route = (state.start || "출발지") + " → " + (state.destination || "목적지");
  html +=
    '<div class="summary">' +
      '<div class="s-item"><span class="s-ico">🗓️</span><div><div class="s-label">여행 일정</div>' +
        '<div class="s-val">' + esc(route) + '</div></div></div>' +
      '<div class="s-item"><span class="s-ico">📋</span><div><div class="s-label">총 일정 수</div>' +
        '<div class="s-val">' + totalStops + '개 (' + dayKeys.length + '일)</div></div></div>' +
      '<div class="s-item"><span class="s-ico">🚗</span><div><div class="s-label">이동 수단</div>' +
        '<div class="s-val">' + esc(transportLabel) + '</div></div></div>' +
      '<div class="s-item"><span class="s-ico">🛏️</span><div><div class="s-label">숙박 장소</div>' +
        '<div class="s-val">' + esc(state.destination || "목적지") + ' 숙소</div></div></div>' +
    '</div>';

  html += '<p class="tip">💡 <b>TIP</b> 교통 상황에 따라 시간이 변동될 수 있으니 여유 있게 출발하세요!<br>' +
          '일정 카드의 ✏️ 로 수정, 🗑️ 로 삭제, 맨 아래 버튼으로 장소를 추가할 수 있어요.</p>';

  resultEl.innerHTML = html;
}

// =========================================================
// 3) 지도 연결 (네이버/카카오 앱 우선 → 없으면 웹 검색으로 폴백)
//    ※ 새 탭/window.open 사용 금지: 같은 화면에서 location.href 로만 이동
// =========================================================
function openMap(app, place) {
  const q = encodeURIComponent(place);
  const deep = app === "naver"
    ? "nmap://search?query=" + q + "&appname=travel.planner"
    : "kakaomap://search?q=" + q;
  const web = app === "naver"
    ? "https://map.naver.com/p/search/" + q
    : "https://map.kakao.com/?q=" + q;

  let switched = false;
  const onHide = () => { switched = true; };
  document.addEventListener("visibilitychange", onHide, { once: true });
  window.addEventListener("blur", onHide, { once: true });

  setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("blur", onHide);
    if (!switched && !document.hidden) {
      window.location.href = web; // 앱이 안 열렸으면 웹 지도로 이동
    }
  }, 1200);

  try {
    window.location.href = deep;
  } catch (e) {
    window.location.href = web;
  }
}

// =========================================================
// 4) 일정 추가 / 수정 / 삭제
// =========================================================
function openModal(mode, id, day) {
  if (mode === "edit") {
    const it = state.itinerary.find((x) => x.id === id);
    if (!it) return;
    state.editingId = id;
    state.addingDay = null;
    $("modalTitle").textContent = "일정 수정";
    $("editTime").value = it.time;
    $("editLocation").value = it.location;
    $("editActivity").value = it.activity;
    $("editType").value = TYPE_META[it.type] ? it.type : "관광";
    $("editNote").value = it.note || "";
  } else {
    state.editingId = null;
    state.addingDay = day;
    $("modalTitle").textContent = day + "일차 — 장소 추가";
    $("editTime").value = "";
    $("editLocation").value = "";
    $("editActivity").value = "";
    $("editType").value = "관광";
    $("editNote").value = "";
  }
  $("modal").hidden = false;
  $("editLocation").focus();
}

function closeModal() {
  state.editingId = null;
  state.addingDay = null;
  $("modal").hidden = true;
}

function saveModal() {
  const loc = $("editLocation").value.trim();
  if (!loc) { alert("장소 이름을 입력해 주세요."); return; }
  const time = $("editTime").value.trim() || "00:00";
  const activity = $("editActivity").value.trim() || "새 일정";
  const type = $("editType").value;
  const note = $("editNote").value.trim();

  if (state.editingId != null) {
    // 수정
    const it = state.itinerary.find((x) => x.id === state.editingId);
    if (it) {
      const timeOrNoteChanged = it.time !== time || it.note !== note;
      it.time = time; it.location = loc; it.activity = activity; it.type = type; it.note = note;
      // 시간 또는 소요시간이 바뀌면 같은 날 다음 일정들의 시간을 자동 조정
      if (timeOrNoteChanged) cascadeTimes(it);
    }
  } else {
    // 추가 — 같은 날짜 안에서 시간 순서에 맞게 삽입
    addStopSorted({ id: nextId(), day: state.addingDay, time, activity, location: loc, type, note });
  }
  closeModal();
  saveState();
  renderItinerary();
}

// 새 일정을 같은 날짜 안에서 시간 순서에 맞는 위치에 삽입
function addStopSorted(stop) {
  const arr = state.itinerary;
  let lastSameDay = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].day === stop.day) {
      lastSameDay = i;
      if (timeToMin(arr[i].time) > timeToMin(stop.time)) { arr.splice(i, 0, stop); return; }
    }
  }
  if (lastSameDay >= 0) arr.splice(lastSameDay + 1, 0, stop);
  else arr.push(stop);
}

// 일정 위/아래로 이동 (같은 날짜 안에서만 자리 교환)
// 시간(time)은 자리(슬롯)에 고정하고 내용만 교환 → 목록이 항상 시간순(예: 10시·12시) 유지
function moveStop(id, dir) {
  const arr = state.itinerary;
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= arr.length) return;
  if (arr[j].day !== arr[i].day) return; // 다른 날짜로는 넘어가지 않음
  const ti = arr[i].time, tj = arr[j].time;
  const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  arr[i].time = ti; arr[j].time = tj; // 시간은 원래 자리에 그대로 둠
  saveState();
  renderItinerary();
}

// 일정을 지정한 날짜로 이동 (전일/다음일). 새 날짜의 시간 순서에 맞게 재삽입
function moveStopToDay(id, targetDay) {
  const arr = state.itinerary;
  const idx = arr.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const maxDay = arr.reduce((m, x) => Math.max(m, x.day), 1);
  if (targetDay < 1 || targetDay > maxDay) return; // 범위 밖이면 무시
  const it = arr[idx];
  arr.splice(idx, 1);
  it.day = targetDay;
  addStopSorted(it);
  saveState();
  renderItinerary();
}

function deleteStop(id) {
  const it = state.itinerary.find((x) => x.id === id);
  if (!it) return;
  if (!confirm('"' + it.location + '" 일정을 삭제할까요?')) return;
  state.itinerary = state.itinerary.filter((x) => x.id !== id);
  saveState();
  renderItinerary();
}

// =========================================================
// 5) 이벤트 연결
// =========================================================
$("generateBtn").addEventListener("click", generateItinerary);

resultEl.addEventListener("click", (e) => {
  const mapBtn = e.target.closest("[data-map]");
  if (mapBtn) {
    const it = state.itinerary.find((x) => x.id === Number(mapBtn.dataset.id));
    if (it) openMap(mapBtn.dataset.map, it.location);
    return;
  }
  const editBtn = e.target.closest("[data-edit]");
  if (editBtn) { openModal("edit", Number(editBtn.dataset.edit)); return; }

  const moveBtn = e.target.closest("[data-move]");
  if (moveBtn) { moveStop(Number(moveBtn.dataset.id), moveBtn.dataset.move); return; }

  const dayBtn = e.target.closest("[data-dayid]");
  if (dayBtn) { moveStopToDay(Number(dayBtn.dataset.dayid), Number(dayBtn.dataset.target)); return; }

  const delBtn = e.target.closest("[data-del]");
  if (delBtn) { deleteStop(Number(delBtn.dataset.del)); return; }

  const addBtn = e.target.closest("[data-add]");
  if (addBtn) { openModal("add", null, Number(addBtn.dataset.add)); return; }

  const clearBtn = e.target.closest("[data-clear]");
  if (clearBtn) { clearState(); }
});

$("modalSave").addEventListener("click", saveModal);
$("modalCancel").addEventListener("click", closeModal);
$("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal(); // 바깥 영역 클릭 시 닫기
});

// =========================================================
// 6) 로컬 저장 (localStorage) — 앱을 닫아도 일정·입력값 유지
// =========================================================
const STORAGE_KEY = "travel-planner-state-v1";

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      start: state.start, destination: state.destination,
      duration: state.duration, transport: state.transport, itinerary: state.itinerary
    }));
  } catch (e) { console.log("저장 실패:", e); }
}

function restoreState() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return; }
  if (!data) return;
  state.start = data.start || "";
  state.destination = data.destination || "";
  state.duration = data.duration || "";
  state.transport = data.transport || "car";
  state.itinerary = Array.isArray(data.itinerary) ? data.itinerary : [];

  $("start").value = state.start;
  $("destination").value = state.destination;
  $("duration").value = state.duration;
  $("transport").value = state.transport;

  if (state.itinerary.length > 0) renderItinerary();
}

function clearState() {
  if (!confirm("저장된 일정을 모두 지울까요?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state.itinerary = [];
  renderItinerary();
}

restoreState();

// =========================================================
// 7) PWA: 서비스워커 등록 + 홈 화면 추가
// =========================================================
// 서비스워커는 http/https 에서만 동작합니다. file:// 로 직접 열면 등록을 건너뜁니다.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.log("SW 등록 실패:", e));
  });
}

let deferredPrompt = null;
const installBtn = $("installBtn");
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS 포함
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// 이미 홈화면에서 실행 중이면 설치 버튼 숨김
if (installBtn && isStandalone) installBtn.hidden = true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();   // 기본 배너 보류 → 우리 버튼으로 직접 처리
  deferredPrompt = e;
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    // 1) 설치 프롬프트 지원(안드로이드 크롬 / 데스크톱 크롬·엣지): 바로 설치
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice && choice.outcome === "accepted") installBtn.hidden = true;
      return;
    }
    // 2) 아이폰/아이패드 사파리: 프로그램 설치 불가 → 수동 안내
    if (isIOS) {
      alert("📱 아이폰 홈 화면에 추가하기\n\n1) 사파리 아래쪽 '공유' 버튼(□에 ↑ 모양)을 누르세요\n2) 메뉴를 내려 '홈 화면에 추가'를 누르세요\n3) 오른쪽 위 '추가'를 누르면 완료!");
      return;
    }
    // 3) 그 외 브라우저 안내
    alert("📱 홈 화면에 추가하기\n\n브라우저 메뉴(⋮ 또는 공유)에서\n'홈 화면에 추가' 또는 '앱 설치'를 선택하세요.\n(데스크톱은 주소창 오른쪽의 설치 아이콘)");
  });
}

window.addEventListener("appinstalled", () => {
  if (installBtn) installBtn.hidden = true;
});

// 새 탭 방지 보강: 혹시 모를 <a> 태그는 모두 같은 화면(_self)에서 열림
document.querySelectorAll("a").forEach((a) => a.setAttribute("target", "_self"));
