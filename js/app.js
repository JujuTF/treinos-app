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
    await carregarResumoSemana();
    mostrarDeployInfo();
    await carregarDiaHoje();
    await carregarCicloResumido();
});

// ---- UTILS ----
function hoje() {
    return new Date().toISOString().split('T')[0];
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
