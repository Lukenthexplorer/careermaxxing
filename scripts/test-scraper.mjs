import puppeteer from "puppeteer";

const URL = "https://www.insper.edu.br/noticias/";

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
  const response = await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  console.log("status:", response.status());
  const title = await page.title();
  console.log("title:", title);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("body preview:\n", bodyText);
} finally {
  await browser.close();
}
