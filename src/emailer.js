import { Resend } from "resend";
import { buildFeedbackLink } from "./feedback.js";

const TEMA_LABELS = {
  Carreira: "💼 Carreira",
  Evento: "📅 Eventos",
  Pesquisa: "🔬 Pesquisa",
  Empreendedorismo: "🚀 Empreendedorismo",
  Outro: "📰 Outros",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// `today` is a plain YYYY-MM-DD calendar date, not a timestamp — parsing it with
// `new Date(str)` treats it as UTC midnight and can print the previous day once
// converted to a negative-offset timezone (e.g. Brazil). Build the Date from
// local components instead so the calendar date shown always matches the input.
function formatDateOnly(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function renderItem(item, repoSlug) {
  const explicacao = [item.motivo, item.summary].filter(Boolean).join(" ");
  const feedbackLink = buildFeedbackLink(repoSlug, item);
  return `
    <div style="padding:12px 0;border-bottom:1px solid #e5e5e5;">
      <div style="font-size:15px;font-weight:600;color:#1a1a2e;">${item.title}</div>
      <div style="font-size:12px;color:#888;margin-top:2px;">${formatDate(item.date)} · score ${item.score}</div>
      <div style="font-size:13px;color:#444;margin-top:4px;">${explicacao}</div>
      <div style="margin-top:6px;">
        <a href="${item.url}" style="font-size:13px;color:#3355dd;">Acessar →</a>
        <a href="${feedbackLink}" style="font-size:13px;color:#aaa;margin-left:14px;">Não relevante →</a>
      </div>
    </div>
  `;
}

function renderDigestHtml(digest, today, repoSlug) {
  const groups = {};
  for (const item of digest) {
    groups[item.tema] = groups[item.tema] || [];
    groups[item.tema].push(item);
  }

  const sections = Object.entries(groups)
    .map(
      ([tema, items]) => `
        <h2 style="font-size:16px;color:#1a1a2e;margin:20px 0 4px;">${TEMA_LABELS[tema] || tema}</h2>
        ${items.map((item) => renderItem(item, repoSlug)).join("")}
      `
    )
    .join("");

  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h1 style="font-size:20px;color:#1a1a2e;">Eventos de hoje - ${formatDateOnly(today)}</h1>
      ${sections || "<p>Nenhuma novidade relevante desta vez.</p>"}
      <p style="font-size:12px;color:#aaa;margin-top:24px;">Próxima atualização em alguns dias.</p>
    </div>
  `;
}

export async function sendDigestEmail(digest, { to, from, today, repoSlug }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = `Eventos de hoje - ${formatDateOnly(today)}`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: renderDigestHtml(digest, today, repoSlug),
  });

  if (error) {
    throw new Error(`Resend falhou ao enviar email: ${error.message}`);
  }
}

export async function sendFailureEmail(errorMessage, { to, from }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h1 style="font-size:18px;color:#b00020;">O monitor de notícias do Insper falhou</h1>
      <pre style="font-size:12px;background:#f5f5f5;padding:12px;white-space:pre-wrap;">${errorMessage}</pre>
    </div>
  `;
  // Best-effort: a failure notification failing too shouldn't crash the process further.
  await resend.emails.send({
    from,
    to,
    subject: "⚠️ Pipeline do digest Insper falhou",
    html,
  });
}
