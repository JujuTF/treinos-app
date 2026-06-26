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
    await carregarDiaHoje();
    await carregarWidgets();
    await carregarCicloResumido();
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
        const { data } = await db
            .from('registo_diario')
            .select('*')
            .eq('data', hoje())
            .single();

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
// WIDGETS DASHBOARD
// ============================================

async function carregarWidgets() {
    const { data } = await db
        .from('registo_diario')
        .select('*')
        .eq('data', hoje())
        .single();

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
        const { data } = await db
            .from('ciclo_menstrual')
            .select('*')
            .order('inicio', { ascending: false })
            .limit(1)
            .single();

        const container = document.getElementById('ciclo-info');
        if (!container) return;

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
    // TODO: página de detalhe da sessão
    mostrarToast('Detalhe da sessão — em breve!');
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