import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Treino de Habilidades Sociais - Chat + Fading (Níveis 1-4)
 * + Modo Terapeuta (CRUD de roteiros, persistência em localStorage, import/export)
 * + Registro clínico por sessão (tempo de resposta, tentativas, escolha)
 * + Histórico de sessões (relatório do uso do paciente) salvo no localStorage
 * + Modo Criança (travado e sem botões visíveis)
 * + Acesso oculto ao terapeuta por gesto (pressionar e segurar o título por 2s)
 *
 * + ANALÍTICAS CLÍNICAS (NOVO)
 * - marcadores sociais (pergunta de volta, agradecimento, pedido, justificativa)
 * - rigidez (repetição de mesma opção)
 * - variação de respostas
 * - recomendação objetiva de mudança de nível (subir/manter/voltar)
 *
 * ANTI TELA BRANCA:
 * - ErrorBoundary (mostra erro na tela e permite resetar storage)
 * - Fallback seguro se scripts/steps ficarem vazios/corrompidos
 */

const STORAGE_SCRIPTS = "treino_chat_scripts_v4";
const STORAGE_SETTINGS = "treino_chat_settings_v4";
const STORAGE_SESSION_LOG = "treino_chat_session_log_v2";

const THERAPIST_PIN = "1234"; // <- TROQUE AQUI
const LONG_PRESS_MS = 2000;

const DEFAULT_SCRIPTS = [
  {
    id: "cumprimentos",
    title: "Cumprimentos e continuidade",
    steps: [
      {
        id: 1,
        incoming: "Oi!",
        optionsL1: ["Oi", "Olá"],
        optionsL2: ["Oi", "Olá", "Oiê", "Tudo bem?"],
        level3: { template: "Oi, {blank}!", placeholder: "nome da pessoa", otherOption: "Olá! 🙂" },
        level4: {
          hint: "Dica: comece com um cumprimento.",
          chips: ["Oi!", "Olá 🙂", "Oi, tudo bem?", "Oi! Como você está?"],
        },
        next: 2,
      },
      {
        id: 2,
        incoming: "Como você está?",
        optionsL1: ["Estou bem e você?", "Tudo bem e com você?"],
        optionsL2: ["Estou bem e você?", "Tudo bem e com você?", "Estou mais ou menos hoje.", "Estou cansado(a), e você?"],
        level3: { template: "Eu estou {blank}. E você?", placeholder: "bem / ok / cansado(a) / feliz", otherOption: "Estou bem! E você?" },
        level4: {
          hint: "Dica: responda como você está + devolva a pergunta.",
          chips: ["Estou bem, e você?", "Estou ok hoje. E você?", "Estou cansado(a). E você?"],
        },
        next: 3,
      },
      {
        id: 3,
        incoming: "Que bom! O que você está fazendo agora?",
        optionsL1: ["Estou em casa.", "Estou descansando."],
        optionsL2: ["Estou em casa.", "Estou descansando.", "Estou estudando.", "Estou assistindo TV."],
        level3: { template: "Eu estou {blank} agora.", placeholder: "em casa / estudando / no trabalho", otherOption: "Estou descansando um pouco." },
        level4: {
          hint: "Dica: diga uma atividade simples.",
          chips: ["Estou em casa.", "Estou descansando.", "Estou estudando.", "Estou comendo agora."],
        },
        next: 4,
      },
      {
        id: 4,
        incoming: "Quer conversar sobre alguma coisa?",
        optionsL1: ["Sim.", "Agora não."],
        optionsL2: ["Sim.", "Agora não.", "Pode ser sobre meu dia.", "Pode ser sobre um filme."],
        level3: { template: "Pode ser sobre {blank}.", placeholder: "meu dia / escola / um filme", otherOption: "Agora não, depois eu posso." },
        level4: {
          hint: "Dica: escolha um assunto simples.",
          chips: ["Meu dia.", "A escola.", "Um filme.", "Um jogo."],
        },
        next: 5,
      },
      {
        id: 5,
        incoming: "Entendi. Quer que eu te escute ou quer uma dica?",
        optionsL1: ["Quero que escute.", "Quero uma dica."],
        optionsL2: ["Quero que escute.", "Quero uma dica.", "Os dois.", "Não sei."],
        level3: { template: "Eu quero {blank}.", placeholder: "que você escute / uma dica / os dois", otherOption: "Pode me dar uma dica?" },
        level4: {
          hint: "Dica: escolha uma opção com calma.",
          chips: ["Me escuta um pouco.", "Pode me dar uma dica?", "Os dois 🙂"],
        },
        next: 6,
      },
      {
        id: 6,
        incoming: "Tá bom 🙂 Quando você pode conversar melhor?",
        optionsL1: ["Mais tarde.", "Amanhã."],
        optionsL2: ["Mais tarde.", "Amanhã.", "Depois do almoço.", "À noite."],
        level3: { template: "Eu posso {blank}.", placeholder: "mais tarde / à noite / amanhã", otherOption: "Pode ser mais tarde." },
        level4: {
          hint: "Dica: combine um horário.",
          chips: ["Mais tarde.", "Depois do almoço.", "À noite.", "Amanhã."],
        },
        next: 7,
      },
      {
        id: 7,
        incoming: "Combinado! Até depois 🙂",
        optionsL1: ["Até!", "Tchau!"],
        optionsL2: ["Até!", "Tchau!", "Até mais!", "Falou!"],
        level3: { template: "Até {blank}!", placeholder: "mais / depois / amanhã", otherOption: "Tchau! 🙂" },
        level4: {
          hint: "Dica: finalize com despedida.",
          chips: ["Até!", "Até mais!", "Tchau!", "Falou!"],
        },
        next: "END",
      },
    ],
  },

  {
    id: "escola_amigo",
    title: "Escola (conversa com amigo)",
    steps: [
      {
        id: 1,
        incoming: "E aí! Você chegou agora?",
        optionsL1: ["Cheguei sim.", "Cheguei agora."],
        optionsL2: ["Cheguei sim.", "Cheguei agora.", "Cheguei faz pouco.", "Ainda tô chegando."],
        level3: { template: "Cheguei {blank}.", placeholder: "agora / faz pouco / cedo", otherOption: "Cheguei agora mesmo." },
        level4: { hint: "Dica: responda de forma simples e amigável.", chips: ["Cheguei agora.", "Cheguei faz pouco.", "Cheguei sim 🙂"] },
        next: 2,
      },
      {
        id: 2,
        incoming: "Você entendeu a tarefa de hoje?",
        optionsL1: ["Entendi.", "Não entendi."],
        optionsL2: ["Entendi.", "Não entendi.", "Entendi mais ou menos.", "Preciso de ajuda."],
        level3: { template: "Eu {blank} a tarefa.", placeholder: "entendi / não entendi / entendi mais ou menos", otherOption: "Não entendi, me ajuda?" },
        level4: { hint: "Dica: diga se entendeu e peça ajuda se precisar.", chips: ["Entendi.", "Não entendi.", "Me ajuda um pouco?"] },
        next: 3,
      },
      {
        id: 3,
        incoming: "Quer fazer junto comigo no intervalo?",
        optionsL1: ["Quero sim.", "Agora não."],
        optionsL2: ["Quero sim.", "Agora não.", "Pode ser depois.", "Sim, rapidinho."],
        level3: { template: "Pode ser {blank}.", placeholder: "no intervalo / depois / rapidinho", otherOption: "Quero sim!" },
        level4: { hint: "Dica: aceite ou combine um momento.", chips: ["Quero sim!", "No intervalo.", "Pode ser depois."] },
        next: 4,
      },
      {
        id: 4,
        incoming: "Beleza. E depois você quer brincar/jogar?",
        optionsL1: ["Quero.", "Não quero."],
        optionsL2: ["Quero.", "Não quero.", "Talvez.", "Depende do tempo."],
        level3: { template: "Eu {blank} jogar/brincar.", placeholder: "quero / não quero / talvez", otherOption: "Talvez, vamos ver." },
        level4: { hint: "Dica: responda com calma.", chips: ["Quero jogar.", "Não quero agora.", "Talvez."] },
        next: 5,
      },
      {
        id: 5,
        incoming: "Qual jogo você prefere?",
        optionsL1: ["Bola.", "Pega-pega."],
        optionsL2: ["Bola.", "Pega-pega.", "Esconde-esconde.", "Outro."],
        level3: { template: "Eu prefiro {blank}.", placeholder: "bola / pega-pega / esconde-esconde", otherOption: "Qual você prefere?" },
        level4: { hint: "Dica: diga um e pergunte o do amigo.", chips: ["Eu prefiro bola. E você?", "Pega-pega! E você?", "Esconde-esconde!"] },
        next: 6,
      },
      {
        id: 6,
        incoming: "Fechado! A gente combina 🙂",
        optionsL1: ["Combinado.", "Beleza."],
        optionsL2: ["Combinado.", "Beleza.", "Fechado!", "Tá bom 🙂"],
        level3: { template: "Combinado, até {blank}!", placeholder: "depois / mais tarde", otherOption: "Fechado!" },
        level4: { hint: "Dica: finalize curto.", chips: ["Combinado!", "Fechado!", "Beleza 🙂"] },
        next: "END",
      },
    ],
  },

  {
    id: "casa_mae",
    title: "Casa (conversa com a mãe)",
    steps: [
      {
        id: 1,
        incoming: "Filho(a), como foi seu dia?",
        optionsL1: ["Foi bom.", "Foi ruim."],
        optionsL2: ["Foi bom.", "Foi ruim.", "Foi mais ou menos.", "Foi cansativo."],
        level3: { template: "Meu dia foi {blank}.", placeholder: "bom / ruim / mais ou menos", otherOption: "Foi mais ou menos." },
        level4: { hint: "Dica: diga como foi e um detalhe pequeno.", chips: ["Foi bom.", "Foi cansativo.", "Foi mais ou menos."] },
        next: 2,
      },
      {
        id: 2,
        incoming: "O que aconteceu de mais importante?",
        optionsL1: ["Brinquei.", "Estudei."],
        optionsL2: ["Brinquei.", "Estudei.", "Conversei com um amigo.", "Não lembro."],
        level3: { template: "O mais importante foi {blank}.", placeholder: "estudar / brincar / conversar", otherOption: "Não lembro agora." },
        level4: { hint: "Dica: escolha 1 coisa do dia.", chips: ["Eu estudei.", "Eu brinquei.", "Eu conversei com um amigo."] },
        next: 3,
      },
      {
        id: 3,
        incoming: "Você está precisando de ajuda com alguma coisa?",
        optionsL1: ["Sim.", "Não."],
        optionsL2: ["Sim.", "Não.", "Talvez.", "Com a tarefa."],
        level3: { template: "Eu preciso de ajuda com {blank}.", placeholder: "tarefa / organização / calma", otherOption: "Agora não." },
        level4: { hint: "Dica: se precisar, diga com o que é.", chips: ["Sim, com a tarefa.", "Sim, para me acalmar.", "Não, agora não."] },
        next: 4,
      },
      {
        id: 4,
        incoming: "Tudo bem. Você quer uma pausa ou quer tentar agora?",
        optionsL1: ["Pausa.", "Tentar agora."],
        optionsL2: ["Pausa.", "Tentar agora.", "Pausa e depois tento.", "Não sei."],
        level3: { template: "Quero {blank}.", placeholder: "uma pausa / tentar agora / pausa e depois", otherOption: "Pausa e depois eu tento." },
        level4: { hint: "Dica: escolha entre pausa ou tentar.", chips: ["Quero uma pausa.", "Quero tentar agora.", "Pausa e depois tento."] },
        next: 5,
      },
      {
        id: 5,
        incoming: "Combinado. O que você quer fazer depois?",
        optionsL1: ["Descansar.", "Comer."],
        optionsL2: ["Descansar.", "Comer.", "Brincar.", "Assistir."],
        level3: { template: "Depois eu quero {blank}.", placeholder: "descansar / comer / brincar", otherOption: "Quero descansar." },
        level4: { hint: "Dica: diga uma atividade simples.", chips: ["Quero descansar.", "Quero comer.", "Quero brincar."] },
        next: 6,
      },
      {
        id: 6,
        incoming: "Tá bom 🙂 Obrigado por me contar.",
        optionsL1: ["De nada.", "Tá bom."],
        optionsL2: ["De nada.", "Tá bom.", "Obrigado(a) também.", "Ok 🙂"],
        level3: { template: "Tá bom, {blank}.", placeholder: "mãe / obrigado(a)", otherOption: "Ok 🙂" },
        level4: { hint: "Dica: finalize com educação.", chips: ["Tá bom 🙂", "Obrigado(a).", "Ok."] },
        next: "END",
      },
    ],
  },

  {
    id: "clinica_psico",
    title: "Clínica (conversa com a psicóloga)",
    steps: [
      {
        id: 1,
        incoming: "Oi! Como você está chegando hoje?",
        optionsL1: ["Bem.", "Mal."],
        optionsL2: ["Bem.", "Mal.", "Mais ou menos.", "Ansioso(a)."],
        level3: { template: "Eu estou {blank} hoje.", placeholder: "bem / mal / ansioso(a) / ok", otherOption: "Estou mais ou menos." },
        level4: { hint: "Dica: nomeie um sentimento.", chips: ["Estou bem.", "Estou ansioso(a).", "Estou mais ou menos."] },
        next: 2,
      },
      {
        id: 2,
        incoming: "Teve alguma situação difícil essa semana?",
        optionsL1: ["Sim.", "Não."],
        optionsL2: ["Sim.", "Não.", "Um pouco.", "Não quero falar."],
        level3: { template: "Teve {blank}.", placeholder: "sim / não / um pouco", otherOption: "Prefiro não falar agora." },
        level4: { hint: "Dica: se puder, diga um exemplo pequeno.", chips: ["Sim, na escola.", "Sim, em casa.", "Não, foi tranquilo."] },
        next: 3,
      },
      {
        id: 3,
        incoming: "Quando isso aconteceu, o que você sentiu no corpo?",
        optionsL1: ["Coração rápido.", "Vontade de chorar."],
        optionsL2: ["Coração rápido.", "Vontade de chorar.", "Raiva.", "Medo."],
        level3: { template: "Eu senti {blank}.", placeholder: "coração rápido / raiva / medo", otherOption: "Eu senti medo." },
        level4: { hint: "Dica: escolha 1 sensação.", chips: ["Coração rápido.", "Vontade de chorar.", "Raiva.", "Medo."] },
        next: 4,
      },
      {
        id: 4,
        incoming: "O que você fez depois disso?",
        optionsL1: ["Eu saí.", "Eu fiquei quieto(a)."],
        optionsL2: ["Eu saí.", "Eu fiquei quieto(a).", "Eu pedi ajuda.", "Eu gritei."],
        level3: { template: "Depois eu {blank}.", placeholder: "saí / pedi ajuda / fiquei quieto(a)", otherOption: "Eu pedi ajuda." },
        level4: { hint: "Dica: descreva a ação.", chips: ["Eu saí.", "Eu pedi ajuda.", "Eu fiquei quieto(a)."] },
        next: 5,
      },
      {
        id: 5,
        incoming: "Vamos pensar numa alternativa: o que você poderia tentar da próxima vez?",
        optionsL1: ["Respirar.", "Pedir ajuda."],
        optionsL2: ["Respirar.", "Pedir ajuda.", "Falar 'não gostei'.", "Fazer uma pausa."],
        level3: { template: "Da próxima vez eu posso {blank}.", placeholder: "respirar / pedir ajuda / fazer pausa", otherOption: "Eu posso pedir ajuda." },
        level4: { hint: "Dica: escolha uma estratégia.", chips: ["Respirar.", "Pedir ajuda.", "Fazer uma pausa.", "Falar com calma."] },
        next: 6,
      },
      {
        id: 6,
        incoming: "Ótimo. Quer treinar isso comigo agora?",
        optionsL1: ["Sim.", "Não."],
        optionsL2: ["Sim.", "Não.", "Um pouco.", "Depois."],
        level3: { template: "Eu quero {blank}.", placeholder: "sim / depois / um pouco", otherOption: "Sim, vamos." },
        level4: { hint: "Dica: aceite ou combine um momento.", chips: ["Sim, vamos.", "Um pouco.", "Depois."] },
        next: "END",
      },
    ],
  },

  {
    id: "solicitacao_pedir",
    title: "Solicitação (pedir algo que quer)",
    steps: [
      {
        id: 1,
        incoming: "Oi! Tudo bem? Posso te pedir uma coisa?",
        optionsL1: ["Posso.", "Queria pedir."],
        optionsL2: ["Posso.", "Queria pedir.", "Você pode me ajudar?", "Posso falar uma coisa?"],
        level3: { template: "Eu queria te pedir {blank}.", placeholder: "uma ajuda / uma coisa", otherOption: "Você pode me ajudar?" },
        level4: { hint: "Dica: peça permissão e fale com educação.", chips: ["Posso te pedir uma coisa?", "Você pode me ajudar?", "Posso falar uma coisa?"] },
        next: 2,
      },
      {
        id: 2,
        incoming: "Claro. O que você precisa?",
        optionsL1: ["Quero água.", "Quero brincar."],
        optionsL2: ["Quero água.", "Quero brincar.", "Quero ajuda na tarefa.", "Quero um tempo."],
        level3: { template: "Eu preciso de {blank}.", placeholder: "água / ajuda / um tempo", otherOption: "Quero ajuda na tarefa." },
        level4: { hint: "Dica: diga exatamente o que você quer.", chips: ["Eu quero água.", "Eu quero ajuda na tarefa.", "Eu quero um tempo."] },
        next: 3,
      },
      {
        id: 3,
        incoming: "Quando você quer isso?",
        optionsL1: ["Agora.", "Depois."],
        optionsL2: ["Agora.", "Depois.", "Mais tarde.", "Amanhã."],
        level3: { template: "Eu quero {blank}.", placeholder: "agora / depois / mais tarde", otherOption: "Agora, por favor." },
        level4: { hint: "Dica: fale o momento.", chips: ["Agora, por favor.", "Depois.", "Mais tarde."] },
        next: 4,
      },
      {
        id: 4,
        incoming: "Tudo bem. Tem mais alguma coisa?",
        optionsL1: ["Não.", "Sim."],
        optionsL2: ["Não.", "Sim.", "Só isso.", "Obrigado(a)."],
        level3: { template: "{blank}. Obrigado(a)!", placeholder: "Não / Só isso", otherOption: "Só isso, obrigado(a)!" },
        level4: { hint: "Dica: finalize com gratidão.", chips: ["Só isso. Obrigado(a)!", "Não, obrigado(a).", "Obrigado(a)!"] },
        next: "END",
      },
    ],
  },
];

// --------------------- UTIL ---------------------
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
function safeParseJSON(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e?.message || "JSON inválido" };
  }
}
function normalizeScript(script) {
  const s = { ...script };
  s.id = s.id || uid("script");
  s.title = s.title || "Novo cenário";
  s.steps = Array.isArray(s.steps) ? s.steps : [];

  s.steps = s.steps
    .map((st, idx) => ({
      id: Number.isFinite(st.id) ? st.id : idx + 1,
      incoming: st.incoming ?? "",
      optionsL1: Array.isArray(st.optionsL1) ? st.optionsL1.slice(0, 2) : ["", ""],
      optionsL2: Array.isArray(st.optionsL2) ? st.optionsL2.slice(0, 4) : ["", "", ""],
      level3: {
        template: st?.level3?.template ?? "Eu estou {blank}.",
        placeholder: st?.level3?.placeholder ?? "complete aqui",
        otherOption: st?.level3?.otherOption ?? "Ok.",
      },
      level4: {
        hint: st?.level4?.hint ?? "Dica: escreva uma resposta curta.",
        chips: Array.isArray(st?.level4?.chips) ? st.level4.chips.slice(0, 8) : [],
      },
      next: st.next ?? "END",
    }))
    .sort((a, b) => a.id - b.id);

  if (s.steps.length === 0) {
    s.steps = [
      {
        id: 1,
        incoming: "Oi",
        optionsL1: ["Oi", "Olá"],
        optionsL2: ["Oi", "Olá", "Oiê"],
        level3: { template: "Oi, {blank}!", placeholder: "nome", otherOption: "Olá! 🙂" },
        level4: { hint: "Dica: cumprimente.", chips: ["Oi!", "Olá 🙂"] },
        next: "END",
      },
    ];
  }
  return s;
}
function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function loadFromStorage(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = safeParseJSON(raw);
  if (!parsed.ok) return null;
  return parsed.value;
}
function msToSeconds(ms) {
  return Math.round((ms / 1000) * 10) / 10;
}
function toCSV(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const header = Object.keys(rows[0] || {});
  const lines = [header.map(esc).join(","), ...rows.map((r) => header.map((h) => esc(r[h])).join(","))];
  return lines.join("\n");
}
function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function hardResetApp() {
  try {
    localStorage.removeItem(STORAGE_SCRIPTS);
    localStorage.removeItem(STORAGE_SETTINGS);
    localStorage.removeItem(STORAGE_SESSION_LOG);
  } catch {}
  window.location.reload();
}

// --------------------- ANALÍTICA CLÍNICA (NOVO) ---------------------
function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function socialMarkers(text) {
  const t = String(text || "").toLowerCase();
  return {
    askBack: /(\be você\b|\be vc\b|\be tu\b|\be você\?\b|\be vc\?\b)/.test(t) || t.includes("?"),
    gratitude: /\b(obrigad|valeu|agradeç)\b/.test(t),
    help: /\b(me ajuda|me ajude|pode me ajudar|preciso de ajuda|me ajuda um pouco)\b/.test(t),
    justify: /\b(porque|por que|pois|é que|agora não|depois eu|mais tarde|não posso)\b/.test(t),
    greeting: /\b(oi|olá|oiê|bom dia|boa tarde|boa noite)\b/.test(t),
    assertiveRequest: /\b(posso|quero|eu preciso|poderia|você pode|me empresta|me dá|me passa)\b/.test(t),
  };
}

function summarizeSessionClinical(sessionObj) {
  const s = sessionObj || { events: [], attemptsInvalid: 0 };
  const events = Array.isArray(s.events) ? s.events : [];
  const invalid = s.attemptsInvalid || 0;

  const totalResponses = events.length;
  const avgLatencyMs = totalResponses === 0 ? 0 : Math.round(events.reduce((a, e) => a + (e.latencyMs || 0), 0) / totalResponses);

  const byType = events.reduce(
    (acc, e) => {
      acc[e.responseType] = (acc[e.responseType] || 0) + 1;
      return acc;
    },
    { button: 0, fill: 0, free: 0 }
  );

  // Rigidez: mesma opção repetida (somente button)
  const buttonEvents = events.filter((e) => e.responseType === "button");
  const counts = {};
  for (const e of buttonEvents) {
    const k = `${e.stepId}:${e.optionIndex ?? ""}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  let maxKey = null, maxCount = 0;
  for (const k of Object.keys(counts)) {
    if (counts[k] > maxCount) { maxKey = k; maxCount = counts[k]; }
  }
  const rigidityRatio = buttonEvents.length === 0 ? 0 : maxCount / buttonEvents.length;

  // Variação: respostas únicas
  const uniqueResponses = new Set(events.map((e) => String(e.responseText || "").trim().toLowerCase()).filter(Boolean));
  const variationRatio = totalResponses === 0 ? 0 : uniqueResponses.size / totalResponses;

  // Qualidade do N3 (fill): preenchimentos “funcionais” (>=2 palavras OU pelo menos 6 chars)
  const fillEvents = events.filter((e) => e.responseType === "fill");
  const fillOk = fillEvents.filter((e) => {
    const rt = String(e.responseText || "").trim();
    const w = countWords(rt);
    return rt.length >= 6 || w >= 2;
  }).length;
  const fillQuality = fillEvents.length === 0 ? null : (fillOk / fillEvents.length);

  // Qualidade do N4 (free): respostas com >=3 palavras e com pelo menos 1 marcador social
  const freeEvents = events.filter((e) => e.responseType === "free");
  let freeFunctional = 0;
  let freeWithMarkers = 0;
  const markerTotals = { askBack: 0, gratitude: 0, help: 0, justify: 0, greeting: 0, assertiveRequest: 0 };
  for (const e of freeEvents) {
    const txt = String(e.responseText || "");
    const m = socialMarkers(txt);
    Object.keys(markerTotals).forEach((k) => { if (m[k]) markerTotals[k] += 1; });

    const w = countWords(txt);
    const hasAnyMarker = Object.values(m).some(Boolean);
    if (w >= 3) freeFunctional += 1;
    if (hasAnyMarker) freeWithMarkers += 1;
  }
  const freeQuality = freeEvents.length === 0 ? null : (freeFunctional / freeEvents.length);
  const freeMarkersRatio = freeEvents.length === 0 ? null : (freeWithMarkers / freeEvents.length);

  // Regra simples de “desempenho estável”
  const validTotal = totalResponses + invalid;
  const validRatio = validTotal === 0 ? 0 : totalResponses / validTotal;

  // recomendação de nível (objetiva e conservadora)
  const rec = recommendLevelChange({
    levelAtStart: s.levelAtStart,
    avgLatencyMs,
    invalidAttempts: invalid,
    validRatio,
    rigidityRatio,
    variationRatio,
    fillQuality,
    freeQuality,
    freeMarkersRatio,
    markerTotals,
    totalResponses,
  });

  // observações automáticas
  const observations = [];
  if (totalResponses === 0) observations.push("Sessão sem respostas registradas (possível evasão, dificuldade de engajamento ou interrupção do uso).");
  if (avgLatencyMs > 12000) observations.push("Latência média elevada (possível ansiedade, bloqueio, dificuldade de iniciar ou maior demanda cognitiva).");
  if (invalid >= 3) observations.push("Aumento de tentativas inválidas (pode indicar frustração, evitação ou necessidade de maior suporte/prompt).");
  if (rigidityRatio >= 0.7 && buttonEvents.length >= 6) observations.push("Padrão de rigidez: repetição frequente da mesma opção (preferência por previsibilidade / repertório restrito).");
  if (variationRatio >= 0.6 && totalResponses >= 6) observations.push("Boa variação de respostas (maior flexibilidade e repertório mais amplo).");
  if ((markerTotals.askBack || 0) >= 2) observations.push("Presença de devolutiva social (pergunta de volta), indicando reciprocidade conversacional em desenvolvimento.");
  if ((markerTotals.gratitude || 0) >= 1) observations.push("Uso de agradecimento/educação social observado.");
  if ((markerTotals.help || 0) >= 1) observations.push("Uso funcional de pedido de ajuda observado (assertividade/solicitação).");
  if ((markerTotals.justify || 0) >= 1) observations.push("Presença de justificativas/negociação de tempo (habilidade pragmática e flexibilidade).");

  return {
    totalResponses,
    avgLatencyMs,
    invalidAttempts: invalid,
    byType,
    rigidityRatio,
    variationRatio,
    fillQuality,
    freeQuality,
    freeMarkersRatio,
    markerTotals,
    validRatio,
    rec,
    observations,
  };
}

function recommendLevelChange(metrics) {
  const lvl = Number(metrics.levelAtStart || 1);

  // thresholds “clínicos” (ajustáveis)
  const goodLatency = metrics.avgLatencyMs <= 10000; // 10s
  const lowInvalid = metrics.invalidAttempts <= 1;
  const okValid = metrics.validRatio >= 0.8;
  const lowRigidity = metrics.rigidityRatio < 0.7;
  const okVariation = metrics.variationRatio >= 0.45;

  const fillOk = metrics.fillQuality == null ? true : metrics.fillQuality >= 0.75;
  const freeOk = metrics.freeQuality == null ? true : metrics.freeQuality >= 0.7;
  const freeMarkersOk = metrics.freeMarkersRatio == null ? true : metrics.freeMarkersRatio >= 0.4;

  const shouldHold = !(okValid && lowInvalid && goodLatency);
  if (shouldHold) {
    // se piorou muito, sugerir reduzir
    if (metrics.invalidAttempts >= 4 || metrics.avgLatencyMs >= 20000) {
      return { action: "voltar", toLevel: Math.max(1, lvl - 1), reason: "Alta demanda: muitas tentativas inválidas e/ou latência elevada." };
    }
    return { action: "manter", toLevel: lvl, reason: "Ainda precisa estabilizar engajamento/fluência no nível atual." };
  }

  // Se está estável, avaliar subir
  if (lvl === 1) {
    return { action: "subir", toLevel: 2, reason: "Estável em suporte total: boa taxa de respostas, poucas falhas e latência adequada." };
  }
  if (lvl === 2) {
    if (lowRigidity && okVariation) {
      return { action: "subir", toLevel: 3, reason: "Boa flexibilidade e variação; indicado iniciar produção guiada (completar frases)." };
    }
    return { action: "manter", toLevel: 2, reason: "Apesar de estável, ainda há sinais de rigidez/baixa variação; manter para ampliar repertório antes do N3." };
  }
  if (lvl === 3) {
    if (fillOk && lowInvalid && goodLatency) {
      return { action: "subir", toLevel: 4, reason: "Produção guiada funcional (N3) com boa qualidade; indicado iniciar digitação livre com dicas." };
    }
    return { action: "manter", toLevel: 3, reason: "Manter para consolidar completar frases (qualidade/consistência) antes do livre." };
  }
  if (lvl === 4) {
    if (freeOk && freeMarkersOk) {
      return { action: "manter", toLevel: 4, reason: "Boa funcionalidade no livre; foco passa a ser generalização e variação de marcadores sociais." };
    }
    return { action: "manter", toLevel: 4, reason: "No livre, aumentar estrutura (chips/dicas) e reforçar marcadores sociais (pergunta de volta, gratidão, pedido, justificativa)." };
  }
  return { action: "manter", toLevel: lvl, reason: "Sem recomendação específica." };
}

// --------------------- STYLES ---------------------
const styles = {
  app: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#0b141a",
    color: "#e9edef",
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
  },
  header: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#111b21",
    flexWrap: "wrap",
    userSelect: "none",
  },
  titleSmall: { fontSize: 12, opacity: 0.85 },
  select: {
    background: "#0b141a",
    color: "#e9edef",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 10,
    padding: "8px 10px",
    outline: "none",
  },
  button: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b141a",
    color: "#e9edef",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  buttonDanger: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.10)",
    color: "#ffd2d2",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  chatArea: {
    flex: 1,
    overflow: "auto",
    padding: "14px 12px",
    background: "radial-gradient(circle at top, rgba(255,255,255,0.04), rgba(0,0,0,0) 55%)",
  },
  rowIncoming: { display: "flex", justifyContent: "flex-start", margin: "8px 0" },
  rowOutgoing: { display: "flex", justifyContent: "flex-end", margin: "8px 0" },
  bubbleIncoming: {
    maxWidth: "80%",
    background: "#202c33",
    padding: "10px 12px",
    borderRadius: 16,
    borderTopLeftRadius: 6,
    lineHeight: 1.25,
    boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
    whiteSpace: "pre-wrap",
  },
  bubbleOutgoing: {
    maxWidth: "80%",
    background: "#005c4b",
    padding: "10px 12px",
    borderRadius: 16,
    borderTopRightRadius: 6,
    lineHeight: 1.25,
    boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
    whiteSpace: "pre-wrap",
  },
  footer: {
    padding: "10px 12px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "#111b21",
  },
  optionsWrap: { display: "grid", gap: 10 },
  optionBtn: {
    padding: "14px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b141a",
    color: "#e9edef",
    cursor: "pointer",
    fontSize: 15,
    textAlign: "center",
    minHeight: 52,
  },
  optionBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
  smallBar: {
    display: "flex",
    gap: 10,
    marginTop: 10,
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  hint: { fontSize: 12, opacity: 0.75 },
  inputRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 },
  input: {
    flex: 1,
    minWidth: 220,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b141a",
    color: "#e9edef",
    outline: "none",
    fontSize: 15,
  },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  chip: {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b141a",
    cursor: "pointer",
    fontSize: 13,
    opacity: 0.95,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(1200px, 100%)",
    maxHeight: "90vh",
    overflow: "auto",
    background: "#0f1a20",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
  },
  panelRow: { display: "grid", gridTemplateColumns: "340px 1fr", gap: 12 },
  card: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 12,
    background: "rgba(255,255,255,0.03)",
  },
  label: { fontSize: 12, opacity: 0.85, marginBottom: 6 },
  textarea: {
    width: "100%",
    minHeight: 90,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b141a",
    color: "#e9edef",
    outline: "none",
    fontSize: 14,
    resize: "vertical",
  },
  smallInput: {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b141a",
    color: "#e9edef",
    outline: "none",
    fontSize: 14,
  },
  listItem: (active) => ({
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(0,92,75,0.35)" : "rgba(255,255,255,0.03)",
    cursor: "pointer",
    marginBottom: 8,
  }),
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 },
  thtd: { borderBottom: "1px solid rgba(255,255,255,0.10)", padding: "8px 6px", verticalAlign: "top" },
};

// --------------------- ERROR BOUNDARY ---------------------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message || error) };
  }
  componentDidCatch(error) {
    console.error("App crashed:", error);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ ...styles.app, padding: 16 }}>
        <div style={{ ...styles.card, maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>O app encontrou um erro</div>
          <div style={{ opacity: 0.9, marginBottom: 8 }}>
            Isso evita “tela branca”. Você pode resetar o armazenamento e voltar ao normal.
          </div>
          <div style={{ ...styles.card, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontWeight: 700 }}>Mensagem</div>
            <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: 6 }}>{this.state.message}</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button style={styles.buttonDanger} onClick={hardResetApp}>Resetar app (limpar dados)</button>
            <button style={styles.button} onClick={() => window.location.reload()}>Recarregar</button>
          </div>
        </div>
      </div>
    );
  }
}

// --------------------- APP ---------------------
function AppInner() {
  const [scripts, setScripts] = useState(() => {
    const loaded = loadFromStorage(STORAGE_SCRIPTS);
    if (Array.isArray(loaded) && loaded.length) {
      const norm = loaded.map(normalizeScript);
      return norm.length ? norm : DEFAULT_SCRIPTS.map(normalizeScript);
    }
    return DEFAULT_SCRIPTS.map(normalizeScript);
  });
  useEffect(() => {
    if (!Array.isArray(scripts) || scripts.length === 0) setScripts(DEFAULT_SCRIPTS.map(normalizeScript));
  }, [scripts]);
  useEffect(() => saveToStorage(STORAGE_SCRIPTS, scripts), [scripts]);

  const [settings, setSettings] = useState(() => {
    const loaded = loadFromStorage(STORAGE_SETTINGS);
    if (loaded && typeof loaded === "object") return { childMode: !!loaded.childMode };
    return { childMode: false };
  });
  useEffect(() => saveToStorage(STORAGE_SETTINGS, settings), [settings]);

  const firstScriptId = scripts[0]?.id || DEFAULT_SCRIPTS[0].id;
  const [scriptId, setScriptId] = useState(firstScriptId);
  const [level, setLevel] = useState(1);

  useEffect(() => {
    const exists = scripts.some((s) => s.id === scriptId);
    if (!exists) setScriptId(scripts[0]?.id || firstScriptId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scripts]);

  const script = useMemo(() => scripts.find((s) => s.id === scriptId) || scripts[0] || DEFAULT_SCRIPTS[0], [scripts, scriptId]);

  const stepsById = useMemo(() => {
    const m = new Map();
    const steps = Array.isArray(script?.steps) ? script.steps : [];
    for (const st of steps) m.set(st.id, st);
    return m;
  }, [script]);

  const safeFirstStepId = script?.steps?.[0]?.id ?? 1;
  const [currentStepId, setCurrentStepId] = useState(safeFirstStepId);
  const [history, setHistory] = useState([]);
  const [isEnded, setIsEnded] = useState(false);

  const [fillText, setFillText] = useState("");
  const [freeText, setFreeText] = useState("");

  const chatEndRef = useRef(null);

  const [session, setSession] = useState(() => ({
    sessionId: uid("session"),
    startedAt: Date.now(),
    endedAt: null,
    scriptId,
    scriptTitle: script?.title || "",
    levelAtStart: level,
    attemptsInvalid: 0,
    events: [],
  }));

  const incomingShownAtRef = useRef(Date.now());

  function startNewSession(nextScriptId, nextLevel) {
    setSession({
      sessionId: uid("session"),
      startedAt: Date.now(),
      endedAt: null,
      scriptId: nextScriptId,
      scriptTitle: scripts.find((s) => s.id === nextScriptId)?.title || "",
      levelAtStart: nextLevel,
      attemptsInvalid: 0,
      events: [],
    });
  }

  function resetConversation({ newSession = true } = {}) {
    setHistory([]);
    setCurrentStepId(script?.steps?.[0]?.id ?? 1);
    setIsEnded(false);
    setFillText("");
    setFreeText("");
    incomingShownAtRef.current = Date.now();
    if (newSession) startNewSession(scriptId, level);
  }

  useEffect(() => {
    resetConversation({ newSession: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId]);

  useEffect(() => {
    if (!stepsById.get(currentStepId)) setCurrentStepId(script?.steps?.[0]?.id ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, stepsById]);

  useEffect(() => {
    setFillText("");
    setFreeText("");
  }, [level, currentStepId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  useEffect(() => {
    const step = stepsById.get(currentStepId);
    if (!step) return;
    setIsEnded(false);

    setHistory((prev) => {
      const last = prev[prev.length - 1];
      const alreadyHasIncoming = last?.type === "in" && last?.text === step.incoming;
      if (alreadyHasIncoming) return prev;
      incomingShownAtRef.current = Date.now();
      return [...prev, { type: "in", text: step.incoming, ts: Date.now() }];
    });
  }, [currentStepId, stepsById]);

  function computeNext(step, optionIndex) {
    const nxt = step.next;
    if (nxt === "END") return "END";
    if (typeof nxt === "number") return nxt;
    if (typeof nxt === "object" && nxt) return nxt[String(optionIndex)] ?? nxt[optionIndex] ?? "END";
    return "END";
  }

  const [sessionLog, setSessionLog] = useState(() => {
    const log = loadFromStorage(STORAGE_SESSION_LOG);
    return Array.isArray(log) ? log : [];
  });
  useEffect(() => saveToStorage(STORAGE_SESSION_LOG, sessionLog), [sessionLog]);

  function finalizeAndSaveSession(reason = "ended") {
    setSession((prev) => {
      const ended = { ...prev, endedAt: Date.now(), endReason: reason };
      const analysis = summarizeSessionClinical(ended);
      const withAnalysis = { ...ended, analysis };

      try {
        const arr = Array.isArray(sessionLog) ? sessionLog.slice() : [];
        arr.push(withAnalysis);
        const clipped = arr.slice(-400);
        setSessionLog(clipped);
        saveToStorage(STORAGE_SESSION_LOG, clipped);
      } catch {}

      return withAnalysis;
    });
  }

  function advanceTo(nextId) {
    setTimeout(() => {
      if (nextId === "END" || nextId == null) {
        setIsEnded(true);
        return;
      }
      if (!stepsById.get(nextId)) {
        setIsEnded(true);
        return;
      }
      setCurrentStepId(nextId);
    }, 450);
  }

  function registerEvent({ stepId, incoming, responseText, levelUsed, responseType, optionIndex }) {
    const now = Date.now();
    const latencyMs = Math.max(0, now - (incomingShownAtRef.current || now));

    setSession((prev) => ({
      ...prev,
      scriptId,
      scriptTitle: script?.title || prev.scriptTitle,
      events: [
        ...prev.events,
        {
          ts: now,
          stepId,
          incoming,
          responseText,
          levelUsed,
          responseType,
          optionIndex: optionIndex ?? null,
          latencyMs,
        },
      ],
    }));
  }

  function registerInvalidAttempt() {
    setSession((prev) => ({ ...prev, attemptsInvalid: (prev.attemptsInvalid || 0) + 1 }));
  }

  function sendMessageAndAdvance({ text, optionIndexForNext = 0, responseType }) {
    const step = stepsById.get(currentStepId);
    if (!step || isEnded) return;

    const cleaned = (text ?? "").trim();
    if (!cleaned) {
      registerInvalidAttempt();
      return;
    }

    setHistory((prev) => [...prev, { type: "out", text: cleaned, ts: Date.now() }]);

    registerEvent({
      stepId: step.id,
      incoming: step.incoming,
      responseText: cleaned,
      levelUsed: level,
      responseType,
      optionIndex: optionIndexForNext,
    });

    const nextId = computeNext(step, optionIndexForNext);
    if (nextId === "END" || nextId == null) finalizeAndSaveSession("ended");
    advanceTo(nextId);
  }

  const step = stepsById.get(currentStepId);
  const disabled = isEnded || !step;

  const optionsForButtons = useMemo(() => {
    if (!step) return [];
    if (level === 1) return (step.optionsL1 || []).slice(0, 2);
    if (level === 2) return (step.optionsL2 || []).slice(0, 4);
    if (level === 3) {
      const t = step.level3?.template ?? "Eu estou {blank}.";
      const other = step.level3?.otherOption ?? "Ok.";
      return [t, other];
    }
    return [];
  }, [step, level]);

  function renderFooterContent() {
    if (!step) return null;

    if (level === 4) {
      const hint = step.level4?.hint ?? "Dica: escreva uma resposta curta.";
      const chips = step.level4?.chips ?? [];
      return (
        <>
          <div style={styles.hint}>{hint}</div>
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Digite sua resposta..."
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendMessageAndAdvance({ text: freeText, optionIndexForNext: 0, responseType: "free" });
                  setFreeText("");
                }
              }}
            />
            <button
              style={{ ...styles.optionBtn, width: 140, ...(disabled ? styles.optionBtnDisabled : {}) }}
              disabled={disabled}
              onClick={() => {
                sendMessageAndAdvance({ text: freeText, optionIndexForNext: 0, responseType: "free" });
                setFreeText("");
              }}
            >
              Enviar
            </button>
          </div>

          {chips.length > 0 && (
            <div style={styles.chipRow}>
              {chips.map((c, idx) => (
                <div
                  key={c + idx}
                  style={styles.chip}
                  onClick={() => setFreeText((prev) => (prev ? prev + " " + c : c))}
                  role="button"
                  tabIndex={0}
                >
                  {c}
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    if (level === 3) {
      const template = step.level3?.template ?? "Eu estou {blank}.";
      const placeholder = step.level3?.placeholder ?? "complete aqui";
      const otherOption = step.level3?.otherOption ?? "Ok.";
      const preview = template.replace("{blank}", fillText || "_____");

      return (
        <>
          <div style={styles.hint}>Complete a frase (ou escolha a outra resposta).</div>

          <div style={styles.inputRow}>
            <input
              style={styles.input}
              value={fillText}
              onChange={(e) => setFillText(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!(fillText || "").trim()) {
                    registerInvalidAttempt();
                    return;
                  }
                  const msg = template.replace("{blank}", fillText.trim());
                  sendMessageAndAdvance({ text: msg, optionIndexForNext: 0, responseType: "fill" });
                  setFillText("");
                }
              }}
            />
          </div>

          <div style={{ ...styles.optionsWrap, gridTemplateColumns: "1fr 1fr" }}>
            <button
              style={{ ...styles.optionBtn, ...(disabled ? styles.optionBtnDisabled : {}) }}
              disabled={disabled}
              onClick={() => {
                if (!(fillText || "").trim()) {
                  registerInvalidAttempt();
                  return;
                }
                const msg = template.replace("{blank}", fillText.trim());
                sendMessageAndAdvance({ text: msg, optionIndexForNext: 0, responseType: "fill" });
                setFillText("");
              }}
            >
              {preview}
            </button>

            <button
              style={{ ...styles.optionBtn, ...(disabled ? styles.optionBtnDisabled : {}) }}
              disabled={disabled}
              onClick={() => sendMessageAndAdvance({ text: otherOption, optionIndexForNext: 1, responseType: "button" })}
            >
              {otherOption}
            </button>
          </div>
        </>
      );
    }

    return (
      <div style={{ ...styles.optionsWrap, gridTemplateColumns: "1fr 1fr" }}>
        {optionsForButtons.map((opt, idx) => (
          <button
            key={opt + idx}
            style={{ ...styles.optionBtn, ...(disabled ? styles.optionBtnDisabled : {}) }}
            disabled={disabled}
            onClick={() => sendMessageAndAdvance({ text: opt, optionIndexForNext: idx, responseType: "button" })}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  // --------------------- MODO TERAPEUTA ---------------------
  const [therapistOpen, setTherapistOpen] = useState(false);
  const [therapistAuthed, setTherapistAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState("relatorio"); // relatorio | historico | roteiros

  const [editingScriptId, setEditingScriptId] = useState(script.id);
  const editingScript = useMemo(() => scripts.find((s) => s.id === editingScriptId) || scripts[0], [scripts, editingScriptId]);

  const [editingStepId, setEditingStepId] = useState(() => editingScript?.steps?.[0]?.id || 1);
  const editingStep = useMemo(
    () => editingScript?.steps?.find((st) => st.id === editingStepId) || editingScript?.steps?.[0],
    [editingScript, editingStepId]
  );

  const [importText, setImportText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const [selectedLogId, setSelectedLogId] = useState(null);
  const selectedLog = useMemo(() => sessionLog.find((s) => s.sessionId === selectedLogId) || null, [sessionLog, selectedLogId]);

  useEffect(() => {
    if (!therapistOpen) {
      setStatusMsg("");
      setImportText("");
      setPin("");
      setTab("relatorio");
    } else {
      setEditingScriptId(script.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [therapistOpen]);

  useEffect(() => {
    if (therapistOpen) setEditingStepId(editingScript?.steps?.[0]?.id || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingScriptId]);

  function openTherapist() {
    setTherapistOpen(true);
    setStatusMsg("");
  }
  function closeTherapist() {
    setTherapistOpen(false);
  }
  function authPin() {
    if (pin === THERAPIST_PIN) {
      setTherapistAuthed(true);
      setStatusMsg("");
    } else {
      setTherapistAuthed(false);
      setStatusMsg("PIN incorreto.");
    }
  }
  function logoutTherapist() {
    setTherapistAuthed(false);
    setPin("");
    setStatusMsg("");
  }

  function updateScripts(updater) {
    setScripts((prev) => {
      const next = updater(prev.map(normalizeScript)).map(normalizeScript);
      return next.length ? next : DEFAULT_SCRIPTS.map(normalizeScript);
    });
  }

  function addScenario() {
    const newScript = normalizeScript({
      id: uid("scenario"),
      title: "Novo cenário",
      steps: [
        {
          id: 1,
          incoming: "Mensagem recebida",
          optionsL1: ["Resposta 1", "Resposta 2"],
          optionsL2: ["Resposta 1", "Resposta 2", "Resposta 3"],
          level3: { template: "Eu estou {blank}.", placeholder: "complete aqui", otherOption: "Ok." },
          level4: { hint: "Dica: escreva uma resposta curta.", chips: ["Oi", "Tudo bem?"] },
          next: "END",
        },
      ],
    });
    updateScripts((prev) => [...prev, newScript]);
    setEditingScriptId(newScript.id);
    setStatusMsg("Cenário criado.");
  }

  function deleteScenario(idToDelete) {
    if (scripts.length <= 1) {
      setStatusMsg("Não é possível excluir o único cenário.");
      return;
    }
    updateScripts((prev) => prev.filter((s) => s.id !== idToDelete));
    setStatusMsg("Cenário excluído.");
    if (idToDelete === scriptId) {
      const remaining = scripts.filter((s) => s.id !== idToDelete);
      if (remaining[0]) setScriptId(remaining[0].id);
    }
  }

  function setScenarioTitle(id, title) {
    updateScripts((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  function addStep() {
    const nextId = Math.max(...editingScript.steps.map((s) => s.id)) + 1;
    const newStep = {
      id: nextId,
      incoming: "Nova mensagem recebida",
      optionsL1: ["Resposta 1", "Resposta 2"],
      optionsL2: ["Resposta 1", "Resposta 2", "Resposta 3"],
      level3: { template: "Eu estou {blank}.", placeholder: "complete aqui", otherOption: "Ok." },
      level4: { hint: "Dica: escreva uma resposta curta.", chips: ["Ok", "Tudo bem"] },
      next: "END",
    };
    updateScripts((prev) =>
      prev.map((sc) => (sc.id === editingScript.id ? { ...sc, steps: [...sc.steps, newStep].sort((a, b) => a.id - b.id) } : sc))
    );
    setEditingStepId(nextId);
    setStatusMsg("Step adicionado.");
  }

  function deleteStep(stepIdToDelete) {
    if (editingScript.steps.length <= 1) {
      setStatusMsg("Não é possível excluir o único step do cenário.");
      return;
    }
    updateScripts((prev) =>
      prev.map((sc) => {
        if (sc.id !== editingScript.id) return sc;
        const filtered = sc.steps.filter((st) => st.id !== stepIdToDelete);
        return { ...sc, steps: filtered.sort((a, b) => a.id - b.id) };
      })
    );
    const remainingSteps = editingScript.steps.filter((st) => st.id !== stepIdToDelete);
    setEditingStepId(remainingSteps[0]?.id || 1);
    setStatusMsg("Step excluído.");
  }

  function patchStep(patch) {
    updateScripts((prev) =>
      prev.map((sc) => (sc.id === editingScript.id ? { ...sc, steps: sc.steps.map((st) => (st.id === editingStep.id ? { ...st, ...patch } : st)) } : sc))
    );
  }

  function patchStepDeep(path, value) {
    const current = editingStep;
    if (!current) return;
    const cloned = JSON.parse(JSON.stringify(current));
    let obj = cloned;
    for (let i = 0; i < path.length - 1; i++) {
      if (obj[path[i]] == null) obj[path[i]] = {};
      obj = obj[path[i]];
    }
    obj[path[path.length - 1]] = value;
    patchStep(cloned);
  }

  function parseLines(text) {
    return (text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  }

  function formatNextField(next) {
    if (next === "END") return "END";
    if (typeof next === "number") return String(next);
    if (typeof next === "object" && next) return JSON.stringify(next, null, 2);
    return "END";
  }

  function parseNextField(text) {
    const t = (text || "").trim();
    if (!t) return "END";
    if (t.toUpperCase() === "END") return "END";
    if (/^\d+$/.test(t)) return Number(t);
    const parsed = safeParseJSON(t);
    if (parsed.ok && typeof parsed.value === "object" && parsed.value) return parsed.value;
    return null;
  }

  function exportScripts() {
    const json = JSON.stringify(scripts, null, 2);
    navigator.clipboard?.writeText(json);
    setStatusMsg("Roteiros exportados (JSON copiado).");
  }

  function importScripts() {
    const parsed = safeParseJSON(importText);
    if (!parsed.ok) return setStatusMsg(`Erro ao importar: ${parsed.error}`);
    if (!Array.isArray(parsed.value)) return setStatusMsg("Erro: o JSON precisa ser um array de cenários.");
    const normalized = parsed.value.map(normalizeScript);
    setScripts(normalized.length ? normalized : DEFAULT_SCRIPTS.map(normalizeScript));
    setStatusMsg("Importação concluída.");
    setScriptId((normalized[0]?.id) || DEFAULT_SCRIPTS[0].id);
    setEditingScriptId((normalized[0]?.id) || DEFAULT_SCRIPTS[0].id);
  }

  function exportSessionCSV(sessionToExport) {
    const s = sessionToExport || session;
    const rows = (s.events || []).map((e) => ({
      sessionId: s.sessionId,
      startedAtISO: new Date(s.startedAt).toISOString(),
      endedAtISO: s.endedAt ? new Date(s.endedAt).toISOString() : "",
      scriptId: s.scriptId,
      scriptTitle: s.scriptTitle,
      levelAtStart: s.levelAtStart,
      stepId: e.stepId,
      levelUsed: e.levelUsed,
      responseType: e.responseType,
      optionIndex: e.optionIndex ?? "",
      latencySeconds: msToSeconds(e.latencyMs),
      incoming: e.incoming,
      responseText: e.responseText,
      tsISO: new Date(e.ts).toISOString(),
    }));
    if (rows.length === 0) {
      setStatusMsg("Não há respostas para exportar.");
      return;
    }
    const csv = toCSV(rows);
    downloadTextFile(`relatorio_sessao_${s.sessionId}.csv`, csv, "text/csv;charset=utf-8");
    setStatusMsg("Relatório CSV baixado.");
  }

  function copySessionJSON(sessionToCopy) {
    const json = JSON.stringify(sessionToCopy || session, null, 2);
    navigator.clipboard?.writeText(json);
    setStatusMsg("Sessão copiada em JSON.");
  }

  function exportAllSessionsCSV() {
    if (!sessionLog.length) return setStatusMsg("Não há histórico de sessões.");
    const rows = sessionLog.flatMap((s) =>
      (s.events || []).map((e) => ({
        sessionId: s.sessionId,
        startedAtISO: new Date(s.startedAt).toISOString(),
        endedAtISO: s.endedAt ? new Date(s.endedAt).toISOString() : "",
        scriptId: s.scriptId,
        scriptTitle: s.scriptTitle,
        levelAtStart: s.levelAtStart,
        stepId: e.stepId,
        levelUsed: e.levelUsed,
        responseType: e.responseType,
        optionIndex: e.optionIndex ?? "",
        latencySeconds: msToSeconds(e.latencyMs),
        incoming: e.incoming,
        responseText: e.responseText,
        tsISO: new Date(e.ts).toISOString(),
      }))
    );
    const csv = toCSV(rows);
    downloadTextFile(`historico_sessoes.csv`, csv, "text/csv;charset=utf-8");
    setStatusMsg("Histórico CSV baixado.");
  }

  function clearSessionHistory() {
    setSessionLog([]);
    setSelectedLogId(null);
    saveToStorage(STORAGE_SESSION_LOG, []);
    setStatusMsg("Histórico de sessões apagado.");
  }

  // --------------------- GESTO OCULTO ---------------------
  const longPressTimerRef = useRef(null);
  function startLongPress() {
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => openTherapist(), LONG_PRESS_MS);
  }
  function clearLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // Análise da sessão atual (ao vivo)
  const currentAnalysis = useMemo(() => summarizeSessionClinical(session), [session]);

  return (
    <div style={styles.app}>
      <div
        style={styles.header}
        onMouseDown={startLongPress}
        onMouseUp={clearLongPress}
        onMouseLeave={clearLongPress}
        onTouchStart={startLongPress}
        onTouchEnd={clearLongPress}
      >
        <div>
          <div style={{ fontWeight: 700 }}>Treino de Conversa</div>
          <div style={styles.titleSmall}>{script?.title || ""}</div>
        </div>

        {!settings.childMode && (
          <>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={styles.titleSmall}>Cenário</span>
              <select style={styles.select} value={scriptId} onChange={(e) => setScriptId(e.target.value)}>
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={styles.titleSmall}>Nível</span>
              <select
                style={styles.select}
                value={level}
                onChange={(e) => {
                  const nextLvl = Number(e.target.value);
                  setLevel(nextLvl);
                  startNewSession(scriptId, nextLvl);
                }}
              >
                <option value={1}>Nível 1</option>
                <option value={2}>Nível 2</option>
                <option value={3}>Nível 3</option>
                <option value={4}>Nível 4</option>
              </select>
            </label>
          </>
        )}

        {!settings.childMode && (
          <button style={styles.button} onClick={openTherapist}>Modo Terapeuta</button>
        )}
      </div>

      <div style={styles.chatArea}>
        {history.map((m, idx) => (
          <div key={m.ts + ":" + idx} style={m.type === "in" ? styles.rowIncoming : styles.rowOutgoing}>
            <div style={m.type === "in" ? styles.bubbleIncoming : styles.bubbleOutgoing}>{m.text}</div>
          </div>
        ))}

        {isEnded && <div style={{ marginTop: 14, opacity: 0.85, fontSize: 13 }}>Conversa finalizada ✅</div>}
        <div ref={chatEndRef} />
      </div>

      <div style={styles.footer}>
        {renderFooterContent()}
        <div style={styles.smallBar}>
          <button
            style={styles.button}
            onClick={() => {
              finalizeAndSaveSession("manual_reset");
              resetConversation({ newSession: true });
            }}
          >
            Reiniciar sessão
          </button>

          <div style={styles.hint}>
            {level === 1 && "N1: escolha 1 das 2 respostas."}
            {level === 2 && "N2: escolha 1 resposta entre 3–4."}
            {level === 3 && "N3: complete a frase ou escolha a opção pronta."}
            {level === 4 && "N4: responda digitando livremente (com dicas)."}
          </div>
        </div>
      </div>

      {therapistOpen && (
        <div style={styles.modalBackdrop} onMouseDown={(e) => e.target === e.currentTarget && closeTherapist()}>
          <div style={styles.modal}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 750, fontSize: 16 }}>Modo Terapeuta</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {therapistAuthed ? (
                  <>
                    <button style={styles.button} onClick={exportScripts}>Exportar roteiros</button>
                    <button style={styles.button} onClick={() => exportSessionCSV(session)}>Exportar sessão atual (CSV)</button>
                    <button style={styles.button} onClick={() => copySessionJSON(session)}>Copiar sessão atual (JSON)</button>
                    <button style={styles.buttonDanger} onClick={hardResetApp}>Resetar app</button>
                    <button style={styles.button} onClick={logoutTherapist}>Sair</button>
                  </>
                ) : null}
                <button style={styles.button} onClick={closeTherapist}>Fechar</button>
              </div>
            </div>

            {!therapistAuthed ? (
              <div style={{ ...styles.card, marginTop: 12 }}>
                <div style={styles.label}>Digite o PIN para ver relatórios e editar roteiros</div>
                <div style={styles.inputRow}>
                  <input
                    style={styles.input}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="PIN"
                    type="password"
                  />
                  <button style={styles.button} onClick={authPin}>Entrar</button>
                </div>
                {statusMsg ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>{statusMsg}</div> : null}
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                  Acesso oculto: segure o título <b>“Treino de Conversa”</b> por {LONG_PRESS_MS / 1000}s.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                {statusMsg ? <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.9 }}>{statusMsg}</div> : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    style={{ ...styles.button, ...(tab === "relatorio" ? { background: "rgba(0,92,75,0.35)" } : {}) }}
                    onClick={() => setTab("relatorio")}
                  >
                    Relatório (sessão atual)
                  </button>
                  <button
                    style={{ ...styles.button, ...(tab === "historico" ? { background: "rgba(0,92,75,0.35)" } : {}) }}
                    onClick={() => setTab("historico")}
                  >
                    Histórico do paciente
                  </button>
                  <button
                    style={{ ...styles.button, ...(tab === "roteiros" ? { background: "rgba(0,92,75,0.35)" } : {}) }}
                    onClick={() => setTab("roteiros")}
                  >
                    Roteiros (editar)
                  </button>
                </div>

                {/* RELATÓRIO (sessão atual) com análises clínicas e recomendação de nível */}
                {tab === "relatorio" && (
                  <div style={{ ...styles.card, marginTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>Relatório clínico (sessão atual)</div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                      Sessão: <code>{session.sessionId}</code> — cenário: <b>{session.scriptTitle}</b> — nível inicial: <b>N{session.levelAtStart}</b>
                    </div>

                    <table style={styles.table}>
                      <tbody>
                        <tr>
                          <td style={styles.thtd}>Respostas</td>
                          <td style={styles.thtd}><b>{currentAnalysis.totalResponses}</b></td>
                          <td style={styles.thtd}>Tentativas inválidas</td>
                          <td style={styles.thtd}><b>{currentAnalysis.invalidAttempts}</b></td>
                        </tr>
                        <tr>
                          <td style={styles.thtd}>Tempo médio de resposta</td>
                          <td style={styles.thtd}><b>{msToSeconds(currentAnalysis.avgLatencyMs)}s</b></td>
                          <td style={styles.thtd}>Tipos</td>
                          <td style={styles.thtd}>
                            Botão: {currentAnalysis.byType.button} • Completar: {currentAnalysis.byType.fill} • Livre: {currentAnalysis.byType.free}
                          </td>
                        </tr>
                        <tr>
                          <td style={styles.thtd}>Rigidez (repetição)</td>
                          <td style={styles.thtd}><b>{Math.round(currentAnalysis.rigidityRatio * 100)}%</b></td>
                          <td style={styles.thtd}>Variação (respostas únicas)</td>
                          <td style={styles.thtd}><b>{Math.round(currentAnalysis.variationRatio * 100)}%</b></td>
                        </tr>
                      </tbody>
                    </table>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                      <b>Marcadores sociais observados (N4 principalmente):</b><br />
                      Pergunta de volta: {currentAnalysis.markerTotals.askBack} •
                      Gratidão: {currentAnalysis.markerTotals.gratitude} •
                      Pedido de ajuda: {currentAnalysis.markerTotals.help} •
                      Justificativa/negociação: {currentAnalysis.markerTotals.justify} •
                      Cumprimento: {currentAnalysis.markerTotals.greeting} •
                      Solicitação/assertividade: {currentAnalysis.markerTotals.assertiveRequest}
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                      <b>Observações automáticas:</b>
                      <ul style={{ marginTop: 6 }}>
                        {(currentAnalysis.observations.length ? currentAnalysis.observations : ["Sem observações automáticas relevantes nesta sessão."]).map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.95 }}>
                      <b>Recomendação de mudança de nível:</b><br />
                      <span style={{ opacity: 0.9 }}>
                        Ação: <b>{currentAnalysis.rec.action.toUpperCase()}</b> → nível sugerido: <b>N{currentAnalysis.rec.toLevel}</b><br />
                        Motivo: {currentAnalysis.rec.reason}
                      </span>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={styles.button} onClick={() => exportSessionCSV(session)}>Exportar CSV</button>
                      <button style={styles.button} onClick={() => copySessionJSON(session)}>Copiar JSON</button>
                      <button
                        style={styles.buttonDanger}
                        onClick={() => {
                          finalizeAndSaveSession("manual_restart_inside_therapist");
                          resetConversation({ newSession: true });
                          setStatusMsg("Sessão reiniciada.");
                        }}
                      >
                        Reiniciar sessão
                      </button>
                    </div>
                  </div>
                )}

                {/* HISTÓRICO com análise salva por sessão */}
                {tab === "historico" && (
                  <div style={{ ...styles.card, marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700 }}>Histórico de sessões (uso do paciente)</div>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button style={styles.button} onClick={exportAllSessionsCSV}>Exportar tudo (CSV)</button>
                        <button style={styles.buttonDanger} onClick={clearSessionHistory}>Apagar histórico</button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
                      <div style={styles.card}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Sessões salvas ({sessionLog.length})</div>

                        {sessionLog.length === 0 && (
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            Ainda não há histórico. Ele é criado quando a conversa termina (END) ou ao reiniciar sessão.
                          </div>
                        )}

                        {sessionLog.slice().reverse().map((s) => (
                          <div
                            key={s.sessionId}
                            style={styles.listItem(s.sessionId === selectedLogId)}
                            onClick={() => setSelectedLogId(s.sessionId)}
                            role="button"
                            tabIndex={0}
                          >
                            <div style={{ fontWeight: 650, fontSize: 13 }}>
                              {s.scriptTitle || s.scriptId} • N{String(s.levelAtStart || "")}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                              {new Date(s.startedAt).toLocaleString()} • {s.events?.length || 0} respostas
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={styles.card}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Detalhes / análise</div>

                        {!selectedLog ? (
                          <div style={{ fontSize: 12, opacity: 0.8 }}>Selecione uma sessão para ver detalhes.</div>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, opacity: 0.85 }}>
                              Sessão: <code>{selectedLog.sessionId}</code>
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                              Cenário: <b>{selectedLog.scriptTitle}</b> • Nível inicial: <b>N{selectedLog.levelAtStart}</b>
                            </div>

                            {selectedLog.analysis ? (
                              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                                <b>Resumo:</b><br />
                                Respostas: <b>{selectedLog.analysis.totalResponses}</b> • Inválidas: <b>{selectedLog.analysis.invalidAttempts}</b> •
                                Latência média: <b>{msToSeconds(selectedLog.analysis.avgLatencyMs)}s</b><br />
                                Rigidez: <b>{Math.round(selectedLog.analysis.rigidityRatio * 100)}%</b> • Variação: <b>{Math.round(selectedLog.analysis.variationRatio * 100)}%</b><br />
                                <b>Recomendação:</b> {selectedLog.analysis.rec.action.toUpperCase()} → <b>N{selectedLog.analysis.rec.toLevel}</b> — {selectedLog.analysis.rec.reason}
                              </div>
                            ) : (
                              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                                (Sessão antiga sem análise salva. Rode uma nova sessão após atualizar o app.)
                              </div>
                            )}

                            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button style={styles.button} onClick={() => exportSessionCSV(selectedLog)}>Exportar CSV</button>
                              <button style={styles.button} onClick={() => copySessionJSON(selectedLog)}>Copiar JSON</button>
                            </div>

                            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                              <b>Eventos (últimos 15):</b>
                              <table style={styles.table}>
                                <thead>
                                  <tr>
                                    <th style={styles.thtd}>Step</th>
                                    <th style={styles.thtd}>Nível</th>
                                    <th style={styles.thtd}>Tipo</th>
                                    <th style={styles.thtd}>Latência</th>
                                    <th style={styles.thtd}>Resposta</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedLog.events || []).slice(-15).reverse().map((e) => (
                                    <tr key={e.ts}>
                                      <td style={styles.thtd}>{e.stepId}</td>
                                      <td style={styles.thtd}>{e.levelUsed}</td>
                                      <td style={styles.thtd}>{e.responseType}</td>
                                      <td style={styles.thtd}>{msToSeconds(e.latencyMs)}s</td>
                                      <td style={styles.thtd}>{e.responseText}</td>
                                    </tr>
                                  ))}
                                  {(selectedLog.events || []).length === 0 && (
                                    <tr><td style={styles.thtd} colSpan={5}>Sem eventos.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ROTEIROS (mantido) */}
                {tab === "roteiros" && (
                  <>
                    <div style={{ ...styles.card, marginTop: 12 }}>
                      <div style={{ fontWeight: 700 }}>Configurações</div>
                      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={settings.childMode}
                            onChange={(e) => setSettings((p) => ({ ...p, childMode: e.target.checked }))}
                          />
                          <span>Modo Criança (trava cenário/nível e oculta botões)</span>
                        </label>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                        No modo criança, para abrir o terapeuta: segure o título por {LONG_PRESS_MS / 1000}s.
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={styles.panelRow}>
                        <div style={styles.card}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontWeight: 700 }}>Cenários</div>
                            <button style={{ ...styles.button, marginLeft: "auto" }} onClick={addScenario}>+ Novo</button>
                          </div>

                          <div style={{ marginTop: 10 }}>
                            {scripts.map((sc) => (
                              <div
                                key={sc.id}
                                style={styles.listItem(sc.id === editingScriptId)}
                                onClick={() => {
                                  setEditingScriptId(sc.id);
                                  setStatusMsg("");
                                }}
                                role="button"
                                tabIndex={0}
                              >
                                <div style={{ fontWeight: 650, fontSize: 14 }}>{sc.title}</div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>{sc.steps.length} steps</div>
                              </div>
                            ))}
                          </div>

                          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              style={styles.button}
                              onClick={() => {
                                setScriptId(editingScriptId);
                                closeTherapist();
                                resetConversation({ newSession: true });
                              }}
                            >
                              Usar este cenário
                            </button>
                            <button style={styles.buttonDanger} onClick={() => deleteScenario(editingScriptId)}>
                              Excluir cenário
                            </button>
                          </div>
                        </div>

                        <div style={styles.card}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 700 }}>Editar cenário</div>
                            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button style={styles.button} onClick={addStep}>+ Step</button>
                              <button style={styles.button} onClick={() => setStatusMsg("Alterações salvas automaticamente.")}>Salvar</button>
                            </div>
                          </div>

                          <div style={{ marginTop: 12 }}>
                            <div style={styles.label}>Título do cenário</div>
                            <input
                              style={styles.smallInput}
                              value={editingScript.title}
                              onChange={(e) => setScenarioTitle(editingScript.id, e.target.value)}
                            />
                          </div>

                          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "220px 1fr", gap: 12 }}>
                            <div style={styles.card}>
                              <div style={{ fontWeight: 700, marginBottom: 10 }}>Steps</div>
                              {editingScript.steps.map((st) => (
                                <div
                                  key={st.id}
                                  style={styles.listItem(st.id === editingStepId)}
                                  onClick={() => setEditingStepId(st.id)}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div style={{ fontWeight: 650 }}>Step {st.id}</div>
                                  <div style={{ fontSize: 12, opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {st.incoming}
                                  </div>
                                </div>
                              ))}
                              <button style={styles.buttonDanger} onClick={() => deleteStep(editingStepId)}>Excluir step</button>
                            </div>

                            <div style={styles.card}>
                              <div style={{ fontWeight: 700 }}>Step {editingStep?.id}</div>

                              <div style={{ marginTop: 12 }}>
                                <div style={styles.label}>Mensagem recebida (incoming)</div>
                                <textarea
                                  style={styles.textarea}
                                  value={editingStep?.incoming || ""}
                                  onChange={(e) => patchStep({ incoming: e.target.value })}
                                />
                              </div>

                              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                  <div style={styles.label}>Nível 1 (2 respostas) — 1 por linha</div>
                                  <textarea
                                    style={styles.textarea}
                                    value={(editingStep?.optionsL1 || []).join("\n")}
                                    onChange={(e) => {
                                      const arr = parseLines(e.target.value);
                                      while (arr.length < 2) arr.push("");
                                      patchStep({ optionsL1: arr.slice(0, 2) });
                                    }}
                                  />
                                </div>

                                <div>
                                  <div style={styles.label}>Nível 2 (3–4 respostas) — 1 por linha</div>
                                  <textarea
                                    style={styles.textarea}
                                    value={(editingStep?.optionsL2 || []).join("\n")}
                                    onChange={(e) => patchStep({ optionsL2: parseLines(e.target.value).slice(0, 4) })}
                                  />
                                </div>
                              </div>

                              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                  <div style={styles.label}>Nível 3 — Template (use {"{blank}"})</div>
                                  <input
                                    style={styles.smallInput}
                                    value={editingStep?.level3?.template || ""}
                                    onChange={(e) => patchStepDeep(["level3", "template"], e.target.value)}
                                  />
                                  <div style={{ marginTop: 10, ...styles.label }}>Placeholder do campo</div>
                                  <input
                                    style={styles.smallInput}
                                    value={editingStep?.level3?.placeholder || ""}
                                    onChange={(e) => patchStepDeep(["level3", "placeholder"], e.target.value)}
                                  />
                                  <div style={{ marginTop: 10, ...styles.label }}>Outra opção pronta</div>
                                  <input
                                    style={styles.smallInput}
                                    value={editingStep?.level3?.otherOption || ""}
                                    onChange={(e) => patchStepDeep(["level3", "otherOption"], e.target.value)}
                                  />
                                </div>

                                <div>
                                  <div style={styles.label}>Nível 4 — Dica</div>
                                  <textarea
                                    style={styles.textarea}
                                    value={editingStep?.level4?.hint || ""}
                                    onChange={(e) => patchStepDeep(["level4", "hint"], e.target.value)}
                                  />
                                  <div style={{ marginTop: 10, ...styles.label }}>Chips — 1 por linha</div>
                                  <textarea
                                    style={styles.textarea}
                                    value={(editingStep?.level4?.chips || []).join("\n")}
                                    onChange={(e) => patchStepDeep(["level4", "chips"], parseLines(e.target.value).slice(0, 8))}
                                  />
                                </div>
                              </div>

                              <div style={{ marginTop: 12 }}>
                                <div style={styles.label}>
                                  Próximo step (next): use <b>END</b>, um número (ex.: 2) ou um JSON de ramificação.
                                </div>
                                <textarea
                                  style={styles.textarea}
                                  value={formatNextField(editingStep?.next)}
                                  onChange={(e) => {
                                    const nextVal = parseNextField(e.target.value);
                                    if (nextVal === null) {
                                      setStatusMsg("Next inválido. Use END, número, ou JSON válido.");
                                      return;
                                    }
                                    setStatusMsg("");
                                    patchStep({ next: nextVal });
                                  }}
                                />
                                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                                  Exemplo de ramificação: {"{ \"0\": 2, \"1\": 3 }"} (índice da opção → id do step)
                                </div>
                              </div>
                            </div>
                          </div>

                          <div style={{ ...styles.card, marginTop: 12 }}>
                            <div style={{ fontWeight: 700 }}>Importar roteiros (JSON)</div>
                            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                              Cole aqui um JSON exportado anteriormente. Isso substitui todos os cenários atuais.
                            </div>
                            <textarea
                              style={{ ...styles.textarea, marginTop: 10 }}
                              value={importText}
                              onChange={(e) => setImportText(e.target.value)}
                              placeholder='[ { "id": "...", "title": "...", "steps": [...] } ]'
                            />
                            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button style={styles.button} onClick={importScripts}>Importar</button>
                              <button
                                style={styles.buttonDanger}
                                onClick={() => {
                                  setScripts(DEFAULT_SCRIPTS.map(normalizeScript));
                                  setStatusMsg("Roteiros restaurados para o padrão.");
                                  setScriptId(DEFAULT_SCRIPTS[0].id);
                                  setEditingScriptId(DEFAULT_SCRIPTS[0].id);
                                }}
                              >
                                Restaurar padrão
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
