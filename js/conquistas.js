// ============================================
// conquistas.js — Combo do dia (treino + água + suplementos). Funções puras.
// Partilhado por index.html e stats.html; também corre em Node (testes).
//
// Recebe as linhas tal como vêm das tabelas e devolve estados e contagens.
//   treinos      = linhas de sessoes_treino   ({ data })
//   agua         = linhas de registo_diario   ({ data, agua_ml, meta_agua_ml })
//   suplementos  = linhas de habitos_dia      ({ data, suplementos })
// Datas sempre 'AAAA-MM-DD'; meses 'AAAA-MM'.
// ============================================
(function (root, factory) {
    const treinoCalc = (typeof module === 'object' && module.exports)
        ? require('./treino-calc.js')
        : root.TreinoCalc;
    if (typeof module === 'object' && module.exports) module.exports = factory(treinoCalc);
    else root.Conquistas = factory(treinoCalc);
})(typeof self !== 'undefined' ? self : this, function (TreinoCalc) {

    // Faixas do troféu do mês (PROVISÓRIAS: ajustar aqui). `min` = combos no mês.
    // Abaixo da primeira faixa não há troféu.
    const FAIXAS_TROFEU = [
        { nivel: 1, nome: 'Bronze', min: 5 },
        { nivel: 2, nome: 'Prata',  min: 10 },
        { nivel: 3, nome: 'Ouro',   min: 20 }
    ];

    const META_AGUA_PADRAO = 2000; // igual ao valor por defeito da hidratação em app.js

    function aguaPct(linha) {
        const ml = Number(linha && linha.agua_ml) || 0;
        const meta = Number(linha && linha.meta_agua_ml) || META_AGUA_PADRAO;
        return Math.max(0, Math.min(100, ml / meta * 100));
    }

    // Prepara índices por data para consultar muitos dias sem refazer filtros.
    function indexar(entrada) {
        const e = entrada || {};
        const idx = { treino: {}, agua: {}, aguaPct: {}, suplementos: {} };
        (e.treinos || []).forEach(function (s) { if (s && s.data) idx.treino[s.data] = true; });
        (e.agua || []).forEach(function (l) {
            if (!l || !l.data) return;
            const p = aguaPct(l);
            idx.aguaPct[l.data] = p;
            idx.agua[l.data] = p >= 100;
        });
        (e.suplementos || []).forEach(function (l) {
            if (l && l.data && l.suplementos === true) idx.suplementos[l.data] = true;
        });
        return idx;
    }

    // -> { treino, agua, suplementos, aguaPct (0..100), feitas (0..3), combo }
    function estadoDoDia(idx, data) {
        const treino = !!idx.treino[data];
        const agua = !!idx.agua[data];
        const suplementos = !!idx.suplementos[data];
        const feitas = (treino ? 1 : 0) + (agua ? 1 : 0) + (suplementos ? 1 : 0);
        return {
            treino: treino, agua: agua, suplementos: suplementos,
            aguaPct: idx.aguaPct[data] || 0, feitas: feitas, combo: feitas === 3
        };
    }

    // Dias com as três feitas, ordenados.
    function datasCombo(idx) {
        return Object.keys(idx.treino).filter(function (d) {
            return idx.agua[d] && idx.suplementos[d];
        }).sort();
    }

    // Sequência atual: termina hoje ou ontem (se hoje ainda não está completo, não se perde).
    function sequenciaCombos(datas, hoje) { return TreinoCalc.sequenciaAtual(datas, hoje); }
    function melhorCombos(datas) { return TreinoCalc.melhorSequencia(datas); }

    function combosDoMes(datas, mes) {
        return datas.filter(function (d) { return d.slice(0, 7) === mes; }).length;
    }

    function mesAnterior(mes) {
        const p = mes.split('-').map(Number);
        return p[1] === 1 ? (p[0] - 1) + '-12' : p[0] + '-' + String(p[1] - 1).padStart(2, '0');
    }

    function diasNoMesDe(mes) {
        const p = mes.split('-').map(Number);
        return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    }

    // Calendário do mês: offset = colunas vazias antes do dia 1 (semana a começar à segunda).
    // -> { offset, dias: [{ data, dia, feitas, combo, hoje, futuro }] }
    function calendarioMes(idx, mes, hoje) {
        const primeiro = mes + '-01';
        const offset = TreinoCalc.diferencaDias(primeiro, TreinoCalc.inicioSemana(primeiro));
        const dias = [];
        for (let i = 1; i <= diasNoMesDe(mes); i++) {
            const data = mes + '-' + String(i).padStart(2, '0');
            const e = estadoDoDia(idx, data);
            dias.push({ data: data, dia: i, feitas: e.feitas, combo: e.combo, hoje: data === hoje, futuro: data > hoje });
        }
        return { offset: offset, dias: dias };
    }

    // Troféu do mês -> { nivel (0 = sem troféu), nome, proximo: { nome, min, faltam } | null }
    function nivelTrofeu(combos) {
        const n = Math.max(0, Math.floor(Number(combos) || 0));
        let atual = { nivel: 0, nome: null };
        let proximo = null;
        for (let i = 0; i < FAIXAS_TROFEU.length; i++) {
            const f = FAIXAS_TROFEU[i];
            if (n >= f.min) atual = { nivel: f.nivel, nome: f.nome };
            else if (!proximo) proximo = { nome: f.nome, min: f.min, faltam: f.min - n };
        }
        return { nivel: atual.nivel, nome: atual.nome, proximo: proximo };
    }

    // ---- Leitura das tabelas (única parte com rede; não é testada) ----
    // -> { treinos, agua, suplementos } desde a data indicada. Falhas dão listas vazias.
    // opcoes.semTreinos: não lê sessoes_treino (o ecrã Hoje já as tem carregadas).
    async function carregar(db, desde, opcoes) {
        async function ler(tabela, colunas) {
            const r = await db.from(tabela).select(colunas).gte('data', desde).limit(2000);
            if (r.error) { console.warn(tabela + ':', r.error.message); return []; }
            return r.data || [];
        }
        const res = await Promise.all([
            (opcoes && opcoes.semTreinos) ? Promise.resolve([]) : ler('sessoes_treino', 'data'),
            ler('registo_diario', 'data, agua_ml, meta_agua_ml'),
            ler('habitos_dia', 'data, suplementos')
        ]);
        return { treinos: res[0], agua: res[1], suplementos: res[2] };
    }

    return {
        FAIXAS_TROFEU: FAIXAS_TROFEU,
        aguaPct: aguaPct,
        indexar: indexar,
        estadoDoDia: estadoDoDia,
        datasCombo: datasCombo,
        sequenciaCombos: sequenciaCombos,
        melhorCombos: melhorCombos,
        combosDoMes: combosDoMes,
        mesAnterior: mesAnterior,
        calendarioMes: calendarioMes,
        nivelTrofeu: nivelTrofeu,
        carregar: carregar
    };
});
