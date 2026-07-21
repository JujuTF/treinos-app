// ============================================
// app.js — Lógica principal da Treinos App
// ============================================

// Estado local do dia
let estadoDia = {
    energia: null,
    sono: null,
    flare: false,
    agua_ml: 0,
    meta_agua_ml: 2000
};

let graficoPeso = null;

// ---- AUTH ----
async function verificarAuth() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) window.location.href = 'login.html';
}

async function fazerLogout() {
    await db.auth.signOut();
    window.location.href = 'login.html';
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
    await verificarAuth();
    setarDataHeader();
    await carregarTreinoHoje();
    await carregarResumoSemana();
    mostrarDeployInfo();
    await carregarDiaHoje();
    await carregarWidgets();
    await carregarCicloResumido();
    carregarCoach(); // não bloqueia — corre em background
    await carregarSessoes();
    await carregarMetricas();
    await carregarCiclo();
    setarDatasDefault();
});

// ---- UTILS ----
function hoje() {
    return new Date().toISOString().split('T')[0];
}

function formatarData(dataStr) {
    if (!dataStr) return '';
    const d = new Date(dataStr + 'T00:00:00');
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

function formatarDia(dataStr) {
    if (!dataStr) return '';
    const d = new Date(dataStr + 'T00:00:00');
    return { dia: d.getDate(), mes: d.toLocaleDateString('pt-PT', { month: 'short' }) };
}

function tempoParaSegundos(str) {
    if (!str) return null;
    const partes = str.split(':');
    if (partes.length === 2) return parseInt(partes[0]) * 60 + parseInt(partes[1]);
    return parseInt(str) * 60;
}

function segundosParaTempo(s) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const seg = s % 60;
    return `${m}:${String(seg).padStart(2, '0')}`;
}

function mostrarToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function setarDatasDefault() {
    const h = hoje();
    ['s-data', 'm-data', 'c-inicio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = h;
    });
}

async function mostrarDeployInfo() {
    try {
        const res = await fetch('https://api.github.com/repos/JujuTF/treinos-app/commits/master');
        const data = await res.json();
        const dataCommit = new Date(data.commit.author.date);
        const formatado = dataCommit.toLocaleDateString('pt-PT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
            timeZone: 'Europe/Lisbon'
        });
        const el = document.getElementById('deploy-info');
        if (el) el.textContent = 'v ' + formatado;
    } catch (e) { /* silencioso */ }
}

function setarDataHeader() {
    const el = document.getElementById('header-data');
    if (!el) return;
    el.textContent = new Date().toLocaleDateString('pt-PT', {
        weekday: 'short', day: 'numeric', month: 'long'
    });
}

// ---- NAVEGAÇÃO ----
const titulosPagina = {
    dashboard: 'Hoje',
    treinos: 'Treinos',
    metricas: 'Corpo',
    ciclo: 'Ciclo'
};

function mudarPagina(pagina, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + pagina)?.classList.add('active');
    el?.classList.add('active');
    document.getElementById('header-titulo').textContent = titulosPagina[pagina] || pagina;
    return false;
}

// ---- MODAIS ----
function abrirModalSessao() {
    document.getElementById('modal-sessao').classList.add('open');
}

function abrirModalMetricas() {
    document.getElementById('modal-metricas').classList.add('open');
}

function abrirModalCiclo() {
    document.getElementById('modal-ciclo').classList.add('open');
}

function fecharModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

// Fechar modal ao clicar no overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('open');
    });
});

// ============================================
// DASHBOARD — REGISTO DIÁRIO
// ============================================

// Picker de energia
document.getElementById('energia-picker')?.addEventListener('click', e => {
    const btn = e.target.closest('.energia-btn');
    if (!btn) return;
    document.querySelectorAll('.energia-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    estadoDia.energia = parseInt(btn.dataset.val);
});

async function carregarDiaHoje() {
    try {
        const { data: rows } = await db
            .from('registo_diario')
            .select('*')
            .eq('data', hoje())
            .limit(1);

        const data = rows && rows.length > 0 ? rows[0] : null;
        if (data) {
            estadoDia = { ...estadoDia, ...data };

            // Energia
            if (data.energia) {
                document.querySelectorAll('.energia-btn').forEach(b => {
                    if (parseInt(b.dataset.val) === data.energia) b.classList.add('selected');
                });
            }

            // Sono
            if (data.horas_sono) {
                document.getElementById('sono-horas').value = data.horas_sono;
            }

            // Flare
            if (data.flare_fibromialgia) {
                document.getElementById('flare-toggle').checked = true;
            }

            // Água
            estadoDia.agua_ml = data.agua_ml || 0;
            estadoDia.meta_agua_ml = data.meta_agua_ml || 2000;
            atualizarAgua();
        }
    } catch (e) {
        // Sem registo hoje ainda — normal
    }
}

async function guardarDiario() {
    const energia = estadoDia.energia;
    const sono = parseFloat(document.getElementById('sono-horas').value) || null;
    const flare = document.getElementById('flare-toggle').checked;

    const payload = {
        data: hoje(),
        energia,
        horas_sono: sono,
        flare_fibromialgia: flare,
        agua_ml: estadoDia.agua_ml,
        meta_agua_ml: estadoDia.meta_agua_ml
    };

    const { error } = await db
        .from('registo_diario')
        .upsert(payload, { onConflict: 'data' });

    if (error) {
        mostrarToast('Erro ao guardar 😕');
        console.error(error);
    } else {
        mostrarToast('Dia guardado ✓');
        await carregarWidgets();
    }
}


// ============================================
// TREINO DE HOJE — CARD DINÂMICO
// ============================================

const AUTOSAVE_KEY = 'treinos_sessao_ativa';

async function carregarTreinoHoje() {
    const container = document.getElementById('treino-hoje-card');
    if (!container) return;

    // Verificar se há sessão em curso no localStorage
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (raw) {
            const estado = JSON.parse(raw);
            // Válida se < 12h
            if (Date.now() - estado.ts < 12 * 60 * 60 * 1000 && estado.nome) {
                const horaGuardada = new Date(estado.ts).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                container.innerHTML = `
                    <div class="card" style="border-left: 4px solid var(--laranja);">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                            <div>
                                <div style="font-weight:700; font-size:1rem; color:var(--azul-escuro);">⏸ ${estado.nome}</div>
                                <div style="font-size:0.78rem; color:var(--cinza-meio); margin-top:2px;">Sessão em curso · guardada às ${horaGuardada}</div>
                            </div>
                            <span class="badge badge-laranja">Em curso</span>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <a href="sessao.html?continuar=1" class="btn btn-primario" style="flex:2; justify-content:center; font-size:0.85rem;">
                                ▶ Continuar treino
                            </a>
                            <button onclick="descartarSessaoAtiva()" class="btn btn-secundario" style="flex:1; font-size:0.82rem;">
                                Descartar
                            </button>
                        </div>
                    </div>`;
                return; // não continuar a verificar BD
            } else {
                localStorage.removeItem(AUTOSAVE_KEY);
            }
        }
    } catch(e) { /* ignorar */ }

    try {
        // Tentar usar o ID da última sessão guardada (mais fiável logo após guardar)
        let data = null;
        const ultimaId = sessionStorage.getItem('ultima_sessao_id');
        if (ultimaId) {
            const { data: sessaoDirecta } = await db
                .from('sessoes_treino')
                .select('*, exercicios_sessao(*)')
                .eq('id', ultimaId)
                .eq('data', hoje())
                .limit(1);
            if (sessaoDirecta && sessaoDirecta.length > 0) {
                data = sessaoDirecta;
            }
        }

        if (!data) {
            const { data: sessoes } = await db
                .from('sessoes_treino')
                .select('*, exercicios_sessao(*)')
                .eq('data', hoje())
                .order('created_at', { ascending: false })
                .limit(1);
            data = sessoes;
        }

        if (data && data.length > 0) {
            const s = data[0];
            const tempo = s.tempo_wod
                ? `${Math.floor(s.tempo_wod/60)}:${String(s.tempo_wod%60).padStart(2,'0')}`
                : null;
            const rounds = s.rounds_completos ? `${s.rounds_completos} rondas` : null;
            const nexs = s.exercicios_sessao?.length || 0;

            container.innerHTML = `
                <div class="card" style="border-left: 4px solid var(--verde);">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                        <div>
                            <div style="font-weight:700; font-size:1rem; color:var(--azul-escuro);">✅ ${s.nome_treino}</div>
                            <div style="font-size:0.78rem; color:var(--cinza-meio); margin-top:2px;">Treino de hoje concluído</div>
                        </div>
                        <span class="badge badge-verde">Feito</span>
                    </div>
                    <div style="display:flex; gap:16px; font-size:0.85rem; color:var(--cinza-meio); margin-bottom:12px;">
                        ${tempo ? `<span>⏱ ${tempo}</span>` : ''}
                        ${rounds ? `<span>🔄 ${rounds}</span>` : ''}
                        ${nexs > 0 ? `<span>💪 ${nexs} exercícios</span>` : ''}
                    </div>
                    ${s.notas ? `<div style="font-size:0.82rem; color:var(--cinza-meio); font-style:italic; margin-bottom:12px;">${s.notas}</div>` : ''}
                    <div style="display:flex; gap:8px;">
                        <a href="sessao.html?id=${s.id}" class="btn btn-secundario" style="flex:1; justify-content:center; font-size:0.85rem;">
                            Ver detalhes
                        </a>
                        <a href="sessao.html" class="btn btn-secundario" style="flex:1; justify-content:center; font-size:0.85rem;">
                            + Outro treino
                        </a>
                    </div>
                </div>`;
        } else {
            // Sem treino hoje — mostrar botão de iniciar e o botão de gerar com Claude
            container.innerHTML = `
                <a href="sessao.html" class="btn btn-primario" style="font-size:1rem; padding:16px 20px;">
                    🏋️ Iniciar treino de hoje
                </a>`;
            const wrap = document.getElementById('btn-gerar-wrap');
            if (wrap) wrap.classList.add('visivel');
        }
    } catch(e) {
        container.innerHTML = `
            <a href="sessao.html" class="btn btn-primario" style="font-size:1rem; padding:16px 20px;">
                🏋️ Iniciar treino de hoje
            </a>`;
        const wrap = document.getElementById('btn-gerar-wrap');
        if (wrap) wrap.classList.add('visivel');
    }
}

function descartarSessaoAtiva() {
    localStorage.removeItem(AUTOSAVE_KEY);
    carregarTreinoHoje();
    mostrarToast('Sessão descartada');
}

// ============================================
// RESUMO DA SEMANA
// ============================================

async function carregarResumoSemana() {
    const container = document.getElementById('resumo-semana');
    if (!container) return;

    const agora = new Date();
    const diaSemana = agora.getDay();
    const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
    const segundaFeira = new Date(agora);
    segundaFeira.setDate(agora.getDate() - diasDesdeSegunda);
    const inicioSemana = segundaFeira.toISOString().split('T')[0];
    const hojeStr = agora.toISOString().split('T')[0];

    const [{ data: sessoes }, { data: registos }] = await Promise.all([
        db.from('sessoes_treino').select('data').gte('data', inicioSemana).lte('data', hojeStr),
        db.from('registo_diario').select('data, energia, horas_sono, flare_fibromialgia').gte('data', inicioSemana).lte('data', hojeStr)
    ]);

    const numTreinos = sessoes ? sessoes.length : 0;
    const comEnergia = (registos || []).filter(r => r.energia);
    const mediaEnergia = comEnergia.length > 0
        ? (comEnergia.reduce((s, r) => s + r.energia, 0) / comEnergia.length).toFixed(1)
        : null;
    const comSono = (registos || []).filter(r => r.horas_sono);
    const mediaSono = comSono.length > 0
        ? (comSono.reduce((s, r) => s + parseFloat(r.horas_sono), 0) / comSono.length).toFixed(1)
        : null;
    const flares = (registos || []).filter(r => r.flare_fibromialgia).length;
    const energiaEmoji = ['', String.fromCodePoint(0x1F634), String.fromCodePoint(0x1F611), String.fromCodePoint(0x1F642), String.fromCodePoint(0x1F4AA), String.fromCodePoint(0x1F525)];
    const diasLetras = ['S','T','Q','Q','S','S','D'];

    // Calendário
    const dias = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(segundaFeira);
        d.setDate(segundaFeira.getDate() + i);
        const ds = d.toISOString().split('T')[0];
        const treinou = (sessoes || []).some(s => s.data === ds);
        const reg = (registos || []).find(r => r.data === ds);
        const energia = reg ? reg.energia : null;
        const ehHoje = ds === hojeStr;
        const futuro = ds > hojeStr;
        dias.push({ letra: diasLetras[i], treinou, energia, ehHoje, futuro });
    }

    // Construir HTML sem template literals problemáticos
    const partes = [];
    partes.push('<div class="card">');
    partes.push('<div class="card-titulo">Esta semana</div>');
    partes.push('<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:14px;">');

    dias.forEach(function(d) {
        var bg = d.ehHoje ? 'var(--verde)' : d.treinou ? 'var(--verde-claro)' : d.futuro ? 'transparent' : 'var(--cinza-claro)';
        var cor = d.ehHoje ? 'white' : d.treinou ? 'var(--verde)' : 'var(--cinza-meio)';
        var brd = d.futuro && !d.ehHoje ? '1.5px dashed var(--cinza-borda)' : 'none';
        var ico = d.energia ? energiaEmoji[d.energia] : d.treinou ? '✓' : d.futuro ? '' : '·';
        var fs = d.energia ? '1rem' : '0.75rem';
        partes.push('<div style="text-align:center">');
        partes.push('<div style="font-size:0.6rem;color:var(--cinza-meio);margin-bottom:3px;font-weight:600">' + d.letra + '</div>');
        partes.push('<div style="width:32px;height:32px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:' + fs + ';background:' + bg + ';color:' + cor + ';border:' + brd + '">' + ico + '</div>');
        partes.push('</div>');
    });

    partes.push('</div>');
    partes.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">');
    partes.push('<div style="text-align:center;background:var(--fundo);border-radius:var(--radius-sm);padding:10px"><div style="font-size:1.4rem;font-weight:700;color:var(--verde)">' + numTreinos + '</div><div style="font-size:0.68rem;color:var(--cinza-meio);margin-top:2px">treinos</div></div>');
    var emojiMedia = mediaEnergia ? energiaEmoji[Math.round(parseFloat(mediaEnergia))] : '—';
    partes.push('<div style="text-align:center;background:var(--fundo);border-radius:var(--radius-sm);padding:10px"><div style="font-size:1.4rem;font-weight:700;color:var(--azul-escuro)">' + emojiMedia + '</div><div style="font-size:0.68rem;color:var(--cinza-meio);margin-top:2px">energia média</div></div>');
    partes.push('<div style="text-align:center;background:var(--fundo);border-radius:var(--radius-sm);padding:10px"><div style="font-size:1.4rem;font-weight:700;color:var(--azul-escuro)">' + (mediaSono || '—') + '</div><div style="font-size:0.68rem;color:var(--cinza-meio);margin-top:2px">h sono médio</div></div>');
    partes.push('</div>');
    if (flares > 0) {
        partes.push('<div style="margin-top:8px;font-size:0.78rem;color:var(--laranja)">🌪️ ' + flares + ' dia' + (flares > 1 ? 's' : '') + ' com flare esta semana</div>');
    }
    partes.push('</div>');
    container.innerHTML = partes.join('');
}

// ============================================
// WIDGETS DASHBOARD
// ============================================

async function carregarWidgets() {
    const { data: rows } = await db
        .from('registo_diario')
        .select('*')
        .eq('data', hoje())
        .limit(1);

    const data = rows && rows.length > 0 ? rows[0] : null;
    const container = document.getElementById('widgets-hoje');
    if (!container) return;

    const energiaEmoji = ['', '😴', '😑', '🙂', '💪', '🔥'];
    const e = data?.energia;
    const s = data?.horas_sono;
    const agua = data?.agua_ml || 0;
    const meta = data?.meta_agua_ml || 2000;
    const pct = Math.min(100, Math.round((agua / meta) * 100));

    container.innerHTML = `
        <div class="widget destaque">
            <div class="widget-valor">${e ? energiaEmoji[e] : '—'}</div>
            <div class="widget-label">Energia ${e ? e + '/5' : 'por registar'}</div>
        </div>
        <div class="widget">
            <div class="widget-valor">${s ?? '—'}</div>
            <div class="widget-label">horas de sono</div>
        </div>
        <div class="widget">
            <div class="widget-valor">${pct}%</div>
            <div class="widget-label">hidratação</div>
        </div>
    `;
}

// ============================================
// HIDRATAÇÃO
// ============================================

function atualizarAgua() {
    const ml = estadoDia.agua_ml;
    const meta = estadoDia.meta_agua_ml;
    const pct = Math.min(100, (ml / meta) * 100);

    document.getElementById('agua-atual').textContent = ml + ' ml';
    document.getElementById('agua-fill').style.width = pct + '%';
    document.getElementById('agua-meta-label').textContent = meta;
}

async function addAgua(ml) {
    estadoDia.agua_ml = (estadoDia.agua_ml || 0) + ml;
    atualizarAgua();

    await db.from('registo_diario').upsert({
        data: hoje(),
        agua_ml: estadoDia.agua_ml,
        meta_agua_ml: estadoDia.meta_agua_ml
    }, { onConflict: 'data' });

    await carregarWidgets();
}

async function resetAgua() {
    estadoDia.agua_ml = 0;
    atualizarAgua();

    await db.from('registo_diario').upsert({
        data: hoje(),
        agua_ml: 0,
        meta_agua_ml: estadoDia.meta_agua_ml
    }, { onConflict: 'data' });
}

// ============================================
// CICLO — RESUMO NO DASHBOARD
// ============================================

const FASES = [
    { nome: 'Menstrual', emoji: '🔴', dias: [1, 5], cor: '#FCA5A5', descricao: 'Energia mais baixa. Prioriza recuperação.' },
    { nome: 'Folicular', emoji: '🌱', dias: [6, 13], cor: '#86EFAC', descricao: 'Energia a subir. Boa fase para treinos intensos.' },
    { nome: 'Ovulação', emoji: '✨', dias: [14, 16], cor: '#FDE68A', descricao: 'Pico de energia. Máximo desempenho.' },
    { nome: 'Lútea', emoji: '🌙', dias: [17, 28], cor: '#C4B5FD', descricao: 'Energia variável. Foca em treinos moderados.' }
];

function calcularFase(diasCiclo) {
    for (const fase of FASES) {
        if (diasCiclo >= fase.dias[0] && diasCiclo <= fase.dias[1]) return fase;
    }
    return FASES[3]; // lútea por defeito
}

async function carregarCicloResumido() {
    try {
        const { data: rows } = await db
            .from('ciclo_menstrual')
            .select('*')
            .order('inicio', { ascending: false })
            .limit(1);

        const container = document.getElementById('ciclo-info');
        if (!container) return;

        const data = rows && rows.length > 0 ? rows[0] : null;
        if (!data) {
            container.innerHTML = `<span style="color:var(--cinza-meio); font-size:0.9rem;">Sem registos. Vai ao separador Ciclo para adicionar.</span>`;
            return;
        }

        const inicio = new Date(data.inicio + 'T00:00:00');
        const agora = new Date();
        const diasCiclo = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24)) + 1;
        const fase = calcularFase(diasCiclo);

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:2rem;">${fase.emoji}</span>
                <div>
                    <div style="font-weight:700; color:var(--azul-escuro);">${fase.nome} — dia ${diasCiclo}</div>
                    <div style="font-size:0.82rem; color:var(--cinza-meio); margin-top:2px;">${fase.descricao}</div>
                </div>
            </div>
        `;
    } catch (e) {
        // sem dados
    }
}

// ============================================
// COACH MOTIVACIONAL COM AI
const COACH_CACHE_KEY = 'treinos_coach_cache';
const COACH_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 horas

async function carregarCoach() {
    const container = document.getElementById('coach-card');
    if (!container) return;

    // Mostrar cache enquanto carrega
    try {
        const cached = localStorage.getItem(COACH_CACHE_KEY);
        if (cached) {
            const { msg, acao, label, ts } = JSON.parse(cached);
            if (Date.now() - ts < COACH_CACHE_TTL) {
                mostrarMensagemCoach(container, msg, acao, label);
                return; // cache válida — não chama o Worker
            }
        }
    } catch(e) {}

    // Recolher contexto
    try {
        const hojeStr = hoje();

        const [r1, r2, r3, r4, r5] = await Promise.all([
            db.from('sessoes_treino').select('data, nome_treino').order('data', { ascending: false }).limit(3),
            db.from('registo_diario').select('*').eq('data', hojeStr).limit(1),
            db.from('metricas_corporais').select('data, peso_kg').order('data', { ascending: false }).limit(1),
            db.from('ciclo_menstrual').select('*').order('inicio', { ascending: false }).limit(1),
            db.from('sessoes_treino').select('nome_treino, data, notas').order('data', { ascending: false }).limit(5)
        ]);
        const sessoes = r1.data, regDia = r2.data, pesos = r3.data, ciclos = r4.data, ultSessoes = r5.data;
        console.log('Coach dados:', { sessoes, regDia, pesos, ciclos });

        const ultimoTreino = sessoes && sessoes.length > 0 ? sessoes[0] : null;
        const diasSemTreino = ultimoTreino
            ? Math.floor((new Date() - new Date(ultimoTreino.data + 'T00:00:00')) / 86400000)
            : 99;

        const reg = regDia && regDia.length > 0 ? regDia[0] : {};
        const aguaAtual = reg.agua_ml || 0;
        const metaAgua = reg.meta_agua_ml || 2000;
        const pctAgua = Math.round(aguaAtual / metaAgua * 100);
        const energia = reg.energia || null;
        const sono = reg.horas_sono || null;
        const flare = reg.flare_fibromialgia || false;

        const ultimoPeso = pesos && pesos.length > 0 ? pesos[0] : null;
        const diasSemPeso = ultimoPeso
            ? Math.floor((new Date() - new Date(ultimoPeso.data + 'T00:00:00')) / 86400000)
            : 99;

        let diasCiclo = null, faseNome = null;
        if (ciclos && ciclos.length > 0) {
            diasCiclo = Math.floor((new Date() - new Date(ciclos[0].inicio + 'T00:00:00')) / 86400000) + 1;
            faseNome = calcularFase(diasCiclo)?.nome || null;
        }

        const historicoTreinos = (ultSessoes || []).map(s => s.nome_treino + ' (' + s.data + ')').join(', ');

        // Carregar memória da BD (coach.js)
        let memoriaRecente = null, resumoMensal = null;
        if (typeof carregarMemoriaCoach === 'function') {
            const mem = await carregarMemoriaCoach();
            memoriaRecente = mem.memoriaRecente;
            resumoMensal = mem.resumoMensal;
        }

        // Construir contexto para o Worker
        const contexto = {
            data_hoje: hojeStr,
            energia: energia ? energia + '/5' : 'não registada',
            horas_sono: sono ? sono + 'h' : 'não registado',
            flare_fibromialgia: flare,
            agua_ml: aguaAtual,
            pct_agua: pctAgua + '%',
            meta_agua_ml: metaAgua,
            dias_sem_treinar: diasSemTreino,
            ultimo_treino: ultimoTreino ? ultimoTreino.nome_treino + ' em ' + ultimoTreino.data : 'sem registos',
            historico_recente: historicoTreinos || 'sem registos',
            fase_ciclo: faseNome || 'desconhecida',
            dia_ciclo: diasCiclo,
            dias_sem_pesagem: diasSemPeso,
            ultimo_peso_kg: ultimoPeso ? ultimoPeso.peso_kg + 'kg' : 'sem registo',
            memoria_recente: memoriaRecente,
            resumo_mensal: resumoMensal
        };

        // Chamar Worker
        const response = await fetch('https://treinos-claude.jujutfigueiredo.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'coach_diario', dados: contexto })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);

        // Parsear resposta JSON do Worker
        let coachData;
        try {
            coachData = JSON.parse(result.texto);
        } catch(e) {
            // Fallback se não vier JSON
            coachData = { mensagem: result.texto, acao: null, label: null };
        }

        const { mensagem, acao, label } = coachData;

        // Guardar cache
        localStorage.setItem(COACH_CACHE_KEY, JSON.stringify({
            msg: mensagem, acao, label, ts: Date.now()
        }));

        // Guardar na memória da BD
        if (typeof guardarMemoria === 'function') {
            guardarMemoria('coach_diario', mensagem, {
                energia: energia, agua_ml: aguaAtual, fase_ciclo: faseNome
            });
        }

        mostrarMensagemCoach(container, mensagem, acao, label);

    } catch(e) {
        console.error('Coach AI falhou:', e);
        // não esconder — mostrar mensagem de fallback
        container.innerHTML = '<div style="font-size:0.85rem;color:var(--cinza-meio);">Coach indisponível</div>';
        container.classList.add('visivel');
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

// TREINOS
// ============================================

async function carregarSessoes() {
    const { data, error } = await db
        .from('sessoes_treino')
        .select('*')
        .order('data', { ascending: false })
        .limit(20);

    const container = document.getElementById('lista-sessoes');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="card">
                <div class="vazio">
                    <div class="vazio-icon">🏋️</div>
                    <p>Ainda sem sessões registadas.<br>Começa hoje!</p>
                </div>
            </div>`;
        return;
    }

    const html = data.map(s => {
        const { dia, mes } = formatarDia(s.data);
        const tempo = s.tempo_wod ? segundosParaTempo(s.tempo_wod) : '';
        const rounds = s.rounds_completos ? `${s.rounds_completos} rds` : '';
        const detalhe = [tempo, rounds].filter(Boolean).join(' · ');
        return `
            <div class="sessao-item" onclick="verSessao('${s.id}')">
                <div class="sessao-data">
                    <div class="sessao-data-dia">${dia}</div>
                    <div class="sessao-data-mes">${mes}</div>
                </div>
                <div class="sessao-info">
                    <div class="sessao-nome">${s.nome_treino}</div>
                    <div class="sessao-detalhe">${detalhe || s.tipo || ''}</div>
                </div>
                ${tempo ? `<div class="sessao-tempo">${tempo}</div>` : ''}
            </div>`;
    }).join('');

    container.innerHTML = `<div class="card">${html}</div>`;
}

async function guardarSessao() {
    const nome = document.getElementById('s-nome').value.trim();
    const data = document.getElementById('s-data').value;

    if (!nome || !data) {
        mostrarToast('Preenche pelo menos a data e o nome');
        return;
    }

    const tempoStr = document.getElementById('s-tempo').value.trim();
    const tempo_wod = tempoStr ? tempoParaSegundos(tempoStr) : null;
    const rounds = parseInt(document.getElementById('s-rounds').value) || null;

    const payload = {
        data,
        nome_treino: nome,
        tipo: document.getElementById('s-tipo').value,
        tempo_wod,
        rounds_completos: rounds,
        notas: document.getElementById('s-notas').value.trim() || null
    };

    const { error } = await db.from('sessoes_treino').insert(payload);

    if (error) {
        mostrarToast('Erro ao guardar 😕');
        console.error(error);
    } else {
        mostrarToast('Sessão guardada ✓');
        fecharModal('modal-sessao');
        limparFormSessao();
        await carregarSessoes();
    }
}

function limparFormSessao() {
    ['s-nome', 's-tempo', 's-rounds', 's-notas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('s-data').value = hoje();
}

function verSessao(id) {
    window.location.href = `sessao.html?id=${id}`;
}

// ============================================
// MÉTRICAS CORPORAIS
// ============================================

async function carregarMetricas() {
    const { data } = await db
        .from('metricas_corporais')
        .select('*')
        .order('data', { ascending: false })
        .limit(10);

    // Último registo
    const el = document.getElementById('ultimo-registo-corpo');
    if (el && data && data.length > 0) {
        const u = data[0];
        el.innerHTML = `
            <div class="card-titulo">Último registo — ${formatarData(u.data)}</div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:4px;">
                ${metricaItem('⚖️', u.peso_kg, 'kg', 'Peso')}
                ${metricaItem('💪', u.massa_muscular, 'kg', 'Músculo')}
                ${metricaItem('🔥', u.gordura_corporal, '%', 'Gordura')}
                ${metricaItem('💧', u.agua_corporal, '%', 'Água')}
                ${metricaItem('🦴', u.massa_ossea, 'kg', 'Óssea')}
                ${metricaItem('⚡', u.idade_metabolica, 'anos', 'Id. Met.')}
            </div>`;
    }

    // Gráfico
    if (data && data.length > 0) {
        const labels = data.map(d => formatarData(d.data)).reverse();
        const pesos = data.map(d => d.peso_kg).reverse();
        renderGraficoPeso(labels, pesos);
    }
}

function metricaItem(emoji, val, unidade, label) {
    return `
        <div style="text-align:center;">
            <div style="font-size:1.2rem;">${emoji}</div>
            <div style="font-weight:700; font-family:'DM Mono',monospace; font-size:1rem; color:var(--azul-escuro);">${val ?? '—'}<span style="font-size:0.7rem; font-weight:400; color:var(--cinza-meio); margin-left:2px;">${val ? unidade : ''}</span></div>
            <div style="font-size:0.7rem; color:var(--cinza-meio);">${label}</div>
        </div>`;
}

function renderGraficoPeso(labels, dados) {
    const ctx = document.getElementById('grafico-peso');
    if (!ctx) return;

    if (graficoPeso) graficoPeso.destroy();

    graficoPeso = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Peso (kg)',
                data: dados,
                borderColor: '#2A9D8F',
                backgroundColor: 'rgba(42,157,143,0.08)',
                pointBackgroundColor: '#2A9D8F',
                pointRadius: 4,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: false, grid: { color: '#F3F4F6' } },
                x: { grid: { display: false } }
            }
        }
    });
}

async function guardarMetricas() {
    const data = document.getElementById('m-data').value;
    if (!data) { mostrarToast('Escolhe uma data'); return; }

    const payload = {
        data,
        peso_kg: parseFloat(document.getElementById('m-peso').value) || null,
        imc: parseFloat(document.getElementById('m-imc').value) || null,
        gordura_corporal: parseFloat(document.getElementById('m-gordura').value) || null,
        gordura_visceral: parseInt(document.getElementById('m-visceral').value) || null,
        massa_muscular: parseFloat(document.getElementById('m-muscular').value) || null,
        agua_corporal: parseFloat(document.getElementById('m-agua').value) || null,
        idade_metabolica: parseInt(document.getElementById('m-idade-met').value) || null,
        massa_ossea: parseFloat(document.getElementById('m-ossea').value) || null
    };

    const { error } = await db
        .from('metricas_corporais')
        .upsert(payload, { onConflict: 'data' });

    if (error) {
        mostrarToast('Erro ao guardar 😕');
        console.error(error);
    } else {
        mostrarToast('Métricas guardadas ✓');
        fecharModal('modal-metricas');
        await carregarMetricas();
    }
}

// ============================================
// CICLO MENSTRUAL
// ============================================

async function carregarCiclo() {
    const { data } = await db
        .from('ciclo_menstrual')
        .select('*')
        .order('inicio', { ascending: false })
        .limit(6);

    // Fase atual
    const faseEl = document.getElementById('ciclo-fase-detalhe');
    if (faseEl && data && data.length > 0) {
        const ultimo = data[0];
        const inicio = new Date(ultimo.inicio + 'T00:00:00');
        const agora = new Date();
        const diasCiclo = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24)) + 1;
        const fase = calcularFase(diasCiclo);

        faseEl.innerHTML = `
            <div style="display:flex; align-items:center; gap:14px; padding:8px 0;">
                <div style="font-size:2.5rem; line-height:1;">${fase.emoji}</div>
                <div>
                    <div style="font-weight:700; font-size:1.1rem; color:var(--azul-escuro);">${fase.nome}</div>
                    <div style="font-size:0.82rem; color:var(--cinza-meio); margin-top:2px;">Dia ${diasCiclo} do ciclo</div>
                    <div style="font-size:0.82rem; color:var(--cinza-meio); margin-top:4px;">${fase.descricao}</div>
                </div>
            </div>
            <div style="background:var(--cinza-claro); border-radius:99px; height:8px; margin-top:10px; overflow:hidden;">
                <div style="height:100%; width:${Math.min(100, (diasCiclo/28)*100)}%; background:${fase.cor}; border-radius:99px;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.72rem; color:var(--cinza-meio);">
                <span>Dia 1</span><span>Dia 14</span><span>Dia 28</span>
            </div>`;
    }

    // Histórico
    const histEl = document.getElementById('ciclo-historico');
    if (histEl && data && data.length > 0) {
        histEl.innerHTML = data.map(c => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--cinza-claro);">
                <div>
                    <div style="font-weight:600; font-size:0.9rem;">${formatarData(c.inicio)}</div>
                    ${c.fim ? `<div style="font-size:0.78rem; color:var(--cinza-meio);">até ${formatarData(c.fim)}</div>` : ''}
                </div>
                ${c.notas ? `<div style="font-size:0.78rem; color:var(--cinza-meio); max-width:60%; text-align:right;">${c.notas}</div>` : ''}
            </div>`).join('');
    }
}

async function guardarCiclo() {
    const inicio = document.getElementById('c-inicio').value;
    if (!inicio) { mostrarToast('Escolhe a data de início'); return; }

    const payload = {
        inicio,
        fim: document.getElementById('c-fim').value || null,
        notas: document.getElementById('c-notas').value.trim() || null
    };

    const { error } = await db.from('ciclo_menstrual').insert(payload);

    if (error) {
        mostrarToast('Erro ao guardar 😕');
        console.error(error);
    } else {
        mostrarToast('Ciclo registado ✓');
        fecharModal('modal-ciclo');
        await carregarCiclo();
        await carregarCicloResumido();
    }
}
// ============================================
// CLAUDE — GERAR TREINO
// ============================================

const WORKER_URL = 'https://treinos-claude.jujutfigueiredo.workers.dev';

function selecionarTempo(btn) {
    // Destacar botão selecionado
    document.querySelectorAll('.tempo-btn').forEach(b => b.classList.remove('btn-primario'));
    btn.classList.add('btn-primario');
    // Preencher o campo custom com o valor
    const input = document.getElementById('gerar-tempo-custom');
    if (input) input.value = btn.dataset.min;
}

function confirmarGerarTreino() {
    const tempoInput = document.getElementById('gerar-tempo-custom');
    const notasInput = document.getElementById('gerar-notas');
    const tempo = tempoInput ? parseInt(tempoInput.value) || null : null;
    const notas = notasInput ? notasInput.value.trim() : '';

    if (!tempo) {
        mostrarToast('Indica o tempo disponível');
        return;
    }

    fecharModal('modal-gerar-treino');
    _gerarTreinoHoje(tempo, notas);
}

function gerarTreinoHoje() {
    // Abrir modal de configuração antes de gerar
    const modal = document.getElementById('modal-gerar-treino');
    if (modal) modal.classList.add('open');
}

async function _gerarTreinoHoje(tempoMinutos, notasExtra) {
    var btn = document.getElementById('btn-gerar-treino');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ A gerar treino...'; }

    try {
        var hojeStr = hoje();

        var results = await Promise.all([
            db.from('registo_diario').select('*').eq('data', hojeStr).limit(1),
            db.from('ciclo_menstrual').select('*').order('inicio', { ascending: false }).limit(1),
            db.from('sessoes_treino').select('nome_treino, data, tipo').order('data', { ascending: false }).limit(1)
        ]);

        var reg = results[0].data && results[0].data.length > 0 ? results[0].data[0] : {};
        var ciclos = results[1].data || [];
        var ultimaSessao = results[2].data || [];

        var fase_ciclo = 'não disponível';
        var dia_ciclo = null;
        if (ciclos.length > 0) {
            var inicio = new Date(ciclos[0].inicio + 'T00:00:00');
            dia_ciclo = Math.floor((new Date() - inicio) / (1000*60*60*24)) + 1;
            var fases = [
                { nome: 'Menstrual', d: [1,5] },
                { nome: 'Folicular', d: [6,13] },
                { nome: 'Ovulação', d: [14,16] },
                { nome: 'Lútea', d: [17,35] }
            ];
            for (var i = 0; i < fases.length; i++) {
                if (dia_ciclo >= fases[i].d[0] && dia_ciclo <= fases[i].d[1]) {
                    fase_ciclo = fases[i].nome; break;
                }
            }
        }

        var dados = {
            energia: reg.energia || null,
            horas_sono: reg.horas_sono || null,
            flare: reg.flare_fibromialgia || false,
            agua_ml: reg.agua_ml || 0,
            meta_agua_ml: reg.meta_agua_ml || 2000,
            fase_ciclo: fase_ciclo,
            dia_ciclo: dia_ciclo,
            ultimo_treino: ultimaSessao.length > 0
                ? ultimaSessao[0].nome_treino + ' (' + ultimaSessao[0].data + ')'
                : null,
            notas_extra: notasExtra || reg.notas || null,
            tempo_disponivel_min: tempoMinutos || null
        };

        var response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'gerar_treino', dados: dados })
        });

        var result = await response.json();
        if (result.error) throw new Error(result.error);

        // Usar localStorage (mais persistente que sessionStorage)
        localStorage.setItem('treino_gerado_md', result.texto);
        localStorage.setItem('treino_gerado_data', hojeStr);
        window.location.href = 'sessao.html?gerado=1';

    } catch(e) {
        console.error(e);
        mostrarToast('Erro ao gerar treino 😕');
        if (btn) { btn.disabled = false; btn.textContent = '⚡ Gerar treino de hoje com Claude'; }
    }
}