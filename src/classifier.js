import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const PROFILE = `Perfil do aluno:
- Curso: Ciência da Computação no Insper
- Interesses principais: IA, Machine Learning, Startups, atividades extracurriculares DENTRO do Insper (ligas acadêmicas, workshops, hackathons, grupos de estudo, clubes, palestras internas), eventos de tecnologia, empreendedorismo, pesquisa em computação
- Desinteresses: comunicados administrativos genéricos, notícias focadas em outros cursos (Direito, Administração, Economia) sem relação com tecnologia, vagas de emprego externas (o aluno não está buscando isso agora), eventos fechados para outras turmas`;

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          score: { type: "integer" },
          motivo: { type: "string" },
          acao: { type: "string", enum: ["leia", "considera", "ignore"] },
          tema: {
            type: "string",
            enum: ["Carreira", "Evento", "Pesquisa", "Empreendedorismo", "Outro"],
          },
        },
        required: ["url", "score", "motivo", "acao", "tema"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function buildPrompt(newsItems, dislikedTitles) {
  const list = newsItems
    .map(
      (item, i) =>
        `${i + 1}. url: ${item.url}\n   título: ${item.title}\n   data: ${item.date}\n   categoria: ${item.category}\n   resumo: ${item.summary}`
    )
    .join("\n\n");

  const feedbackBlock =
    dislikedTitles && dislikedTitles.length > 0
      ? `\nO aluno já marcou os seguintes títulos como NÃO relevantes anteriormente — use isso para calibrar o julgamento sobre conteúdo parecido:\n${dislikedTitles.map((t) => `- ${t}`).join("\n")}\n`
      : "";

  return `Você é um assistente de filtro de notícias para um aluno do Insper.

${PROFILE}
${feedbackBlock}
Para cada notícia abaixo, avalie:
1. score de 0-100: quão relevante é para este aluno
2. motivo: uma frase curta explicando o score
3. acao: "leia" (score alto), "considera" (score médio) ou "ignore" (score baixo)
4. tema: a categoria que melhor descreve o conteúdo

NOTÍCIAS:

${list}

Retorne um item para cada notícia, na mesma ordem, identificado pela url.`;
}

export async function classifyNews(newsItems, dislikedTitles = []) {
  if (newsItems.length === 0) return [];

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: CLASSIFICATION_SCHEMA,
      },
    },
    messages: [{ role: "user", content: buildPrompt(newsItems, dislikedTitles) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const parsed = JSON.parse(textBlock.text);

  const byUrl = new Map(parsed.items.map((item) => [item.url, item]));
  return newsItems
    .map((item) => {
      const classification = byUrl.get(item.url);
      if (!classification) return null;
      return { ...item, ...classification };
    })
    .filter(Boolean);
}
