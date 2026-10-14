const form = document.querySelector(".quiz-form");
const done = document.querySelector(".quiz-done");
const head = document.querySelector(".quiz-head");
const error = document.querySelector(".quiz-error");
const stepLabel = document.querySelector(".quiz-step");
const progress = document.querySelector(".quiz-progress");
const back = document.querySelector(".quiz-back");
const next = document.querySelector(".quiz-next");
const panels = [...form.querySelectorAll(".quiz-panel")];
let index = 0;

function show(nextIndex, { focus = false } = {}) {
  index = nextIndex;
  panels.forEach((panel, i) => {
    const active = i === index;
    panel.hidden = !active;
    panel.disabled = !active;
  });

  const current = index + 1;
  stepLabel.textContent = `шаг ${current} из ${panels.length}`;
  progress.setAttribute("aria-valuenow", String(current));
  progress.style.setProperty("--p", String(current / panels.length));

  const last = index === panels.length - 1;
  back.hidden = index === 0;
  next.hidden = last;
  form.querySelector(".quiz-submit").hidden = !last;
  if (focus) panels[index].querySelector(".quiz-q")?.focus({ preventScroll: true });
}

function validateChoice(panel) {
  const radios = [...panel.querySelectorAll('input[type="radio"]')];
  if (!radios.length) return true;
  const picked = radios.some((radio) => radio.checked);
  radios[0].setCustomValidity(picked ? "" : "Выберите вариант");
  return radios[0].reportValidity();
}

function validateText(panel) {
  const area = panel.querySelector("textarea");
  if (!area) return true;
  area.setCustomValidity(area.value.trim() ? "" : "Напишите, что изменится");
  return area.reportValidity();
}

function validateContacts() {
  const name = form.elements.name;
  const phone = form.elements.phone;
  const telegram = form.elements.telegram;
  const digits = phone.value.replace(/\D/g, "");

  name.setCustomValidity(name.value.trim().length < 2 ? "Введите имя" : "");
  phone.setCustomValidity(digits.length < 10 ? "Введите телефон" : "");
  telegram.setCustomValidity(
    /^@?[A-Za-z0-9_]{4,}$/.test(telegram.value.trim()) ? "" : "Введите телеграм",
  );

  if (!name.reportValidity()) return false;
  if (!phone.reportValidity()) return false;
  return telegram.reportValidity();
}

function advance() {
  const panel = panels[index];
  if (!validateChoice(panel) || !validateText(panel)) return;
  const completed = index + 1;
  show(index + 1, { focus: true });
  track("step", { step: completed });
}

next.addEventListener("click", advance);
back.addEventListener("click", () => show(index - 1, { focus: true }));

form.addEventListener("input", (event) => {
  event.target.setCustomValidity("");
});

function fieldValue(name) {
  if (name === "telegram") {
    const raw = form.elements.telegram.value.trim();
    if (!raw) return "";
    return raw.startsWith("@") ? raw : `@${raw}`;
  }

  const field = form.elements[name];
  if (!field) return "";
  if (typeof field.length === "number" && field[0]?.type === "radio") {
    return [...field].find((node) => node.checked)?.value ?? "";
  }
  return String(field.value || "").trim();
}

async function sendApplication() {
  const response = await fetch("api.php?action=lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: fieldValue("intent"),
      work: fieldValue("work"),
      income: fieldValue("income"),
      target: fieldValue("target"),
      blocker: fieldValue("blocker"),
      vision: fieldValue("vision"),
      name: fieldValue("name"),
      phone: fieldValue("phone"),
      telegram: fieldValue("telegram"),
      ...(() => { try { const {sid, attribution} = trackingContext(); return {sid, attribution}; } catch { return {}; } })(),
    }),
  });
  if (!response.ok) throw new Error("send");
}

let sending = false;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (index < panels.length - 1) {
    advance();
    return;
  }
  if (sending || !validateContacts()) return;

  const submit = form.querySelector(".quiz-submit");
  sending = true;
  submit.disabled = true;
  error.hidden = true;

  try {
    await sendApplication();
    form.hidden = true;
    head.hidden = true;
    done.hidden = false;
    window.location.assign(withUTM("https://t.me/MelehinCreo"));
  } catch {
    sending = false;
    submit.disabled = false;
    error.hidden = false;
  }
});

show(0);
track("quiz");
