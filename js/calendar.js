/* Календарь каникул: генерация месяцев учебного года · v2.2.0 */

(async function () {
  const calendarSubtitle = document.getElementById("calendar-subtitle");
  const summaryBox = document.getElementById("vac-summary");
  const countdownBox = document.getElementById("vacation-countdown");
  const monthsBox = document.getElementById("months");

  let data;
  try {
    data = await loadJSON("data/holidays.json");
  } catch (e) {
    showError(monthsBox, e.message);
    return;
  }

  const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                       "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const currentSystem = getSchoolSystemKey(data);
  let focusTimer = null;

  const iso = d => d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");

  function render() {
    if (focusTimer) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
    const system = getSchoolSystem(data, currentSystem);
    calendarSubtitle.textContent = data.schoolYear + " · " + system.label;
    renderCountdown(system);
    renderSummary(system);
    renderMonths(system);
  }

  function renderCountdown(system) {
    const today = localISODate();
    const status = getAcademicStatus(data, today, currentSystem);
    const upcoming = nextVacation(data, today, currentSystem);
    let text;

    if (status.type === "before-year") {
      /* Дни до начала учебного года не входят в счётчик. */
      text = "Учебный год ещё не начался · старт " + formatDateRu(system.yearStart);
    } else if (status.type === "vacation") {
      const left = daysBetween(today, status.vacation.end);
      text = "Сейчас каникулы: " + status.vacation.name +
        " · до " + formatDateRu(status.vacation.end) +
        " (осталось " + left + " " + pluralRu(left, "день", "дня", "дней") + ")";
    } else if (status.type === "after-year") {
      text = "Учебный год завершён";
    } else if (upcoming.next) {
      const days = daysBetween(today, upcoming.next.start);
      text = days > 0
        ? "До " + upcoming.next.name + " — " + days + " " +
          pluralRu(days, "день", "дня", "дней") +
          " · начало " + formatDateRu(upcoming.next.start)
        : "Ближайшие каникулы начинаются " + formatDateRu(upcoming.next.start);
    } else {
      text = "Ближайших периодов каникул нет";
    }

    countdownBox.className = "countdown " + status.type;
    countdownBox.textContent = text;
  }

  function renderSummary(system) {
    summaryBox.innerHTML = "";
    system.vacations.forEach(v => {
      const item = el("button", "vac-item" + (v.optional ? " optional" : ""));
      item.type = "button";
      item.dataset.start = v.start;
      item.dataset.end = v.end;
      item.setAttribute("aria-label", "Показать период: " + v.name);
      item.addEventListener("click", () => focusVacation(v, system));

      item.appendChild(el("span", "v-emoji", v.emoji || "🌴"));
      const txt = el("div");
      const name = el("div", "v-name");
      name.textContent = v.name;
      txt.appendChild(name);
      const dates = el("div", "v-dates");
      dates.textContent = v.start === v.end ? formatDateRu(v.start) :
        formatDateRu(v.start) + " — " + formatDateRu(v.end);
      txt.appendChild(dates);
      item.appendChild(txt);
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
    let y = sy, m = sm - 1; // month 0-based
    while (y < ey || (y === ey && m <= em - 1)) {
      monthsBox.appendChild(renderMonth(y, m, system, holidaySet, specialSet));
      m++;
      if (m > 11) { m = 0; y++; }
    }
  }

  function focusVacation(v, system) {
    if (focusTimer) clearTimeout(focusTimer);
    document.querySelectorAll(".period-focus").forEach(node => node.classList.remove("period-focus"));

    /* Если период начинается после последнего отображаемого дня,
       ведём пользователя к последнему доступному месяцу. */
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
    DOW.forEach((d, i) =>
      grid.appendChild(el("div", "cal-dow" + (i >= 5 ? " we" : ""), d)));

    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Пн = 0
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

  render();
})();
