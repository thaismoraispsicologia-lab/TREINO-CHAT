import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Treino de Habilidades Sociais - Chat + Fading (Níveis 1-4)
 * + Modo Terapeuta (CRUD de roteiros, persistência em localStorage, import/export)
 * + Registro clínico por sessão (tempo de resposta, tentativas, escolha)
 * + Modo Criança (travado e sem botões visíveis)
 * + Acesso oculto ao terapeuta por gesto (pressionar e segurar o título por 2s)
 */

const STORAGE_SCRIPTS = "treino_chat_scripts_v2";
const STORAGE_SETTINGS = "treino_chat_settings_v2";

const THERAPIST_PIN = "1234"; // <- TROQUE AQUI
const LONG_PRESS_MS = 2000;   // <- tempo do "segurar" para abrir terapeuta oculto

// ---------------------
// SCRIPTS PADRÃO
// ---------------------
const DEFAULT_SCRIPTS = [
  {
    id: "cumprimentos",
    title: "Cumprimentos e continuidade",
    steps: [
      {
        id: 1,
        incoming: "Oi",
        optionsL1: ["Oi", "Olá"],
        optionsL2: ["Oi", "Olá", "Oiê", "Tudo bem?"],
        level3: {
          template: "Oi, {blank}!",
          placeholder: "nome da pessoa",
          otherOption: "Olá! 🙂",
        },
        level4: {
          hint: "Dica: comece com um cumprimento + algo simples (ex.: 'Oi, tudo bem?').",
          chips: ["Oi!", "Olá 🙂", "Oi, tudo bem?", "Oi! Como você está?"],
        },
        next: 2,
      },
      {
        id: 2,
        incoming: "Como você está?",
        optionsL1: ["Estou bem e você?", "Tudo bem e com você?"],
        optionsL2: [
          "Estou bem e você?",
          "Tudo bem e com você?",
          "Estou mais ou menos hoje.",
          "Estou cansado(a), e você?",
        ],
        level3: {
          template: "Eu estou {blank}. E você?",
          placeholder: "bem / ok / cansado(a) / feliz",
          otherOption: "Estou bem! E você?",
        },
        level4: {
          hint: "Dica: responda como você está + devolva a pergunta.",
          chips: ["Estou bem, e você?", "Estou ok hoje. E você?", "Estou cansado(a). E você?"],
        },
        next: 3,
      },
      {
        id: 3,
        incoming: "Que bom! O que você está fazendo?",
        optionsL1: ["Estou em casa.", "Estou descansando."],
        optionsL2: ["Estou em casa.", "Estou descansando.", "Estou estudando.", "Estou assistindo TV."],
        level3: {
          template: "Eu estou {blank} agora.",
          placeholder: "em casa / estudando / no trabalho",
          otherOption: "Estou descansando um pouco.",
        },
        level4: {
          hint: "Dica: diga uma atividade simples (curta).",
          chips: ["Estou em casa.", "Estou descansando.", "Estou estudando.", "Estou comendo agora."],
        },
        next: 4,
      },
      {
        id: 4,
        incoming: "Legal 🙂 Vamos conversar depois?",
        optionsL1: ["Sim! Pode ser.", "Pode sim."],
        optionsL2: ["Sim! Pode ser.", "Pode sim.", "Pode ser mais tarde.", "Agora estou ocupado(a), depois pode."],
        level3: {
          template: "Pode ser às {blank}?",
          placeholder: "16h / mais tarde / amanhã",
          otherOption: "Pode sim, combinado.",
        },
        level4: {
          hint: "Dica: aceite e combine um horário, ou diga quando pode.",
          chips: ["Pode sim!", "Pode ser mais tarde.", "Pode ser amanhã?", "Agora não, depois eu posso."],
        },
        next: "END",
      },
    ],
  },
];

// ---------------------
// UTIL
// ---------------------
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
  return Math.round((ms / 1000) * 10) / 10; // 1 casa decimal
}

function toCSV(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const header = Object.keys(rows[0] || {});
  const lines = [
    header.map(esc).join(","),
    ...rows.map((r) => header.map((h) => esc(r[h])).join(",")),
  ];
  return lines.join("\n");
}

// ---------------------
// STYLES
// ---------------------
const styles = {
  app: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#0b141a",
    color: "#e9edef",
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
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
    background:
      "radial-gradient(circle at top, rgba(255,255,255,0.04), rgba(0,0,0,0) 55%)",
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
  optionsWrap: {
    display: "grid",
    gap: 10,
  },
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
  optionBtnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  smallBar: {
    display: "flex",
    gap: 10,
    marginTop: 10,
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  hint: { fontSize: 12, opacity: 0.75 },
  inputRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 10,
  },
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
  chipRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },
  chip: {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b141a",
    cursor: "pointer",
    fontSize: 13,
    opacity: 0.95,
  },

  // Modal (terapeuta/relatório)
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
    width: "min(1020px, 100%)",
    maxHeight: "90vh",
    overflow: "auto",
    background: "#0f1a20",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
  },
  panelRow: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 },
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
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
    marginTop: 8,
  },
  thtd: {
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    padding: "8px 6px",
    verticalAlign: "top",
  },
};

// ---------------------
// APP
// ---------------------
export default function App() {
  // 1) Scripts
  const [scripts, setScripts] = useState(() => {
    const loaded = loadFromStorage(STORAGE_SCRIPTS);
    if (Array.isArray(loaded) && loaded.length) return loaded.map(normalizeScript);
    return DEFAULT_SCRIPTS.map(normalizeScript);
  });
  useEffect(() => saveToStorage(STORAGE_SCRIPTS, scripts), [scripts]);

  // 2) Configurações (modo criança)
  const [settings, setSettings] = useState(() => {
    const loaded = loadFromStorage(STORAGE_SETTINGS);
    if (loaded && typeof loaded === "object") {
      return { childMode: !!loaded.childMode };
    }
    return { childMode: false };
  });
  useEffect(() => saveToStorage(STORAGE_SETTINGS, settings), [settings]);

  // 3) Seleção cenário e nível
  const [scriptId, setScriptId] = useState(() => scripts[0]?.id || "cumprimentos");
  const [level, setLevel] = useState(1);

  const script = useMemo(() => {
    const found = scripts.find((s) => s.id === scriptId);
    return found || scripts[0];
  }, [scripts, scriptId]);

  const stepsById = useMemo(() => {
    const m = new Map();
    for (const st of script.steps) m.set(st.id, st);
    return m;
  }, [script]);

  // 4) Conversa
  const [currentStepId, setCurrentStepId] = useState(script.steps[0].id);
  const [history, setHistory] = useState([]);
  const [isEnded, setIsEnded] = useState(false);

  // Inputs (N3/N4)
  const [fillText, setFillText] = useState("");
  const [freeText, setFreeText] = useState("");

  const chatEndRef = useRef(null);

  // 5) Registro clínico da sessão
  const [session, setSession] = useState(() => ({
    sessionId: uid("session"),
    startedAt: Date.now(),
    scriptId: scriptId,
    scriptTitle: script?.title || "",
    levelAtStart: level,
    attemptsInvalid: 0,
    events: [], // cada resposta enviada
  }));

  // guarda o "momento em que a mensagem incoming apareceu" para medir tempo de resposta
  const incomingShownAtRef = useRef(Date.now());

  function startNewSession(nextScriptId, nextLevel) {
    setSession({
      sessionId: uid("session"),
      startedAt: Date.now(),
      scriptId: nextScriptId,
      scriptTitle: (scripts.find((s) => s.id === nextScriptId)?.title) || "",
      levelAtStart: nextLevel,
      attemptsInvalid: 0,
      events: [],
    });
  }

  function resetConversation({ newSession = true } = {}) {
    setHistory([]);
    setCurrentStepId(script.steps[0].id);
    setIsEnded(false);
    setFillText("");
    setFreeText("");
    incomingShownAtRef.current = Date.now();

    if (newSession) startNewSession(scriptId, level);
  }

  // ao trocar cenário: reinicia conversa e sessão
  useEffect(() => {
    resetConversation({ newSession: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId]);

  // se o step atual sumir após edição
  useEffect(() => {
    if (!stepsById.get(currentStepId)) {
      setCurrentStepId(script.steps[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, stepsById]);

  useEffect(() => {
    setFillText("");
    setFreeText("");
  }, [level, currentStepId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // incoming automático ao entrar no step (inclui nível 4)
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
    if (typeof nxt === "object" && nxt) return nxt[optionIndex] ?? "END";
    return "END";
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
      scriptId: scriptId,
      scriptTitle: script?.title || prev.scriptTitle,
      events: [
        ...prev.events,
        {
          ts: now,
          stepId,
          incoming,
          responseText,
          levelUsed,
          responseType, // "button" | "fill" | "free"
          optionIndex: optionIndex ?? null,
          latencyMs,
        },
      ],
    }));
  }

  function registerInvalidAttempt() {
    setSession((prev) => ({
      ...prev,
      attemptsInvalid: (prev.attemptsInvalid || 0) + 1,
    }));
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
    advanceTo(nextId);
  }

  // opções por nível
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

  // --------- FOOTER (corrige o erro anterior: agora esta função existe) ---------
  function renderFooterContent() {
    if (!step) return null;

    // N4: livre
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
              style={{
                ...styles.optionBtn,
                width: 140,
                ...(disabled ? styles.optionBtnDisabled : {}),
              }}
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

    // N3: completar
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

    // N1/N2: botões
    return (
      <div
        style={{
          ...styles.optionsWrap,
          gridTemplateColumns: optionsForButtons.length <= 2 ? "1fr 1fr" : "1fr 1fr",
        }}
      >
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

  // ---------------------
  // MODO TERAPEUTA (modal + PIN)
  // ---------------------
  const [therapistOpen, setTherapistOpen] = useState(false);
  const [therapistAuthed, setTherapistAuthed] = useState(false);
  const [pin, setPin] = useState("");

  const [editingScriptId, setEditingScriptId] = useState(script.id);
  const editingScript = useMemo(() => {
    return scripts.find((s) => s.id === editingScriptId) || scripts[0];
  }, [scripts, editingScriptId]);

  const [editingStepId, setEditingStepId] = useState(() => editingScript.steps[0]?.id || 1);
  const editingStep = useMemo(() => {
    return editingScript.steps.find((st) => st.id === editingStepId) || editingScript.steps[0];
  }, [editingScript, editingStepId]);

  const [importText, setImportText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (!therapistOpen) {
      setStatusMsg("");
      setImportText("");
      setPin("");
    } else {
      setEditingScriptId(script.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [therapistOpen]);

  useEffect(() => {
    if (therapistOpen) {
      setEditingStepId(editingScript.steps[0]?.id || 1);
    }
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
    setScripts((prev) => updater(prev.map(normalizeScript)).map(normalizeScript));
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
    updateScripts((prev) => prev.filter((s) => s.id !== idToDelete));
    setStatusMsg("Cenário excluído.");

    // se deletou o cenário ativo, aponta para o primeiro disponível
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
      prev.map((sc) =>
        sc.id === editingScript.id
          ? { ...sc, steps: [...sc.steps, newStep].sort((a, b) => a.id - b.id) }
          : sc
      )
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
      prev.map((sc) => {
        if (sc.id !== editingScript.id) return sc;
        return { ...sc, steps: sc.steps.map((st) => (st.id === editingStep.id ? { ...st, ...patch } : st)) };
      })
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
    return (text || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
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
    if (!parsed.ok) {
      setStatusMsg(`Erro ao importar: ${parsed.error}`);
      return;
    }
    if (!Array.isArray(parsed.value)) {
      setStatusMsg("Erro: o JSON precisa ser um array de cenários.");
      return;
    }
    const normalized = parsed.value.map(normalizeScript);
    setScripts(normalized);
    setStatusMsg("Importação concluída.");
    setScriptId(normalized[0]?.id || "cumprimentos");
    setEditingScriptId(normalized[0]?.id || "cumprimentos");
  }

  // ---------------------
  // RELATÓRIO DA SESSÃO
  // ---------------------
  const sessionSummary = useMemo(() => {
    const totalResponses = session.events.length;
    const avgLatency =
      totalResponses === 0
        ? 0
        : session.events.reduce((a, e) => a + (e.latencyMs || 0), 0) / totalResponses;

    const byType = session.events.reduce(
      (acc, e) => {
        acc[e.responseType] = (acc[e.responseType] || 0) + 1;
        return acc;
      },
      { button: 0, fill: 0, free: 0 }
    );

    return {
      totalResponses,
      avgLatencyMs: Math.round(avgLatency),
      invalidAttempts: session.attemptsInvalid || 0,
      byType,
    };
  }, [session]);

  function exportSessionCSV() {
    const rows = session.events.map((e) => ({
      sessionId: session.sessionId,
      startedAtISO: new Date(session.startedAt).toISOString(),
      scriptId: session.scriptId,
      scriptTitle: session.scriptTitle,
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
      setStatusMsg("Não há respostas na sessão para exportar.");
      return;
    }
    const csv = toCSV(rows);

    // baixa como arquivo
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_sessao_${session.sessionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setStatusMsg("Relatório CSV baixado.");
  }

  function copySessionJSON() {
    const json = JSON.stringify(session, null, 2);
    navigator.clipboard?.writeText(json);
    setStatusMsg("Sessão copiada em JSON.");
  }

  // ---------------------
  // MODO CRIANÇA + GESTO OCULTO
  // ---------------------
  const longPressTimerRef = useRef(null);

  function startLongPress() {
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      openTherapist(); // abre mesmo em modo criança
    }, LONG_PRESS_MS);
  }
  function clearLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // ---------------------
  // RENDER
  // ---------------------
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

        {/* Em modo criança, travamos cenário e nível (para evitar mudanças sem querer) */}
        {!settings.childMode && (
          <>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={styles.titleSmall}>Cenário</span>
              <select
                style={styles.select}
                value={scriptId}
                onChange={(e) => setScriptId(e.target.value)}
                aria-label="Selecionar cenário"
              >
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={styles.titleSmall}>Nível</span>
              <select
                style={styles.select}
                value={level}
                onChange={(e) => {
                  setLevel(Number(e.target.value));
                  // iniciar nova sessão ao trocar nível pode ser desejável clinicamente:
                  startNewSession(scriptId, Number(e.target.value));
                }}
                aria-label="Selecionar nível"
              >
                <option value={1}>Nível 1</option>
                <option value={2}>Nível 2</option>
                <option value={3}>Nível 3</option>
                <option value={4}>Nível 4</option>
              </select>
            </label>
          </>
        )}

        {/* Botão terapeuta some no modo criança. Acesso fica pelo gesto (segurar 2s). */}
        {!settings.childMode && (
          <button style={styles.button} onClick={openTherapist}>
            Modo Terapeuta
          </button>
        )}
      </div>

      <div style={styles.chatArea}>
        {history.map((m, idx) => (
          <div
            key={m.ts + ":" + idx}
            style={m.type === "in" ? styles.rowIncoming : styles.rowOutgoing}
          >
            <div style={m.type === "in" ? styles.bubbleIncoming : styles.bubbleOutgoing}>
              {m.text}
            </div>
          </div>
        ))}

        {isEnded && (
          <div style={{ marginTop: 14, opacity: 0.85, fontSize: 13 }}>
            Conversa finalizada ✅
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div style={styles.footer}>
        {renderFooterContent()}
        <div style={styles.smallBar}>
          <button
            style={styles.button}
            onClick={() => resetConversation({ newSession: true })}
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

      {/* MODAL TERAPEUTA */}
      {therapistOpen && (
        <div
          style={styles.modalBackdrop}
          onMouseDown={(e) => e.target === e.currentTarget && closeTherapist()}
        >
          <div style={styles.modal}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 750, fontSize: 16 }}>Modo Terapeuta</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {therapistAuthed ? (
                  <>
                    <button style={styles.button} onClick={exportScripts}>Exportar roteiros</button>
                    <button style={styles.button} onClick={exportSessionCSV}>Exportar sessão (CSV)</button>
                    <button style={styles.button} onClick={copySessionJSON}>Copiar sessão (JSON)</button>
                    <button style={styles.button} onClick={logoutTherapist}>Sair</button>
                  </>
                ) : null}
                <button style={styles.button} onClick={closeTherapist}>Fechar</button>
              </div>
            </div>

            {!therapistAuthed ? (
              <div style={{ ...styles.card, marginTop: 12 }}>
                <div style={styles.label}>Digite o PIN para editar roteiros e ver relatórios</div>
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
                {statusMsg ? (
                  <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.9 }}>
                    {statusMsg}
                  </div>
                ) : null}

                {/* Resumo clínico da sessão */}
                <div style={styles.card}>
                  <div style={{ fontWeight: 700 }}>Relatório da sessão (atual)</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    Sessão: <code>{session.sessionId}</code> — cenário: <b>{session.scriptTitle}</b>
                  </div>

                  <table style={styles.table}>
                    <tbody>
                      <tr>
                        <td style={styles.thtd}>Respostas</td>
                        <td style={styles.thtd}><b>{sessionSummary.totalResponses}</b></td>
                        <td style={styles.thtd}>Tentativas inválidas</td>
                        <td style={styles.thtd}><b>{sessionSummary.invalidAttempts}</b></td>
                      </tr>
                      <tr>
                        <td style={styles.thtd}>Tempo médio de resposta</td>
                        <td style={styles.thtd}><b>{msToSeconds(sessionSummary.avgLatencyMs)}s</b></td>
                        <td style={styles.thtd}>Tipos</td>
                        <td style={styles.thtd}>
                          Botão: {sessionSummary.byType.button} • Completar: {sessionSummary.byType.fill} • Livre: {sessionSummary.byType.free}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                    <b>Detalhes (últimas 10 respostas):</b>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.thtd}>Step</th>
                          <th style={styles.thtd}>Nível</th>
                          <th style={styles.thtd}>Tipo</th>
                          <th style={styles.thtd}>Opção</th>
                          <th style={styles.thtd}>Latência</th>
                          <th style={styles.thtd}>Resposta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.events.slice(-10).reverse().map((e) => (
                          <tr key={e.ts}>
                            <td style={styles.thtd}>{e.stepId}</td>
                            <td style={styles.thtd}>{e.levelUsed}</td>
                            <td style={styles.thtd}>{e.responseType}</td>
                            <td style={styles.thtd}>{e.optionIndex ?? ""}</td>
                            <td style={styles.thtd}>{msToSeconds(e.latencyMs)}s</td>
                            <td style={styles.thtd}>{e.responseText}</td>
                          </tr>
                        ))}
                        {session.events.length === 0 && (
                          <tr>
                            <td style={styles.thtd} colSpan={6}>Nenhuma resposta registrada ainda.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={styles.button} onClick={exportSessionCSV}>Exportar CSV</button>
                    <button style={styles.button} onClick={copySessionJSON}>Copiar JSON</button>
                    <button
                      style={styles.buttonDanger}
                      onClick={() => {
                        resetConversation({ newSession: true });
                        setStatusMsg("Sessão reiniciada.");
                      }}
                    >
                      Reiniciar sessão
                    </button>
                  </div>
                </div>

                {/* Modo criança */}
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

                {/* Editor de roteiros */}
                <div style={{ marginTop: 12 }}>
                  <div style={styles.panelRow}>
                    {/* Lista de cenários */}
                    <div style={styles.card}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>Cenários</div>
                        <button style={{ ...styles.button, marginLeft: "auto" }} onClick={addScenario}>
                          + Novo
                        </button>
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
                        <button
                          style={styles.buttonDanger}
                          onClick={() => deleteScenario(editingScriptId)}
                        >
                          Excluir cenário
                        </button>
                      </div>
                    </div>

                    {/* Editor do cenário */}
                    <div style={styles.card}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700 }}>Editar cenário</div>
                        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button style={styles.button} onClick={addStep}>+ Step</button>
                          <button
                            style={styles.button}
                            onClick={() => setStatusMsg("Alterações salvas automaticamente.")}
                          >
                            Salvar
                          </button>
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
                        {/* Lista de steps */}
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
                          <button style={styles.buttonDanger} onClick={() => deleteStep(editingStepId)}>
                            Excluir step
                          </button>
                        </div>

                        {/* Form do step */}
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
                                onChange={(e) => {
                                  const arr = parseLines(e.target.value).slice(0, 4);
                                  patchStep({ optionsL2: arr });
                                }}
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

                      {/* Import */}
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

              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
