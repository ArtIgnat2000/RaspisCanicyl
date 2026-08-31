/* Общий слой данных и утилиты · v2.2.0 */

const DAYS = [
  { key: "mon", short: "Пн", full: "Понедельник" },
  { key: "tue", short: "Вт", full: "Вторник" },
  { key: "wed", short: "Ср", full: "Среда" },
  { key: "thu", short: "Чт", full: "Четверг" },
  { key: "fri", short: "Пт", full: "Пятница" },
  { key: "sat", short: "Сб", full: "Суббота", weekend: true },
  { key: "sun", short: "Вс", full: "Воскресенье", weekend: true }
];

const SCHOOL_SYSTEM_LABELS = {
  quarters: "По четвертям",
  trimesters: "По триместрам"
};

const MONTH_NAMES_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Не удалось загрузить ${path} (HTTP ${res.status})`);
  return res.json();
}

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function setParam(name, value) {
  const params = new URLSearchParams(location.search);
  if (value === null || value === undefined || value === "") params.delete(name);
  else params.set(name, value);
  const query = params.toString();
  history.replaceState(null, "", query ? "?" + query : location.pathname);
}

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function showError(container, message) {
  container.innerHTML = "";
  const card = el("div", "error-card");
  card.textContent = "⚠️ " + message +
    " — проверьте, что страница открыта через HTTP-сервер (не file://), и что файлы в каталоге data/ на месте.";
  container.appendChild(card);
}

function localISODate(date = new Date()) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function dateFromISO(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysBetween(fromDate, toDate) {
  return Math.round((dateFromISO(toDate) - dateFromISO(fromDate)) / 86400000);
}

function schoolDaysBetween(data, fromDate, toDate, systemKey) {
  if (fromDate >= toDate) return 0;

  const system = getSchoolSystem(data, systemKey);
  const cursor = dateFromISO(fromDate);
  const end = dateFromISO(toDate);
  let count = 0;

  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor < end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (getAcademicStatus(data, dateStr, system.key).type === "school") count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function formatDateRu(dateStr, withYear = true) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return day + " " + MONTH_NAMES_RU[month - 1] + (withYear ? " " + year : "");
}

function pluralRu(number, one, few, many) {
  const n = Math.abs(number) % 100;
  const last = n % 10;
  if (n >= 11 && n <= 19) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function currentDayKey(date = new Date()) {
  return DAYS[(date.getDay() + 6) % 7].key;
}

function readStored(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storeValue(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

function getSchoolSystemKey(data, requested) {
  const available = Object.keys(data.systems || {});
  if (!available.length) return requested || data.defaultSystem || "quarters";

  const fromUrl = requested || getParam("system");
  if (available.includes(fromUrl)) return fromUrl;

  const stored = readStored("schedule.system");
  if (available.includes(stored)) return stored;

  return available.includes(data.defaultSystem) ? data.defaultSystem : available[0];
}

function getSchoolSystem(data, key) {
  const config = (data.systems || {})[key] || {};
  return {
    ...data,
    ...config,
    key,
    label: config.name || SCHOOL_SYSTEM_LABELS[key] || key,
    vacations: config.vacations || data.vacations || [],
    publicHolidays: config.publicHolidays || data.publicHolidays || [],
    specialDays: config.specialDays || data.specialDays || []
  };
}

function vacationForDate(data, dateStr, systemKey) {
  const system = getSchoolSystem(data, systemKey);
  return system.vacations.find(v => dateStr >= v.start && dateStr <= v.end) || null;
}

function publicHolidayForDate(system, dateStr) {
  return (system.publicHolidays || []).find(h => h.date === dateStr) || null;
}

function getAcademicStatus(data, dateStr, systemKey) {
  const system = getSchoolSystem(data, systemKey);
  const vacation = vacationForDate(data, dateStr, systemKey);
  const holiday = publicHolidayForDate(system, dateStr);

  /* Летние каникулы могут продолжаться после yearEnd календарной сетки. */
  if (vacation) {
    return { type: "vacation", vacation, holiday, system };
  }
  if (dateStr < system.yearStart) {
    return { type: "before-year", system };
  }
  if (dateStr > system.yearEnd) {
    return { type: "after-year", system };
  }
  if (holiday) {
    return { type: "holiday", holiday, system };
  }

  const date = dateFromISO(dateStr);
  const day = date.getUTCDay();
  if (day === 0 || day === 6) {
    return { type: "weekend", system };
  }

  return {
    type: "school",
    isLastSchoolDay: dateStr === system.lastSchoolDay,
    system
  };
}

function nextVacation(data, dateStr, systemKey) {
  const system = getSchoolSystem(data, systemKey);
  const current = vacationForDate(data, dateStr, systemKey);
  if (current) return { current, system };

  const next = system.vacations
    .filter(v => v.start > dateStr)
    .sort((a, b) => a.start.localeCompare(b.start))[0] || null;
  return { next, system };
}

/* Рендер строки урока: <li> номер · время · предмет */
function lessonRow(lesson, state) {
  const li = el("li");
  if (state === "current" || state === "next") {
    li.classList.add("lesson-" + state);
    li.setAttribute("aria-current", state === "current" ? "true" : "false");
  }

  li.appendChild(el("span", "lesson-num", String(lesson.n)));
  li.appendChild(el("span", "lesson-time", lesson.time));
  const title = el("span", "lesson-title");
  title.textContent = (lesson.icon ? lesson.icon + " " : "") + lesson.subject;
  li.appendChild(title);

  if (state) {
    li.appendChild(el("span", "lesson-state " + state,
      state === "current" ? "Сейчас" : "Далее"));
  }
  return li;
}

/* Рендер строки личного занятия */
const ACT_ICONS = { sport: "🏃", lesson: "💡", club: "🎯", other: "📌" };

function activityRow(act) {
  const li = el("li");
  const type = ACT_ICONS[act.type] ? act.type : "other";
  li.appendChild(el("span", "act-badge " + type, act.icon || ACT_ICONS[type]));
  li.appendChild(el("span", "lesson-time", act.time));
  const title = el("span", "lesson-title");
  const name = el("span");
  name.textContent = act.title;
  title.appendChild(name);
  if (act.place) {
    const wrap = el("span");
    wrap.appendChild(name);
    wrap.appendChild(el("span", "place", act.place));
    title.innerHTML = "";
    title.appendChild(wrap);
  }
  li.appendChild(title);
  return li;
}
