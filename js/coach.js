// ============================================
// COACH.JS — Memória e Chat do Coach
// ============================================

const COACH_URL = 'https://treinos-claude.jujutfigueiredo.workers.dev';
const COACH_CACHE_KEY = 'treinos_coach_cache';
const COACH_CACHE_TTL = 4 * 60 * 60 * 1000; // 4h

// ============================================
// MEMÓRIA — Carregar contexto da BD
// ============================================

async function carregarMemoriaCoach() {
    try {
        // Camada 1: últimos 10 registos detalhados
        const { data: recentes } = await db.from('coach_memoria')
            .select('*')
            .order('data', { ascending: false })
            .limit(10);

        // Camada 2: resumo mensal mais recente
        const { data: resumos } = await db.from('coach_memoria')
            .select('*')
            .eq('tipo', 'resumo_mensal')
            .order('data', { ascending: false })
            .limit(1);

        const memoriaRecente = (recentes || [])
            .filter(r => r.tipo !== 'resumo_mensal')
            .map(r => `[${r.data}] ${r.tipo.toUpperCase()}: ${r.conteudo}`)
            .join('\n');

        const resumoMensal = resumos && resumos.length > 0 ? resumos[0].conteudo : null;

        return { memoriaRecente, resumoMensal };
    } catch(e) {
        console.warn('Erro ao carregar memória:', e);
        return { memoriaRecente: null, resumoMensal: null };
    }
}

async function guardarMemoria(tipo, conteudo, dados = null, sessaoId = null) {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        await db.from('coach_memoria').insert({
            data: hoje,
            tipo,
            conteudo,
            dados: dados ? JSON.stringify(dados) : null,
            sessao_id: sessaoId || null,
            relevancia: tipo === 'resumo_mensal' ? 5 : tipo === 'analise' ? 4 : 3
        });
    } catch(e) {
        console.warn('Erro ao guardar memória:', e);
    }
}

// ============================================
// COACH DIÁRIO (com memória)
// ============================================

async function carregarCoach() {
    const container = document.getElementById('coach-card');
    if (!container) return;

    // Verificar cache
    try {
        const cached = localStorage.getItem(COACH_CACHE_KEY);
        if (cached) {
            const { msg, acao, label, ts } = JSON.parse(cached);
            if (Date.now() - ts < COACH_CACHE_TTL) {
                mostrarMensagemCoach(container, msg, acao, label);
                return;
            }
        }
    } catch(e) {}

    try {
        const hojeStr = new Date().toISOString().split('T')[0];

        const [{ data: sessoes }, { data: regDia }, { data: pesos }, { data: ciclos }] = await Promise.all([
            db.from('sessoes_treino').select('data, nome_treino').order('data', { ascending: false }).limit(3),
            db.from('registo_diario').select('*').eq('data', hojeStr).limit(1),
            db.from('metricas_corporais').select('data, peso_kg').order('data', { ascending: false }).limit(1),
            db.from('ciclo_menstrual').select('*').order('inicio', { ascending: false }).limit(1)
        ]);

        const ultimoTreino = sessoes && sessoes.length > 0 ? sessoes[0] : null;
        const diasSemTreino = ultimoTreino
            ? Math.floor((new Date() - new Date(ultimoTreino.data + 'T00:00:00')) / 86400000) : 99;

        const reg = regDia && regDia.length > 0 ? regDia[0] : {};
        const aguaAtual = reg.agua_ml || 0;
        const metaAgua = reg.meta_agua_ml || 2000;

        const ultimoPeso = pesos && pesos.length > 0 ? pesos[0] : null;
        const diasSemPeso = ultimoPeso
            ? Math.floor((new Date() - new Date(ultimoPeso.data + 'T00:00:00')) / 86400000) : 99;

        let diasCiclo = null, faseNome = null;
        if (ciclos && ciclos.length > 0) {
            diasCiclo = Math.floor((new Date() - new Date(ciclos[0].inicio + 'T00:00:00')) / 86400000) + 1;
            if (typeof calcularFase === 'function') faseNome = calcularFase(diasCiclo)?.nome || null;
        }

        const { memoriaRecente, resumoMensal } = await carregarMemoriaCoach();

        const dados = {
            data_hoje: hojeStr,
            energia: reg.energia ? reg.energia + '/5' : 'não registada',
            horas_sono: reg.horas_sono ? reg.horas_sono + 'h' : 'não registado',
            flare_fibromialgia: reg.flare_fibromialgia || false,
            agua_ml: aguaAtual,
            pct_agua: Math.round(aguaAtual / metaAgua * 100) + '%',
            meta_agua_ml: metaAgua,
            dias_sem_treinar: diasSemTreino,
            ultimo_treino: ultimoTreino ? ultimoTreino.nome_treino + ' em ' + ultimoTreino.data : 'sem registos',
            fase_ciclo: faseNome || 'desconhecida',
            dia_ciclo: diasCiclo,
            dias_sem_pesagem: diasSemPeso,
            ultimo_peso_kg: ultimoPeso ? ultimoPeso.peso_kg + 'kg' : 'sem registo',
            memoria_recente: memoriaRecente,
            resumo_mensal: resumoMensal
        };

        const response = await fetch(COACH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'coach_diario', dados })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);

        let coachData;
        try { coachData = JSON.parse(result.texto); }
        catch(e) { coachData = { mensagem: result.texto, acao: null, label: null }; }

        const { mensagem, acao, label } = coachData;

        localStorage.setItem(COACH_CACHE_KEY, JSON.stringify({
            msg: mensagem, acao, label, ts: Date.now()
        }));

        // Guardar na memória
        await guardarMemoria('coach_diario', mensagem, { energia: reg.energia, agua_ml: aguaAtual, fase_ciclo: faseNome });

        mostrarMensagemCoach(container, mensagem, acao, label);

    } catch(e) {
        console.error('Coach falhou:', e);
        container.style.display = 'none';
    }
}

function mostrarMensagemCoach(container, msg, acao, label) {
    if (!msg) { container.style.display = 'none'; return; }
    container.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:12px;">
            <span style="font-size:1.4rem; flex-shrink:0;">🤖</span>
            <div style="flex:1;">
                <div style="font-size:0.88rem; color:var(--cinza-texto); line-height:1.5;">${msg}</div>
                ${acao ? `<a href="${acao}" class="btn btn-primario" style="margin-top:10px; font-size:0.82rem; padding:8px 14px;">${label}</a>` : ''}
            </div>
        </div>`;
    container.classList.add('visivel');
}

// ============================================
// CHAT FLUTUANTE — UI
// ============================================

let chatHistorico = [];
let chatTreinoAtual = null;
let chatAberto = false;

function iniciarChatCoach(contextoTreino = null) {
    chatTreinoAtual = contextoTreino;
    if (!document.getElementById('coach-chat-overlay')) {
        criarChatUI();
    }
}

function criarChatUI() {
    const overlay = document.createElement('div');
    overlay.id = 'coach-chat-overlay';
    overlay.innerHTML = `
        <div id="coach-chat-btn" onclick="toggleChat()" title="Coach PT">
            💬
        </div>
        <div id="coach-chat-drawer" class="chat-fechado">
            <div id="coach-chat-header">
                <div style="font-weight:700; font-size:0.95rem;">🤖 Coach PT</div>
                <button onclick="toggleChat()" style="background:none;border:none;color:white;font-size:1.2rem;cursor:pointer;padding:0;">✕</button>
            </div>
            <div id="coach-chat-msgs"></div>
            <div id="coach-chat-input-wrap">
                <textarea id="coach-chat-input" placeholder="Pergunta ao teu coach..." rows="2"
                    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();enviarMensagemChat();}"></textarea>
                <button onclick="enviarMensagemChat()" id="coach-chat-send">➤</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    // Adicionar estilos
    if (!document.getElementById('coach-chat-styles')) {
        const style = document.createElement('style');
        style.id = 'coach-chat-styles';
        style.textContent = `
            #coach-chat-overlay { position:fixed; bottom:90px; right:16px; z-index:300; }
            #coach-chat-btn {
                width:52px; height:52px; border-radius:50%;
                background:var(--verde); color:white; font-size:1.4rem;
                display:flex; align-items:center; justify-content:center;
                cursor:pointer; box-shadow:0 4px 16px rgba(42,157,143,0.4);
                transition:transform 0.15s;
            }
            #coach-chat-btn:hover { transform:scale(1.05); }
            #coach-chat-drawer {
                position:absolute; bottom:64px; right:0;
                width:320px; max-height:480px;
                background:var(--branco); border-radius:var(--radius);
                box-shadow:0 8px 32px rgba(0,0,0,0.15);
                display:flex; flex-direction:column;
                transition:all 0.2s;
            }
            #coach-chat-drawer.chat-fechado { opacity:0; pointer-events:none; transform:translateY(8px); }
            #coach-chat-header {
                background:var(--verde); color:white;
                padding:12px 16px; border-radius:var(--radius) var(--radius) 0 0;
                display:flex; align-items:center; justify-content:space-between;
            }
            #coach-chat-msgs {
                flex:1; overflow-y:auto; padding:12px;
                display:flex; flex-direction:column; gap:8px;
                min-height:200px; max-height:320px;
            }
            .chat-msg-user {
                align-self:flex-end; background:var(--verde); color:white;
                padding:8px 12px; border-radius:12px 12px 2px 12px;
                font-size:0.85rem; max-width:80%;
            }
            .chat-msg-coach {
                align-self:flex-start; background:var(--cinza-claro);
                padding:8px 12px; border-radius:12px 12px 12px 2px;
                font-size:0.85rem; max-width:85%; line-height:1.4;
            }
            .chat-msg-loading {
                align-self:flex-start; color:var(--cinza-meio); font-size:0.82rem;
                padding:8px 12px;
            }
            #coach-chat-input-wrap {
                padding:10px; border-top:1px solid var(--cinza-borda);
                display:flex; gap:8px; align-items:flex-end;
            }
            #coach-chat-input {
                flex:1; border:1.5px solid var(--cinza-borda); border-radius:var(--radius-sm);
                padding:8px 10px; font-family:'DM Sans',sans-serif; font-size:0.88rem;
                resize:none; outline:none;
            }
            #coach-chat-input:focus { border-color:var(--verde); }
            #coach-chat-send {
                background:var(--verde); color:white; border:none;
                border-radius:var(--radius-sm); padding:8px 12px;
                cursor:pointer; font-size:1rem;
            }
            @media(max-width:380px) {
                #coach-chat-drawer { width:calc(100vw - 32px); right:0; }
            }`;
        document.head.appendChild(style);
    }

    // Mensagem de boas-vindas
    adicionarMensagemChat('coach', 'Olá! Estou aqui durante o treino. Podes perguntar sobre substituição de exercícios, ajustes de peso, ou qualquer dúvida.');
}

function toggleChat() {
    chatAberto = !chatAberto;
    const drawer = document.getElementById('coach-chat-drawer');
    if (drawer) drawer.classList.toggle('chat-fechado', !chatAberto);
    if (chatAberto) {
        setTimeout(() => {
            const input = document.getElementById('coach-chat-input');
            if (input) input.focus();
        }, 200);
    }
}

function adicionarMensagemChat(role, texto) {
    const msgs = document.getElementById('coach-chat-msgs');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = role === 'user' ? 'chat-msg-user' : 'chat-msg-coach';
    div.textContent = texto;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
}

async function enviarMensagemChat() {
    const input = document.getElementById('coach-chat-input');
    const sendBtn = document.getElementById('coach-chat-send');
    if (!input) return;

    const mensagem = input.value.trim();
    if (!mensagem) return;

    input.value = '';
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    adicionarMensagemChat('user', mensagem);

    // Loading
    const msgs = document.getElementById('coach-chat-msgs');
    const loading = document.createElement('div');
    loading.className = 'chat-msg-loading';
    loading.textContent = '⏳ A pensar...';
    if (msgs) { msgs.appendChild(loading); msgs.scrollTop = msgs.scrollHeight; }

    try {
        const { memoriaRecente, resumoMensal } = await carregarMemoriaCoach();

        const response = await fetch(COACH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo: 'chat_coach',
                dados: {
                    mensagem,
                    treino_atual: chatTreinoAtual,
                    historico_chat: chatHistorico.slice(-6), // últimas 3 trocas
                    memoria_recente: memoriaRecente,
                    resumo_mensal: resumoMensal
                }
            })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);

        // Remover loading
        if (loading.parentNode) loading.parentNode.removeChild(loading);

        const resposta = result.texto;
        adicionarMensagemChat('coach', resposta);

        // Guardar no histórico local
        chatHistorico.push({ role: 'user', content: mensagem });
        chatHistorico.push({ role: 'assistant', content: resposta });

        // Guardar na memória se parecer importante (decisão de peso ou substituição)
        const keywords = ['kg', 'aumentar', 'diminuir', 'substituir', 'trocar', 'dor', 'lesão'];
        if (keywords.some(k => mensagem.toLowerCase().includes(k))) {
            await guardarMemoria('chat', `P: ${mensagem} R: ${resposta}`);
        }

    } catch(e) {
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        adicionarMensagemChat('coach', 'Erro ao contactar o coach. Tenta de novo.');
    }

    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
}

// ============================================
// GUARDAR MEMÓRIA APÓS TREINO/ANÁLISE
// ============================================

async function guardarMemoriaTreino(sessao, exercicios) {
    try {
        const exResumo = exercicios
            .filter(ex => ex.nome)
            .map(ex => `${ex.nome}: ${ex.peso_kg || '?'}kg × ${ex.reps || '?'}`)
            .join(', ');

        const conteudo = `Treino: ${sessao.nome_treino}. Exercícios: ${exResumo}.${sessao.notas ? ' Notas: ' + sessao.notas : ''}`;

        await guardarMemoria('treino', conteudo, {
            nome_treino: sessao.nome_treino,
            exercicios: exercicios.map(ex => ({ nome: ex.nome, peso_kg: ex.peso_kg, reps: ex.reps }))
        }, sessao.id);

        // Invalidar cache do coach
        localStorage.removeItem(COACH_CACHE_KEY);
    } catch(e) {
        console.warn('Erro ao guardar memória do treino:', e);
    }
}

async function guardarMemoriaAnalise(analise, sessaoId) {
    try {
        // Extrair "Sugestões para guardar" da análise
        const match = analise.match(/💡[^\n]*\n([\s\S]*?)(?:\n##|$)/);
        const sugestoes = match ? match[1].trim() : analise.substring(0, 300);

        await guardarMemoria('analise', sugestoes, null, sessaoId);
        localStorage.removeItem(COACH_CACHE_KEY);
    } catch(e) {
        console.warn('Erro ao guardar memória da análise:', e);
    }
}
