import { Resend } from "resend";

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

function renderItem(item) {
  const explicacao = [item.motivo, item.summary].filter(Boolean).join(" ");
  return `
    <div style="padding:12px 0;border-bottom:1px solid #e5e5e5;">
      <div style="font-size:15px;font-weight:600;color:#1a1a2e;">${item.title}</div>
      <div style="font-size:12px;color:#888;margin-top:2px;">${formatDate(item.date)} · score ${item.score}</div>
      <div style="font-size:13px;color:#444;margin-top:4px;">${explicacao}</div>
      <div style="margin-top:6px;">
        <a href="${item.url}" style="font-size:13px;color:#3355dd;">Acessar →</a>
      </div>
    </div>
  `;
}

function renderDigestHtml(digest, today) {
  const groups = {};
  for (const item of digest) {
    groups[item.tema] = groups[item.tema] || [];
    groups[item.tema].push(item);
  }

  const sections = Object.entries(groups)
    .map(
      ([tema, items]) => `
        <h2 style="font-size:16px;color:#1a1a2e;margin:20px 0 4px;">${TEMA_LABELS[tema] || tema}</h2>
        ${items.map(renderItem).join("")}
      `
    )
    .join("");

  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h1 style="font-size:20px;color:#1a1a2e;">Seu digest do Insper — ${today}</h1>
      ${sections || "<p>Nenhuma novidade relevante desta vez.</p>"}
      <p style="font-size:12px;color:#aaa;margin-top:24px;">Próxima atualização em alguns dias.</p>
    </div>
  `;
}

export async function sendDigestEmail(digest, { to, from, today }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject =
    digest.length > 0
      ? `Digest Insper (${today}) — ${digest.length} novidades`
      : `Digest Insper (${today}) — nada relevante hoje`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: renderDigestHtml(digest, today),
  });

  if (error) {
    throw new Error(`Resend falhou ao enviar email: ${error.message}`);
  }
}
