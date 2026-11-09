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
    // anel da hidratação (vazio até chegarem os dados)
    document.getElementById('agua-anel-wrap').innerHTML = UI.anel({
        pct: 0, tamanho: 76, traco: 10, id: 'agua-anel',
        centro: '<span class="anel-num pequeno" id="agua-pct">0%</span>',
        rotulo: 'Progresso da hidratação'
    });
    montarConquistas();
    await verificarAuth();
    setarDataHeader();
    configurarTreino();
    configurarNotas();
    await carregarSessoes();
    mostrarDeployInfo();
    await carregarDiaHoje();
    await carregarConquistas();
    await carregarCicloResumido();
    await carregarNotas();
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
    atualizarConquistas();
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

    // o botão "Treinei hoje" fica sempre na linha de ações; aqui só o estado "registado"
    if (!sessoes.length) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }

    const n = sessoes.length;
    el.hidden = false;
    el.innerHTML = `
        <div class="card" style="margin-bottom:0;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="font-family:var(--fonte-t); font-weight:700; font-size:17px; color:var(--tx);">Treino registado hoje${n > 1 ? ' (' + n + ')' : ''}</div>
                <span class="badge badge-verde">Feito</span>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-secundario" style="flex:1;" onclick="abrirTreino()">Outro treino</button>
                <button class="btn btn-secundario" style="flex:1;" onclick="pedirDesfazerTreino()">Desfazer</button>
            </div>
        </div>`;
}

// "Nota" nas ações rápidas: leva ao campo de notas e foca-o
function focarNota() {
    const input = document.getElementById('nota-input');
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
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
        mostrarToast('Erro ao guardar');
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
        mostrarToast('Não foi possível desfazer');
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

    let capsulas = '';
    for (let i = 0; i < 7; i++) {
        const ds = TreinoCalc.somarDias(segunda, i);
        const treinou = datas.indexOf(ds) !== -1;
        const ehHoje = ds === hojeStr;
        const futuro = ds > hojeStr;
        const estado = treinou ? 'treinou' : futuro ? 'ainda por vir' : 'sem treino';
        capsulas += `
            <div class="dia-cap${ehHoje ? ' hoje' : ''}">
                <div class="cap${treinou ? ' feito' : ''}${futuro && !treinou ? ' futuro' : ''}${ehHoje ? ' hoje' : ''}" role="img" aria-label="${DIAS_LONGOS[i]}: ${estado}"></div>
                <span class="dia-letra" aria-hidden="true">${letras[i]}</span>
            </div>`;
    }

    const diasSemana = TreinoCalc.contarIntervalo(datas, segunda, TreinoCalc.somarDias(segunda, 6));
    const sequencia = TreinoCalc.sequenciaAtual(datas, hojeStr);
    const numero = (valor, rotulo) => `
        <div>
            <div class="num-grande">${valor}</div>
            <div class="num-rot">${rotulo}</div>
        </div>`;

    container.innerHTML = `
        <div class="card">
            <div class="card-titulo">Esta semana</div>
            <div class="semana-nums">
                ${numero(diasSemana, diasSemana === 1 ? 'treino' : 'treinos')}
                ${numero(sequencia, sequencia === 1 ? 'dia de sequência' : 'dias de sequência')}
            </div>
            <div class="semana-dias">${capsulas}</div>
        </div>`;
}

const DIAS_LONGOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// ============================================
// HIDRATAÇÃO
// ============================================

function atualizarAgua() {
    const ml = estadoDia.agua_ml;
    const meta = estadoDia.meta_agua_ml;
    const pct = Math.min(100, (ml / meta) * 100);

    document.getElementById('agua-atual').textContent = ml;
    document.getElementById('agua-meta-label').textContent = meta;
    document.getElementById('agua-pct').textContent = Math.round(pct) + '%';
    UI.definirAnel(document.getElementById('agua-anel'), pct);
    atualizarConquistas();
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
// CONQUISTAS DE HOJE — treino, água e suplementos (combo do dia)
// A lógica está em js/conquistas.js; aqui só desenho e ligação à base de dados.
// ============================================

let conqDados = { agua: [], suplementos: [] };   // histórico (hoje é sobreposto com o estado local)
let conqMontado = false;
let conqComboAnterior = null;                    // null até à primeira renderização (sem animação ao abrir)
let conqSalvando = false;

const CONQ_ICO = {
    treino: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
    agua: '<path d="M12 2.7s6 6.3 6 10.8a6 6 0 01-12 0c0-4.5 6-10.8 6-10.8z"/>',
    suplementos: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    neutro: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};

function conqSvg(chave, classe) {
    return '<svg class="' + classe + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">' + CONQ_ICO[chave] + '</svg>';
}

function montarConquistas() {
    const itens = document.getElementById('conq-itens');
    if (!itens || conqMontado) return;
    const discreto = Discreto.ativo();
    itens.innerHTML =
        '<div class="conq-item">' +
            '<div class="conq-circ" id="conq-treino" role="img">' + conqSvg('treino', 'conq-base') + conqSvg('ok', 'conq-ok') + '</div>' +
            '<span class="conq-rot">Treino</span>' +
        '</div>' +
        '<div class="conq-item">' +
            '<div class="conq-agua" id="conq-agua">' + UI.anel({
                pct: 0, tamanho: 56, traco: 9, id: 'conq-agua-anel',
                centro: conqSvg('agua', 'conq-base') + conqSvg('ok', 'conq-ok')
            }) + '</div>' +
            '<span class="conq-rot">Água</span>' +
        '</div>' +
        '<button type="button" class="conq-item conq-btn" id="conq-sup" aria-pressed="false" onclick="alternarSuplementos()">' +
            '<span class="conq-circ" id="conq-sup-circ">' +
                conqSvg(discreto ? 'neutro' : 'suplementos', 'conq-base') + conqSvg('ok', 'conq-ok') +
            '</span>' +
            '<span class="conq-rot">' + (discreto ? 'Hábitos' : 'Suplementos') + '</span>' +
        '</button>';
    conqMontado = true;
}

async function carregarConquistas() {
    const desde = TreinoCalc.somarDias(hoje(), -400);
    const dados = await Conquistas.carregar(db, desde, { semTreinos: true });
    conqDados = { agua: dados.agua, suplementos: dados.suplementos };
    atualizarConquistas();
}

function suplementosHoje() {
    const h = hoje();
    return conqDados.suplementos.some(l => l.data === h && l.suplementos === true);
}

function definirSuplementosLocal(valor) {
    const h = hoje();
    conqDados.suplementos = conqDados.suplementos.filter(l => l.data !== h)
        .concat({ data: h, suplementos: valor });
}

function atualizarConquistas() {
    if (!conqMontado) montarConquistas();
    const combo = document.getElementById('conq-combo');
    if (!combo) return;

    const h = hoje();
    const agua = conqDados.agua.filter(l => l.data !== h)
        .concat({ data: h, agua_ml: estadoDia.agua_ml, meta_agua_ml: estadoDia.meta_agua_ml });
    const idx = Conquistas.indexar({ treinos: sessoesRecentes, agua: agua, suplementos: conqDados.suplementos });
    const e = Conquistas.estadoDoDia(idx, h);
    const sequencia = Conquistas.sequenciaCombos(Conquistas.datasCombo(idx), h);
    const discreto = Discreto.ativo();
    const sim = v => v ? 'feito' : 'por fazer';

    const treino = document.getElementById('conq-treino');
    treino.classList.toggle('feito', e.treino);
    treino.setAttribute('aria-label', 'Treino: ' + sim(e.treino));

    const aguaEl = document.getElementById('conq-agua');
    aguaEl.classList.toggle('feito', e.agua);
    aguaEl.firstElementChild.setAttribute('role', 'img');
    aguaEl.firstElementChild.setAttribute('aria-label',
        'Água: ' + estadoDia.agua_ml + ' de ' + estadoDia.meta_agua_ml + ' ml, ' + sim(e.agua));
    UI.definirAnel(document.getElementById('conq-agua-anel'), e.aguaPct);

    const sup = document.getElementById('conq-sup');
    sup.setAttribute('aria-pressed', e.suplementos ? 'true' : 'false');
    sup.setAttribute('aria-label', (discreto ? 'Hábitos' : 'Suplementos e medicação') + ': ' + sim(e.suplementos));
    document.getElementById('conq-sup-circ').classList.toggle('feito', e.suplementos);

    combo.innerHTML =
        '<div>' +
            '<div class="conq-combo-txt">' + (e.combo ? 'Combo do dia!' : e.feitas + ' de 3') + '</div>' +
            '<div class="conq-combo-rot">' + (e.combo ? '3 de 3' : 'Combo do dia') + '</div>' +
        '</div>' +
        '<div class="conq-seq">Sequência de combos: ' + sequencia + (sequencia === 1 ? ' dia' : ' dias') + '</div>';

    document.getElementById('card-conquistas').classList.toggle('completo', e.combo);
    if (e.combo && conqComboAnterior === false) {
        combo.classList.remove('celebra');
        void combo.offsetWidth; // reinicia a animação
        combo.classList.add('celebra');
    }
    conqComboAnterior = e.combo;
}

async function alternarSuplementos() {
    if (conqSalvando) return;
    conqSalvando = true;
    const antes = suplementosHoje();
    definirSuplementosLocal(!antes);
    atualizarConquistas();

    const { error } = await db.from('habitos_dia').upsert({
        data: hoje(),
        suplementos: !antes,
        atualizado_em: new Date().toISOString()
    }, { onConflict: 'data' });
    conqSalvando = false;
    if (error) {
        console.error(error);
        definirSuplementosLocal(antes);
        atualizarConquistas();
        mostrarToast('Não foi possível guardar');
    }
}

// ============================================
// CICLO — RESUMO NO DASHBOARD
// ============================================

function dataCurta(str) {
    return new Date(str + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
}

async function carregarCicloResumido() {
    const container = document.getElementById('ciclo-info');
    const pilula = document.getElementById('ciclo-fase');
    if (!container) return;
    if (pilula) pilula.innerHTML = '';

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
                <div class="hero-linha">
                    <div class="hero-forte">${fd ? 'Ciclo - dia ' + fd.dia : 'Ciclo'}</div>
                    <a href="ciclo.html" class="pill">Ver detalhes</a>
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
                <div class="hero-forte" style="margin-top:12px;">${CicloCalc.textoGravidez(g)}</div>
                <div class="hero-nota">${CicloCalc.TEXTO_GRAVIDEZ}</div>
            `;
            return;
        }

        const f = CicloCalc.faseAtual(rows || [], CicloCalc.hojeLocal());
        if (!f) {
            container.innerHTML = `<div class="hero-texto" style="margin-top:12px;">Sem registos. Vai ao separador Ciclo para adicionar.</div>`;
            return;
        }

        const info = CicloCalc.FASES_INFO[f.nome];
        const janela = CicloCalc.textoJanela(f);
        if (pilula) {
            pilula.innerHTML = `<span class="pilula-fase"><i style="background:${info.cor}"></i>${f.nome}</span>`;
        }

        // anel: dias até à menstruação (a barra mostra o avanço do ciclo)
        const d = f.diasAteMenstruacao;
        let num, rot;
        if (d > 0) { num = d; rot = d === 1 ? 'dia' : 'dias'; }
        else if (d === 0) { num = 'Hoje'; rot = ''; }
        else { num = -d; rot = -d === 1 ? 'dia de atraso' : 'dias de atraso'; }
        const pctCiclo = Math.min(100, Math.max(0, (f.dia / f.cicloMedio) * 100));
        const anel = UI.anel({
            pct: pctCiclo, tamanho: 104, traco: 9,
            centro: `<span class="anel-num">${num}</span>${rot ? `<span class="anel-rot">${rot}</span>` : ''}`,
            rotulo: CicloCalc.textoMenstruacao(f)
        });

        container.innerHTML = `
            <div class="hero-meio">
                <div>
                    <div class="hero-dia">Dia ${f.dia}</div>
                    <div class="hero-sub">de um ciclo médio de ${f.cicloMedio} dias</div>
                </div>
                ${anel}
            </div>
            ${janela ? `<div class="hero-janela">${janela}</div>` : ''}
            <div class="hero-caixas">
                <div class="hero-caixa"><span>Ovulação estimada</span><strong>${dataCurta(f.ovulacao)}</strong></div>
                <div class="hero-caixa"><span>Menstruação prevista</span><strong>${dataCurta(f.proximoPeriodo)}</strong></div>
            </div>
            ${f.aviso ? `<div class="hero-aviso">${f.aviso}</div>` : ''}
            <div class="hero-nota">${CicloCalc.AVISO_ESTIMATIVA}</div>
        `;
        UI.animarAneis(container);
    } catch (e) {
        container.innerHTML = `<span class="hero-texto">Não foi possível carregar o ciclo.</span>`;
    }
}

// ============================================
// NOTAS — cartão no ecrã Hoje (tabela `notas`)
// O texto das notas é sempre inserido com textContent, nunca com innerHTML.
// ============================================

function configurarNotas() {
    const input = document.getElementById('nota-input');
    if (!input) return;
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            adicionarNota();
        }
    });
}

async function carregarNotas() {
    const lista = document.getElementById('notas-lista');
    if (!lista) return;

    const { data, error } = await db
        .from('notas')
        .select('id, texto, fixada, feita, created_at')
        .eq('feita', false)
        .order('fixada', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3);

    lista.textContent = '';
    if (error) {
        console.warn('notas:', error.message);
        return;
    }

    if (!data || !data.length) {
        const vazio = document.createElement('div');
        vazio.className = 'nota-vazio';
        vazio.textContent = 'Sem notas por agora. Escreve a primeira acima.';
        lista.appendChild(vazio);
        return;
    }

    data.forEach(n => {
        const linha = document.createElement('div');
        linha.className = 'nota-linha';

        const caixa = document.createElement('button');
        caixa.className = 'nota-caixa';
        caixa.setAttribute('aria-label', 'Marcar como feita');
        caixa.addEventListener('click', () => marcarNotaFeita(n.id));

        const texto = document.createElement('div');
        texto.className = 'nota-texto';
        texto.textContent = n.texto;

        linha.appendChild(caixa);
        linha.appendChild(texto);
        if (n.fixada) {
            const pin = document.createElement('span');
            pin.className = 'nota-pin';
            pin.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 3l5 5-2 1-3 3v4l-2 2-3.5-3.5L5 20l-1-1 5.5-5.5L6 10l2-2h4l3-3 1-2z"/></svg>'; pin.setAttribute('aria-label', 'Fixada');
            linha.appendChild(pin);
        }
        lista.appendChild(linha);
    });
}

async function adicionarNota() {
    const input = document.getElementById('nota-input');
    const texto = input.value.trim();
    if (!texto) return;

    const { error } = await db.from('notas').insert({ texto: texto });
    if (error) {
        console.error(error);
        mostrarToast('Não foi possível guardar');
        return;
    }
    input.value = '';
    await carregarNotas();
}

async function marcarNotaFeita(id) {
    const { error } = await db
        .from('notas')
        .update({ feita: true, feita_em: new Date().toISOString() })
        .eq('id', id);
    if (error) {
        console.error(error);
        mostrarToast('Não foi possível guardar');
        return;
    }
    await carregarNotas();
}
