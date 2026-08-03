import puppeteer from "puppeteer";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SOURCES = [
  {
    category: "Notícia",
    templateName: "noticias",
    sort: "newest",
    rows: 20,
  },
  {
    category: "Evento",
    templateName: "evento",
    sort: "newest",
    rows: 20,
    // only events happening today or later
    extraFq: () => `&fq[]=date:[${new Date().toISOString().slice(0, 19)}Z%20TO%20*]`,
  },
];

function buildSearchUrl({ templateName, sort, rows, extraFq }) {
  const base = "https://www.insper.edu.br/bin/search/proxy";
  const params = `?q=*&p=1&_setlocale=pt&fq[]=templateName:${templateName}&sort=${sort}&rows=${rows}&fqi.op=AND`;
  return base + params + (extraFq ? extraFq() : "");
}

function mapDocument(doc, category) {
  const fields = doc.fields || {};
  return {
    title: fields.title || fields.title_str || "",
    url: fields.url || doc.source || "",
    date: fields.date || null,
    summary: (fields.richText || "").replace(/<[^>]+>/g, "").trim(),
    category,
    tags: fields.tags || [],
    inscricaoAberta: Boolean(fields.inscricaoAberta),
  };
}

export async function scrapeInsperNews() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const results = [];
  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    // Establish a real browser session against the site before hitting the API,
    // since the search endpoint sits behind Akamai bot protection.
    await page.goto("https://www.insper.edu.br/noticias/", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    for (const source of SOURCES) {
      const url = buildSearchUrl(source);
      const data = await page.evaluate(async (fetchUrl) => {
        const res = await fetch(fetchUrl, {
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        if (!res.ok) return null;
        return res.json();
      }, url);

      const docs = data?.results?.document || [];
      for (const doc of docs) {
        results.push(mapDocument(doc, source.category));
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}
