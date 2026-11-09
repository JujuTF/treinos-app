// ============================================
// app.js — Lógica principal da Treinos App
// ============================================

// Estado local do dia
let estadoDia = {
    agua_ml: 0,
    meta_agua_ml: 2000
};

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
    configurarTreino();
    await carregarSessoes();
    mostrarDeployInfo();
    await carregarDiaHoje();
    await carregarCicloResumido();
});

// ---- UTILS ----
function hoje() {
    return CicloCalc.hojeLocal();
}

function mostrarToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
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

// ============================================
// DASHBOARD — REGISTO DIÁRIO
// ============================================

async function carregarDiaHoje() {
    try {
        const { data: rows } = await db
            .from('registo_diario')
            .select('agua_ml, meta_agua_ml')
            .eq('data', hoje())
            .limit(1);

        const data = rows && rows.length > 0 ? rows[0] : null;
        if (data) {
            estadoDia.agua_ml = data.agua_ml || 0;
            estadoDia.meta_agua_ml = data.meta_agua_ml || 2000;
            atualizarAgua();
        }
    } catch (e) {
        // Sem registo hoje ainda — normal
    }
}

// ============================================
// TREINOS — "Treinei hoje" + resumo da semana
// ============================================

// Tipos já usados em sessoes_treino (ver histórico do git, commit 762e9ef)
const TIPOS_TREINO = { 'Treino': 'Força', 'Caminhada': 'Cardio', 'Mobilidade': 'Mobilidade' };

let sessoesRecentes = [];                 // últimos ~400 dias: { id, data, created_at }
let treinoSel = { min: null, tipo: 'Treino' };
let _confirmarResolve = null;

async function carregarSessoes() {
    const desde = TreinoCalc.somarDias(hoje(), -400);
    const { data, error } = await db
        .from('sessoes_treino')
        .select('id, data, created_at')
        .gte('data', desde)
        .order('data', { ascending: false })
        .limit(1000);
    if (error) console.warn('sessoes_treino:', error.message);
    sessoesRecentes = error ? [] : (data || []);
    renderTreinoHoje();
    renderResumoSemana();
}

function sessoesDeHoje() {
    return sessoesRecentes
        .filter(s => s.data === hoje())
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function renderTreinoHoje() {
    const el = document.getElementById('treino-hoje');
    if (!el) return;
    const sessoes = sessoesDeHoje();

    if (!sessoes.length) {
        el.innerHTML = `<button class="btn btn-primario btn-grande" onclick="abrirTreino()">Treinei hoje</button>`;
        return;
    }

    const n = sessoes.length;
    el.innerHTML = `
        <div class="card" style="border-left:4px solid var(--verde); margin-bottom:0;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="font-weight:700; color:var(--azul-escuro);">✅ Treino registado hoje${n > 1 ? ' (' + n + ')' : ''}</div>
                <span class="badge badge-verde">Feito</span>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-secundario" style="flex:1; font-size:0.85rem; justify-content:center;" onclick="abrirTreino()">+ Outro treino</button>
                <button class="btn btn-secundario" style="flex:1; font-size:0.85rem; justify-content:center;" onclick="pedirDesfazerTreino()">Desfazer</button>
            </div>
        </div>`;
}

// ---- folha rápida ----
function configurarTreino() {
    // chips: duração (opcional, desmarca ao tocar de novo) e tipo
    document.getElementById('chips-duracao')?.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const min = parseInt(chip.dataset.min);
        treinoSel.min = treinoSel.min === min ? null : min;
        pintarChips();
    });
    document.getElementById('chips-tipo')?.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        treinoSel.tipo = chip.dataset.tipo;
        pintarChips();
    });
    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.addEventListener('click', e => {
            if (e.target !== ov) return;
            if (ov.id === 'modal-confirmar') responderConfirmacao(false);
            else ov.classList.remove('open');
        });
    });
}

function pintarChips() {
    document.querySelectorAll('#chips-duracao .chip').forEach(c =>
        c.classList.toggle('sel', parseInt(c.dataset.min) === treinoSel.min));
    document.querySelectorAll('#chips-tipo .chip').forEach(c =>
        c.classList.toggle('sel', c.dataset.tipo === treinoSel.tipo));
}

function abrirTreino() {
    treinoSel = { min: null, tipo: 'Treino' };
    pintarChips();
    document.getElementById('modal-treino').classList.add('open');
}

function fecharTreino() {
    document.getElementById('modal-treino').classList.remove('open');
}

async function guardarTreino() {
    const nome = treinoSel.tipo || 'Treino';
    const payload = {
        data: hoje(),
        nome_treino: nome,
        tipo: TIPOS_TREINO[nome] || 'Força',
        tempo_wod: treinoSel.min ? treinoSel.min * 60 : null,
        rounds_completos: null,
        notas: null
    };

    const { error } = await db.from('sessoes_treino').insert(payload);
    if (error) {
        console.error(error);
        mostrarToast('Erro ao guardar 😕');
        return;
    }
    fecharTreino();
    mostrarToast('Treino registado ✓');
    await carregarSessoes();
}

// ---- confirmação ----
function pedirConfirmacao(titulo, texto, rotuloOk) {
    document.getElementById('confirmar-titulo').textContent = titulo;
    document.getElementById('confirmar-texto').textContent = texto;
    document.getElementById('confirmar-ok').textContent = rotuloOk || 'Confirmar';
    document.getElementById('modal-confirmar').classList.add('open');
    return new Promise(resolve => { _confirmarResolve = resolve; });
}

function responderConfirmacao(valor) {
    document.getElementById('modal-confirmar').classList.remove('open');
    const r = _confirmarResolve;
    _confirmarResolve = null;
    if (r) r(valor);
}

async function pedirDesfazerTreino() {
    const ultima = sessoesDeHoje()[0];
    if (!ultima) return;

    const ok = await pedirConfirmacao(
        'Desfazer treino',
        'Queres apagar o último treino registado hoje?',
        'Desfazer'
    );
    if (!ok) return;

    const { error } = await db.from('sessoes_treino').delete().eq('id', ultima.id);
    if (error) {
        console.error(error);
        mostrarToast('Não foi possível desfazer 😕');
        return;
    }
    mostrarToast('Treino removido');
    await carregarSessoes();
}

// ============================================
// RESUMO DA SEMANA
// ============================================

function renderResumoSemana() {
    const container = document.getElementById('resumo-semana');
    if (!container) return;

    const hojeStr = hoje();
    const datas = TreinoCalc.datasUnicas(sessoesRecentes);
    const segunda = TreinoCalc.inicioSemana(hojeStr);
    const letras = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

    let bolinhas = '';
    for (let i = 0; i < 7; i++) {
        const ds = TreinoCalc.somarDias(segunda, i);
        const treinou = datas.indexOf(ds) !== -1;
        const ehHoje = ds === hojeStr;
        const futuro = ds > hojeStr;
        const bg = ehHoje ? 'var(--verde)' : treinou ? 'var(--verde-claro)' : futuro ? 'transparent' : 'var(--cinza-claro)';
        const cor = ehHoje ? 'white' : treinou ? 'var(--verde)' : 'var(--cinza-meio)';
        const borda = futuro && !ehHoje ? '1.5px dashed var(--cinza-borda)' : 'none';
        const icone = treinou ? '✓' : futuro ? '' : '·';
        bolinhas += `
            <div style="text-align:center">
                <div style="font-size:0.6rem; color:var(--cinza-meio); margin-bottom:3px; font-weight:600">${letras[i]}</div>
                <div style="width:32px; height:32px; border-radius:50%; margin:0 auto; display:flex; align-items:center; justify-content:center; font-size:0.75rem; background:${bg}; color:${cor}; border:${borda}">${icone}</div>
            </div>`;
    }

    const diasSemana = TreinoCalc.contarIntervalo(datas, segunda, TreinoCalc.somarDias(segunda, 6));
    const sequencia = TreinoCalc.sequenciaAtual(datas, hojeStr);
    const caixa = (valor, rotulo) => `
        <div style="text-align:center; background:var(--fundo); border-radius:var(--radius-sm); padding:10px;">
            <div style="font-size:1.4rem; font-weight:700; color:var(--verde);">${valor}</div>
            <div style="font-size:0.68rem; color:var(--cinza-meio); margin-top:2px;">${rotulo}</div>
        </div>`;

    container.innerHTML = `
        <div class="card">
            <div class="card-titulo">Esta semana</div>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-bottom:14px;">${bolinhas}</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                ${caixa(diasSemana, diasSemana === 1 ? 'dia treinado' : 'dias treinados')}
                ${caixa(sequencia, sequencia === 1 ? 'dia de sequência' : 'dias de sequência')}
            </div>
        </div>`;
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

async function carregarCicloResumido() {
    const container = document.getElementById('ciclo-info');
    if (!container) return;

    try {
        const { data: rows } = await db
            .from('ciclo_menstrual')
            .select('inicio, fim')
            .order('inicio', { ascending: false })
            .limit(24);

        // Modo discreto: só "Ciclo - dia N" e um link. Nem sequer consulta os eventos,
        // por isso o aspeto é igual com ou sem gravidez.
        if (Discreto.ativo()) {
            const fd = CicloCalc.faseAtual(rows || [], CicloCalc.hojeLocal());
            container.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                    <div style="font-weight:700; color:var(--azul-escuro);">${fd ? 'Ciclo - dia ' + fd.dia : 'Ciclo'}</div>
                    <a href="ciclo.html" style="font-size:0.85rem; font-weight:600; color:var(--verde); text-decoration:none;">Ver detalhes</a>
                </div>`;
            return;
        }

        // Modo gravidez: esconde janela fértil, ovulação e previsão
        const { data: eventos, error: erroEventos } = await db
            .from('ciclo_eventos')
            .select('data, tipo, nota')
            .in('tipo', ['gravidez', 'perda']);
        const gravidez = CicloCalc.modoGravidez(erroEventos ? [] : (eventos || []));
        if (gravidez.ativo) {
            const g = CicloCalc.semanasGravidez(rows || [], CicloCalc.hojeLocal());
            container.innerHTML = `
                <div style="font-weight:700; font-size:1.05rem; color:var(--azul-escuro);">${CicloCalc.textoGravidez(g)}</div>
                <div style="margin-top:6px; font-size:0.8rem; color:var(--cinza-meio);">${CicloCalc.TEXTO_GRAVIDEZ}</div>
            `;
            return;
        }

        const f = CicloCalc.faseAtual(rows || [], CicloCalc.hojeLocal());
        if (!f) {
            container.innerHTML = `<span style="color:var(--cinza-meio); font-size:0.9rem;">Sem registos. Vai ao separador Ciclo para adicionar.</span>`;
            return;
        }

        const info = CicloCalc.FASES_INFO[f.nome];
        const janela = CicloCalc.textoJanela(f);

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:2rem;">${info.emoji}</span>
                <div>
                    <div style="font-weight:700; color:var(--azul-escuro);">${f.nome} — dia ${f.dia}</div>
                    ${janela ? `<div style="font-size:0.85rem; font-weight:600; color:#854D0E; margin-top:2px;">${janela}</div>` : ''}
                    <div style="font-size:0.82rem; color:var(--cinza-meio); margin-top:2px;">${CicloCalc.textoMenstruacao(f)}</div>
                </div>
            </div>
            ${f.aviso ? `<div style="margin-top:8px; padding:8px 12px; border-radius:var(--radius-sm); background:#FEF3C7; color:#92400E; font-size:0.78rem;">⚠️ ${f.aviso}</div>` : ''}
            <div style="margin-top:8px; font-size:0.72rem; color:var(--cinza-meio);">${CicloCalc.AVISO_ESTIMATIVA}</div>
        `;
    } catch (e) {
        container.innerHTML = `<span style="color:var(--cinza-meio); font-size:0.9rem;">Não foi possível carregar o ciclo.</span>`;
    }
}
