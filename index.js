import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import "dotenv/config";
import { scrapeInsperNews } from "./src/scraper.js";
import { classifyNews } from "./src/classifier.js";
import { sendDigestEmail, sendFailureEmail } from "./src/emailer.js";
import { filterDuplicateTitles } from "./src/dedupe.js";
import { getDislikedTitles } from "./src/feedback.js";

const DATA_DIR = "./data";
const LOG_DIR = "./logs";
const CACHE_FILE = path.join(DATA_DIR, "seen.json");
const LOG_FILE = path.join(LOG_DIR, "monitor.log");
const RETENTION_DAYS = 30;
const MIN_SCORE = Number(process.env.MIN_SCORE) || 60;
const SEND_EMPTY_DIGEST = process.env.SEND_EMPTY_DIGEST === "true";
const REPO_SLUG = process.env.GITHUB_REPO || "Lukenthexplorer/careermaxxing";

const TEMA_ORDER = ["Carreira", "Evento", "Pesquisa", "Empreendedorismo", "Outro"];

async function loadCache() {
  if (!existsSync(CACHE_FILE)) return { seen: [] };
  const raw = await readFile(CACHE_FILE, "utf-8");
  return JSON.parse(raw);
}

async function saveCache(cache) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function log(message) {
  await mkdir(LOG_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(LOG_FILE, line);
  console.log(message);
}

function pruneCache(cache) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  cache.seen = cache.seen.filter((entry) => new Date(entry.seenAt).getTime() >= cutoff);
  return cache;
}

function sortDigest(items) {
  return [...items].sort((a, b) => {
    const temaDiff = TEMA_ORDER.indexOf(a.tema) - TEMA_ORDER.indexOf(b.tema);
    if (temaDiff !== 0) return temaDiff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

async function main() {
  await log("Iniciando execução do monitor de notícias do Insper");

  const cache = pruneCache(await loadCache());
  const seenUrls = new Set(cache.seen.map((entry) => entry.url));
  const seenTitles = cache.seen.map((entry) => entry.title).filter(Boolean);

  const scraped = await scrapeInsperNews();
  await log(`Scraper encontrou ${scraped.length} itens (notícias + eventos)`);

  const newByUrl = scraped.filter((item) => item.url && !seenUrls.has(item.url));
  const newItems = filterDuplicateTitles(newByUrl, seenTitles);
  await log(
    `${newItems.length} itens novos (não vistos antes, ${newByUrl.length - newItems.length} descartados por título similar)`
  );

  const dislikedTitles = await getDislikedTitles(REPO_SLUG);
  const classified = await classifyNews(newItems, dislikedTitles);
  const digest = sortDigest(classified.filter((item) => item.score >= MIN_SCORE));

  await log(
    `${classified.length} itens classificados, ${digest.length} passaram no filtro (score >= ${MIN_SCORE})`
  );

  for (const item of newItems) {
    cache.seen.push({ url: item.url, title: item.title, seenAt: new Date().toISOString() });
  }
  await saveCache(cache);

  await mkdir(DATA_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const outputFile = path.join(DATA_DIR, `digest-${today}.json`);
  await writeFile(outputFile, JSON.stringify(digest, null, 2));

  await log(`Digest salvo em ${outputFile}`);

  if (!process.env.RESEND_API_KEY || !process.env.DIGEST_EMAIL_TO) {
    await log("RESEND_API_KEY ou DIGEST_EMAIL_TO não configurados — email não enviado");
  } else if (digest.length === 0 && !SEND_EMPTY_DIGEST) {
    await log("Digest vazio — email não enviado (SEND_EMPTY_DIGEST=true para forçar)");
  } else {
    await sendDigestEmail(digest, {
      to: process.env.DIGEST_EMAIL_TO,
      from: process.env.DIGEST_EMAIL_FROM || "onboarding@resend.dev",
      today,
      repoSlug: REPO_SLUG,
    });
    await log(`Email enviado para ${process.env.DIGEST_EMAIL_TO}`);
  }
}

main().catch(async (err) => {
  const message = err.stack || err.message;
  await log(`ERRO: ${message}`);

  if (process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL_TO) {
    try {
      await sendFailureEmail(message, {
        to: process.env.DIGEST_EMAIL_TO,
        from: process.env.DIGEST_EMAIL_FROM || "onboarding@resend.dev",
      });
      await log("Email de alerta de falha enviado");
    } catch (emailErr) {
      await log(`Falha ao enviar email de alerta: ${emailErr.message}`);
    }
  }

  process.exitCode = 1;
});
