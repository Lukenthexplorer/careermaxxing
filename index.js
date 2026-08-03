import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import "dotenv/config";
import { scrapeInsperNews } from "./src/scraper.js";
import { classifyNews } from "./src/classifier.js";
import { sendDigestEmail } from "./src/emailer.js";

const DATA_DIR = "./data";
const LOG_DIR = "./logs";
const CACHE_FILE = path.join(DATA_DIR, "seen.json");
const LOG_FILE = path.join(LOG_DIR, "monitor.log");
const RETENTION_DAYS = 30;
const MIN_SCORE = 60;

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

  const scraped = await scrapeInsperNews();
  await log(`Scraper encontrou ${scraped.length} itens (notícias + eventos)`);

  const newItems = scraped.filter((item) => item.url && !seenUrls.has(item.url));
  await log(`${newItems.length} itens novos (não vistos antes)`);

  const classified = await classifyNews(newItems);
  const digest = sortDigest(classified.filter((item) => item.score >= MIN_SCORE));

  await log(
    `${classified.length} itens classificados, ${digest.length} passaram no filtro (score >= ${MIN_SCORE})`
  );

  for (const item of newItems) {
    cache.seen.push({ url: item.url, seenAt: new Date().toISOString() });
  }
  await saveCache(cache);

  await mkdir(DATA_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const outputFile = path.join(DATA_DIR, `digest-${today}.json`);
  await writeFile(outputFile, JSON.stringify(digest, null, 2));

  await log(`Digest salvo em ${outputFile}`);

  if (process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL_TO) {
    await sendDigestEmail(digest, {
      to: process.env.DIGEST_EMAIL_TO,
      from: process.env.DIGEST_EMAIL_FROM || "onboarding@resend.dev",
      today,
    });
    await log(`Email enviado para ${process.env.DIGEST_EMAIL_TO}`);
  } else {
    await log("RESEND_API_KEY ou DIGEST_EMAIL_TO não configurados — email não enviado");
  }
}

main().catch(async (err) => {
  await log(`ERRO: ${err.stack || err.message}`);
  process.exitCode = 1;
});
