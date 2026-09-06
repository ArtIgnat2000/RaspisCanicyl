/* Календарь каникул: генерация месяцев учебного года · v3.0 — стиль как scool_shedule2026 */

(async function () {
  const heroDateEl = document.getElementById("heroDate");
  const calendarSubtitle = document.getElementById("calendar-subtitle");
  const summaryBox = document.getElementById("vac-summary");
  const countdownBox = document.getElementById("vacation-countdown");
  const monthsBox = document.getElementById("months");
  const errorBox = document.getElementById("errorMsg");
  const periodCountEl = document.getElementById("periodCount");
  const segmented = document.querySelector(".segmented");
  const segIndicator = segmented ? segmented.querySelector(".seg-indicator") : null;
  const segButtons = Array.from(document.querySelectorAll(".seg[data-system]"));

  let data;
  try {
    data = await loadJSON("data/holidays.json");
  } catch (e) {
    showError(e.message);
    return;
  }

  const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  let currentSystem = getSchoolSystemKey(data);
  let focusTimer = null;

  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

  // ── Дата в шапке — как в расписании ────────────────────────
  (function initHeroDate() {
    if (!heroDateEl) return;
    try {
      const text = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
      heroDateEl.textContent = text.charAt(0).toUpperCase() + text.slice(1);
    } catch (_) {
      heroDateEl.textContent = localISODate();
    }
  })();

  // ── Сегмент-контрол систем ─────────────────────────────────
  function moveIndicator() {
    if (!segmented || !segIndicator) return;
    const active = segmented.querySelector(".seg.active");
    if (!active) return;
    segIndicator.style.width = active.offsetWidth + "px";
    segIndicator.style.left = active.offsetLeft + "px";
  }

  function updateSegmentedUI() {
    segButtons.forEach(btn => {
      const isActive = btn.dataset.system === currentSystem;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    // на маленьком экране индикатор должен пересчитаться после рендера
    requestAnimationFrame(() => requestAnimationFrame(moveIndicator));
  }

  function setSystem(key) {
    if (!data.systems || !data.systems[key]) return;
    currentSystem = key;
    try { storeValue("schedule.system", key); } catch (_) {}
    try {
      if (key === data.defaultSystem) setParam("system", null);
      else setParam("system", key);
    } catch (_) {}
    updateSegmentedUI();
    render();
  }

  segButtons.forEach(btn => {
    btn.addEventListener("click", () => setSystem(btn.dataset.system));
  });
  window.addEventListener("resize", moveIndicator);

  function showError(message) {
    if (errorBox) {
      errorBox.textContent = "⚠️ " + message + " — проверьте, что страница открыта через HTTP-сервер (не file://), и что файлы в data/ на месте.";
      errorBox.classList.add("show");
    } else if (monthsBox) {
      monthsBox.innerHTML = "";
      const card = el("div", "error-card");
      card.textContent = "⚠️ " + message;
      card.classList.add("show");
      monthsBox.appendChild(card);
    }
  }

  function render() {
    if (focusTimer) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
    const system = getSchoolSystem(data, currentSystem);
    if (calendarSubtitle) calendarSubtitle.textContent = data.schoolYear + " · " + system.label;
    if (periodCountEl) {
      const n = system.vacations.length;
      periodCountEl.textContent = n + " " + pluralRu(n, "период", "периода", "периодов");
    }
    renderCountdown(system);
    renderSummary(system);
    renderMonths(system);
    // индикатор после того как DOM обновился
    requestAnimationFrame(() => requestAnimationFrame(moveIndicator));
  }

  function renderCountdown(system) {
    const today = localISODate();
    const status = getAcademicStatus(data, today, currentSystem);
    const upcoming = nextVacation(data, today, currentSystem);
    let text;

    if (status.type === "before-year") {
      text = "Учебный год ещё не начался · старт " + formatDateRu(system.yearStart);
    } else if (status.type === "vacation") {
      const left = daysBetween(today, status.vacation.end);
      text = "Сейчас каникулы: " + status.vacation.name + " · до " + formatDateRu(status.vacation.end) + " (осталось " + left + " " + pluralRu(left, "день", "дня", "дней") + ")";
    } else if (status.type === "after-year") {
      text = "Учебный год завершён";
    } else if (upcoming.next) {
      const days = daysBetween(today, upcoming.next.start);
      text = days > 0
        ? "До " + upcoming.next.name + " — " + days + " " + pluralRu(days, "день", "дня", "дней") + " · начало " + formatDateRu(upcoming.next.start)
        : "Ближайшие каникулы начинаются " + formatDateRu(upcoming.next.start);
    } else {
      text = "Ближайших периодов каникул нет";
    }

    countdownBox.className = "countdown " + status.type;
    countdownBox.textContent = text;
  }

  function renderSummary(system) {
    summaryBox.innerHTML = "";
    system.vacations.forEach((v, idx) => {
      const item = el("button", "vac-item is-vacation" + (v.optional ? " optional" : ""));
      item.type = "button";
      item.dataset.start = v.start;
      item.dataset.end = v.end;
      item.style.setProperty("--i", idx);
      item.setAttribute("aria-label", "Показать период: " + v.name + " " + formatDateRu(v.start) + " — " + formatDateRu(v.end));

      const picto = el("span", "v-picto", v.emoji || "🌴");
      picto.setAttribute("aria-hidden", "true");
      item.appendChild(picto);

      const info = el("div", "v-info");
      const name = el("div", "v-name");
      name.textContent = v.name;
      info.appendChild(name);
      const dates = el("div", "v-dates");
      dates.textContent = v.start === v.end ? formatDateRu(v.start) : formatDateRu(v.start, true) + " — " + formatDateRu(v.end, true);
      // без года если один год? оставляем с годом как раньше для однозначности
      info.appendChild(dates);
      item.appendChild(info);

      item.appendChild(el("span", "v-chevron", "›"));

      item.addEventListener("click", () => focusVacation(v, system));
      summaryBox.appendChild(item);
    });
  }

  function renderMonths(system) {
    monthsBox.innerHTML = "";
    const holidaySet = new Map();
    (system.publicHolidays || []).forEach(h => holidaySet.set(h.date, h.name));
    const specialSet = new Map();
    (system.specialDays || []).forEach(s => specialSet.set(s.date, s.name));
    if (system.lastSchoolDay) {
      specialSet.set(system.lastSchoolDay, "Последний учебный день");
    }

    const [sy, sm] = system.yearStart.split("-").map(Number);
    const [ey, em] = system.yearEnd.split("-").map(Number);
    let y = sy, m = sm - 1;
    while (y < ey || (y === ey && m <= em - 1)) {
      monthsBox.appendChild(renderMonth(y, m, system, holidaySet, specialSet));
      m++;
      if (m > 11) { m = 0; y++; }
    }
  }

  function focusVacation(v, system) {
    if (focusTimer) clearTimeout(focusTimer);
    document.querySelectorAll(".period-focus").forEach(node => node.classList.remove("period-focus"));

    const targetDate = v.start > system.yearEnd ? system.yearEnd :
      (v.end < system.yearStart ? system.yearStart : v.start);
    const month = document.getElementById("month-" + targetDate.slice(0, 7));
    if (!month) return;

    const cells = Array.from(document.querySelectorAll(".cal-day[data-date]")).filter(cell => {
      const ds = cell.dataset.date;
      return ds >= v.start && ds <= v.end;
    });

    month.classList.add("period-focus");
    cells.forEach(cell => cell.classList.add("period-focus"));
    if (typeof month.scrollIntoView === "function") {
      month.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    focusTimer = setTimeout(() => {
      month.classList.remove("period-focus");
      cells.forEach(cell => cell.classList.remove("period-focus"));
      focusTimer = null;
    }, 3200);
  }

  function renderMonth(year, month, system, holidaySet, specialSet) {
    const wrap = el("div", "cal-month");
    wrap.id = "month-" + year + "-" + String(month + 1).padStart(2, "0");
    wrap.dataset.month = year + "-" + String(month + 1).padStart(2, "0");
    wrap.appendChild(el("h3", null, MONTH_NAMES[month] + " " + year));

    const grid = el("div", "cal-grid");
    DOW.forEach((d, i) => grid.appendChild(el("div", "cal-dow" + (i >= 5 ? " we" : ""), d)));

    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDow; i++) grid.appendChild(el("div", "cal-day blank"));

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const ds = iso(date);
      const dow = (date.getDay() + 6) % 7;

      const cell = el("div", "cal-day", String(d));
      cell.dataset.date = ds;
      const titles = [];

      const vacation = system.vacations.find(v => ds >= v.start && ds <= v.end);
      if (vacation) { cell.classList.add("vac"); titles.push(vacation.name); }

      if (dow >= 5) { cell.classList.add("off"); }
      if (holidaySet.has(ds)) { cell.classList.add("off"); titles.push(holidaySet.get(ds)); }

      if (specialSet.has(ds)) { cell.classList.add("special"); titles.push(specialSet.get(ds)); }
      if (ds === localISODate()) { cell.classList.add("today"); titles.push("Сегодня"); }

      if (titles.length) cell.title = titles.join(" · ");
      grid.appendChild(cell);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  // первичная инициализация
  updateSegmentedUI();
  render();

  // лёгкая анимация появления карточек после загрузки
  if (monthsBox) {
    monthsBox.style.opacity = "0";
    requestAnimationFrame(() => {
      monthsBox.style.transition = "opacity 0.45s ease";
      monthsBox.style.opacity = "1";
    });
  }
})();
