const gate = document.querySelector(".analytics-gate");
const board = document.querySelector(".analytics-board");
const login = document.querySelector(".analytics-login");
const loginError = login.querySelector(".quiz-error");
const stats = document.querySelector(".stats");
const days = document.querySelector(".days");
const funnel = document.querySelector(".funnel");
const answers = document.querySelector(".answers");
const leads = document.querySelector(".leads");

const stepNames = ["агентство", "заработок", "доход", "цель", "что мешает", "как изменится"];
const answerNames = {
  intent: "хочет агентство",
  work: "чем зарабатывает",
  income: "доход сейчас",
  target: "цель",
  blocker: "что мешает",
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function percent(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function track(label, count, max, className = "") {
  const width = max ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return `<div class="row">
    <p>${esc(label)}</p>
    <div class="track"><span class="${className}" style="width:${count ? width : 0}%"></span></div>
    <b>${count}</b>
  </div>`;
}

function render(data) {
  const cards = [["Заходы",data.visits],["Старты",data.plays],["Кнопка",data.clicks],["Ср. просмотр", duration(data.average)]];
  stats.innerHTML = cards.map(([label,value])=>`<article class="stat"><b>${value}</b><span>${label}</span></article>`).join("");
  document.querySelector('.conversion').textContent = `Запускают видео ${percent(data.plays,data.visits)} · Нажимают на разбор ${percent(data.clicks,data.visits)}`;
  const columns = ['День','Заходы','Старты','Кнопка','Ср. просмотр','Старт, %','Кнопка, %'];
  days.innerHTML = table(columns, data.days.map(d=>[esc(d.date.split('-').reverse().join('.')),d.visits,d.plays,d.clicks,duration(d.average),percent(d.plays,d.visits),percent(d.clicks,d.visits)]));
  const rows = [['Заходы',data.visits],['Запустили видео',data.plays],['Нажали на разбор',data.clicks],['Открыли анкету',data.quizzes],...data.steps.map(s=>[stepNames[s.step-1],s.count]),['Отправили заявку',data.leads]];
  funnel.innerHTML = rows.map(([label,count])=>`<div class="row"><p>${esc(label)}</p><div class="track"><span style="width:${Math.min(100,data.visits ? count/data.visits*100 : 0)}%"></span></div><b>${percent(count,data.visits)} <small>(${count})</small></b></div>`).join('');
  document.querySelector('.sources').innerHTML = table(['Источник','Канал','Кампания','Объявление','Ключевое слово','Заходы','Старты','Кнопка','Заявки','Конверсия в заявку','Ср. просмотр'], data.sources.map(s=>[...sourceCells(s.attribution),s.visits,s.plays,s.clicks,s.leads,percent(s.leads,s.visits),duration(s.average)]));
  document.querySelector('.visitors').innerHTML = table(['Время','Посетитель / сеанс','Источник','Канал','Кампания','Объявление','Ключевое слово'], data.visitors.map(v=>[esc(new Date(v.t).toLocaleString('ru-RU',{timeZone:'Europe/Minsk'})),esc(v.name || v.sid.slice(0,8)),...sourceCells(v.attribution)]));
  answers.innerHTML = Object.entries(data.answers)
    .map(([key, rows]) => {
      const max = Math.max(1, ...rows.map((row) => row.count));
      return `<section class="panel"><h2>${answerNames[key]}</h2><div class="bars">${rows
        .map((row) => track(row.label, row.count, max, "alt"))
        .join("")}</div></section>`;
    })
    .join("");

  leads.innerHTML = data.recent.length
    ? data.recent
        .map((lead) => {
          const time = new Intl.DateTimeFormat("ru-RU", {
            timeZone: "Europe/Moscow",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(lead.t));
          return `<article class="lead">
            <header><span>${esc(lead.name)}</span><time>${esc(time)}</time></header>
            <p>${esc(lead.phone)} · ${esc(lead.telegram)}</p><p class="muted">Источник: ${sourceCells(lead.attribution).join(" · ")}</p>
            <p>${esc(lead.income)} → ${esc(lead.target)}</p>
            <p>${esc(lead.blocker)}</p>
            <p class="muted">${esc(lead.vision)}</p>
          </article>`;
        })
        .join("")
    : `<p class="muted">заявок пока нет</p>`;
}

const filters = document.querySelector('.date-filter');
const status = document.querySelector('.report-status');
function duration(value) { if (value == null) return '—'; const seconds = Math.floor(value); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; }
function sourceCells(a) { return [a ? a.utm_source || a.referrer || 'Прямой / без UTM' : 'Нет данных (старая запись)',a?.utm_medium || '—',a?.utm_campaign || '—',a?.utm_content || '—',a?.utm_term || '—'].map(esc); }
function table(headers, rows) { return `<table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Нет данных за выбранный период</td></tr>`}</tbody></table>`; }
let request = 0;
async function showBoard(all = false) {
  const id = ++request;
  const params = new URLSearchParams();
  if (!all && filters.elements.from.value && filters.elements.to.value) {
    params.set('from',filters.elements.from.value); params.set('to',filters.elements.to.value);
  }
  status.textContent = 'Загрузка…';
  try {
    const response = await fetch(`api.php?action=analytics&${params}`);
    if (id !== request) return;
    if (response.status === 401) { gate.hidden=false; board.hidden=true; status.textContent=''; return; }
    if (!response.ok) throw new Error('Не удалось загрузить данные. Проверьте диапазон дат и повторите.');
    const data = await response.json();
    if (id !== request) return;
    render(data);
    filters.elements.from.value=data.from; filters.elements.to.value=data.to;
    gate.hidden=true; board.hidden=false;
    status.textContent='Показатели за выбранный период · сеанс заканчивается после 30 минут бездействия. Таймкоды и UTM собираются с обновления; для старых данных — прочерк.';
  } catch (error) { if (id===request) { status.textContent=error.message; if (board.hidden) { gate.hidden=false; loginError.hidden=false; loginError.textContent='Не удалось загрузить аналитику. Повторите вход.'; } } }
}
filters.addEventListener('submit',event=>{ event.preventDefault(); if (filters.elements.from.value > filters.elements.to.value) { status.textContent='Дата начала должна быть не позже даты окончания.'; return; } showBoard(); });
filters.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.period==='all') { showBoard(true); return; }
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const from = new Date(`${today}T12:00:00Z`); from.setUTCDate(from.getUTCDate()-Number(button.dataset.period)+1);
  filters.elements.from.value=from.toISOString().slice(0,10); filters.elements.to.value=today; showBoard();
}));

login.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = login.querySelector("button");
  button.disabled = true;
  loginError.hidden = true;
  try {
    const response = await fetch("api.php?action=login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: login.elements.password.value }),
    });
    if (!response.ok) {
      loginError.hidden = false;
      loginError.textContent = response.status === 429 ? "слишком много попыток, подожди минуту" : response.status === 401 ? "неверный пароль" : "Не удалось войти. Проверьте настройки PHP на хостинге.";
      return;
    }
    login.reset();
    await showBoard();
  } catch {
    loginError.hidden = false;
    loginError.textContent = "Нет связи с сервером. Попробуйте ещё раз.";
  } finally { button.disabled = false; }
});

document.querySelector(".analytics-out").addEventListener("click", async () => {
  try {
    const response = await fetch("api.php?action=logout", { method: "POST" });
    if (!response.ok) throw new Error();
    board.hidden = true;
    gate.hidden = false;
  } catch { status.textContent = "Не удалось выйти. Повторите попытку."; }
});

showBoard();
