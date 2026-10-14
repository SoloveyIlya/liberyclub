import { report, dayKey } from "./analytics-report.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, stat, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { extname } from "node:path";

loadEnv();

const PORT = Number(process.env.PORT) || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANALYTICS_PASSWORD = process.env.ANALYTICS_PASSWORD || "";
const DATA_FILE = new URL("./data/events.jsonl", import.meta.url);
const SESSION_COOKIE = "analytics_session";
const CHAT_IDS = [7150044183, -5431047949];
const ROOT = new URL("./", import.meta.url);
const FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSeNBVpVvasOpcnJmw2_Uu8jAYAbKBEUC2ZGEYNuQyM4KXd3IA/formResponse";

const entries = {
  intent: "entry.268178688",
  work: "entry.1206007550",
  income: "entry.1306327411",
  target: "entry.2119843470",
  blocker: "entry.1791531858",
  vision: "entry.1025073574",
  name: "entry.1845816420",
  phone: "entry.177967936",
  telegram: "entry.1020568362",
};

const options = {
  intent: ["Да, я хочу", "Хочу просто узнать подробнее о том, что это такое"],
  work: [
    "Монтаж, дизайн, СММ, копирайтинг или другая услуга",
    "У меня свой проект или продукт, нужны клиенты",
    "Пока ничего не продаю, ищу, с чего начать или чем заняться",
  ],
  income: ["До $500", "От $500 до $1.000", "От $1.000"],
  target: ["До $3 000", "От $3 000 до $5 000", "Больше $10 000"],
  blocker: [
    "Нет стабильного потока клиентов: то густо, то пусто",
    "Много работы, а чек маленький, поднять цену страшно",
    "Заказы есть, но не тяну рост: не хватает рук, делегировать не получилось",
  ],
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
};

function loadEnv() {
  let text = "";
  try {
    text = readFileSync(new URL(".env", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100_000) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function leadFrom(body) {
  const lead = {};
  for (const key of Object.keys(entries)) {
    lead[key] = String(body?.[key] ?? "").trim();
  }
  for (const [key, values] of Object.entries(options)) {
    if (!values.includes(lead[key])) return null;
  }
  if (lead.name.length < 2) return null;
  if (lead.phone.replace(/\D/g, "").length < 10) return null;
  if (!/^@?[A-Za-z0-9_]{4,}$/.test(lead.telegram)) return null;
  if (!lead.vision) return null;
  if (!lead.telegram.startsWith("@")) lead.telegram = `@${lead.telegram}`;
  lead.attribution = attributionFrom(body.attribution);
  return lead;
}

function attributionText(attribution) {
  const lines = Object.entries(attribution || {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`);
  return lines.length ? `Источник заявки:\n${lines.join("\n")}` : "Источник заявки: прямой / без UTM";
}

function applicationText(lead) {
  return [
    "Новая заявка",
    "",
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    `Телеграм: ${lead.telegram}`,
    "",
    `Агентство $3000–$5000: ${lead.intent}`,
    `Чем зарабатывает: ${lead.work}`,
    `Доход сейчас: ${lead.income}`,
    `Цель на 3 месяца: ${lead.target}`,
    `Что мешает: ${lead.blocker}`,
    "",
    "Что изменится:",
    lead.vision,
    "",
    attributionText(lead.attribution),
  ].join("\n");
}

async function saveToSheet(lead) {
  const params = new URLSearchParams();
  for (const [name, entry] of Object.entries(entries)) {
    params.set(entry, name === "vision" ? `${lead.vision}\n\n${attributionText(lead.attribution)}` : lead[name]);
  }
  params.set("fvv", "1");
  params.set("pageHistory", "0");

  const response = await fetch(FORM_ACTION, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const html = await response.text();
  if (!response.ok || !/gesendet|recorded|записан|enregistr/i.test(html)) {
    throw new Error("sheet");
  }
}

async function sendToBot(lead) {
  if (!TOKEN) throw new Error("telegram");
  const text = applicationText(lead);
  await Promise.all(
    CHAT_IDS.map(async (chatId) => {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error("telegram");
    }),
  );
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function passwordsMatch(input) {
  if (!ANALYTICS_PASSWORD || typeof input !== "string") return false;
  return timingSafeEqual(digest(input), digest(ANALYTICS_PASSWORD));
}

function sessionToken() {
  return createHash("sha256").update(`analytics:${ANALYTICS_PASSWORD}`).digest("hex");
}

function cookies(req) {
  const header = req.headers.cookie || "";
  const pairs = header.split(";").flatMap((part) => {
    const index = part.indexOf("=");
    if (index === -1) return [];
    return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
  });
  return Object.fromEntries(pairs);
}

function isAuthed(req) {
  if (!ANALYTICS_PASSWORD) return false;
  const token = cookies(req)[SESSION_COOKIE] || "";
  const expected = sessionToken();
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function clientIp(req) {
  return req.socket.remoteAddress || "unknown";
}

const loginAttempts = new Map();

function loginAllowed(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return true;
  if (entry.until && entry.until > Date.now()) return false;
  if (entry.until) loginAttempts.delete(ip);
  return true;
}

function noteLoginFailure(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= 8) {
    entry.until = Date.now() + 60_000;
    entry.count = 0;
  }
  loginAttempts.set(ip, entry);
}

let writeChain = Promise.resolve();

function record(event) {
  writeChain = writeChain
    .then(async () => {
      await mkdir(new URL("./data/", import.meta.url), { recursive: true });
      await appendFile(DATA_FILE, `${JSON.stringify(event)}\n`);
    })
    .catch((error) => {
      console.error(error.message);
    });
  return writeChain;
}

async function readEvents() {
  try {
    const text = await readFile(DATA_FILE, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function attributionFrom(body) {
  if (!body || typeof body !== "object") return null;
  return Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer"].map(key => [key, String(body[key] || "").slice(0, 300)]));
}

function eventFrom(body) {
  const type = String(body?.type || "");
  if (!["view", "play", "quiz", "step", "cta", "watch"].includes(type)) return null;
  const sid = String(body?.sid || "");
  if (!/^[A-Za-z0-9-]{8,80}$/.test(sid)) return null;
  const event = { t: Date.now(), type, sid, attribution: attributionFrom(body.attribution) };
  if (type === "watch") {
    const position = Number(body.position);
    if (!Number.isFinite(position) || position < 0 || position > 86400) return null;
    event.position = position;
  }
  if (type === "step") {
    const step = Number(body.step);
    if (!Number.isInteger(step) || step < 1 || step > 6) return null;
    event.step = step;
  }
  return event;
}

const eventHits = new Map();

function eventAllowed(ip) {
  const now = Date.now();
  const hits = (eventHits.get(ip) || []).filter((time) => now - time < 60_000);
  if (hits.length >= 40) {
    eventHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  eventHits.set(ip, hits);
  return true;
}

function serveFile(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative =
    pathname === "/"
      ? "index.html"
      : pathname === "/analytics"
        ? "analytics.html"
        : pathname === "/favicon.ico"
          ? "assets/favicon.svg"
          : pathname.replace(/^\/+/, "");
  const blocked = new Set(["server.js", "package.json", ".gitignore", ".env"]);
  if (!relative || relative.includes("..") || relative.startsWith(".") || relative.startsWith("data/") || blocked.has(relative)) {
    res.writeHead(404).end();
    return;
  }
  const file = new URL(relative, ROOT);
  if (!file.pathname.startsWith(ROOT.pathname)) {
    res.writeHead(404).end();
    return;
  }
  stat(file, (error, info) => {
    if (error || !info.isFile()) {
      res.writeHead(404).end();
      return;
    }
    const headers = {
      "Content-Type": types[extname(file.pathname)] || "application/octet-stream",
      "Accept-Ranges": "bytes",
    };
    let start = 0;
    let end = info.size - 1;
    let status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
    headers["Content-Length"] = Math.max(0, end - start + 1);
    res.writeHead(status, headers);
    if (req.method === "HEAD" || info.size === 0) {
      res.end();
      return;
    }
    const stream = createReadStream(file, { start, end });
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (req.method === "POST" && pathname === "/api/event") {
    try {
      if (!eventAllowed(clientIp(req))) {
        send(res, 429, { ok: false });
        return;
      }
      const event = eventFrom(await readBody(req));
      if (!event) {
        send(res, 400, { ok: false });
        return;
      }
      await record(event);
      send(res, 200, { ok: true });
    } catch {
      send(res, 400, { ok: false });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/analytics/login") {
    const ip = clientIp(req);
    if (!loginAllowed(ip)) {
      send(res, 429, { ok: false });
      return;
    }
    try {
      const body = await readBody(req);
      if (!passwordsMatch(body.password)) {
        noteLoginFailure(ip);
        send(res, 401, { ok: false });
        return;
      }
      loginAttempts.delete(ip);
      send(res, 200, { ok: true }, {
        "Set-Cookie": `${SESSION_COOKIE}=${sessionToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
      });
    } catch {
      send(res, 400, { ok: false });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/analytics/logout") {
    send(res, 200, { ok: true }, {
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/analytics") {
    if (!isAuthed(req)) {
      send(res, 401, { ok: false });
      return;
    }
    const params = new URL(req.url, "http://localhost").searchParams;
    const events = await readEvents();
    const to = params.get("to") || dayKey(Date.now());
    const from = params.get("from") || (events.length ? events.map(e => dayKey(e.t)).sort()[0] : to);
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
    if (!valid(from) || !valid(to) || from > to) {
      send(res, 400, { ok: false, error: "date_range" });
      return;
    }
    send(res, 200, report(events, from, to));
    return;
  }

  if (req.method === "POST" && pathname === "/api/lead") {
    try {
      const body = await readBody(req);
      const lead = leadFrom(body);
      if (!lead) {
        send(res, 400, { ok: false });
        return;
      }
      await Promise.all([saveToSheet(lead), sendToBot(lead)]);
      const sid = String(body.sid || "");
      await record({
        t: Date.now(),
        type: "lead",
        sid: /^[A-Za-z0-9-]{8,80}$/.test(sid) ? sid : "lead",
        ...lead,
        attribution: attributionFrom(body.attribution),
      });
      send(res, 200, { ok: true });
    } catch (error) {
      console.error(error.message);
      send(res, 502, { ok: false });
    }
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveFile(req, res);
    return;
  }

  res.writeHead(405).end();
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
