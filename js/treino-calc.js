// ============================================
// treino-calc.js — Estatísticas de treino (funções puras)
// Partilhado por index.html e stats.html; também corre em Node (testes).
//
// `sessoes` = linhas de sessoes_treino ({ data: 'AAAA-MM-DD', ... });
// `datas`   = lista ordenada de dias treinados, sem repetições.
// ============================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TreinoCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    const DIA_MS = 86400000;

    function paraDias(s) {
        const p = s.split('-').map(Number);
        return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / DIA_MS);
    }
    function paraData(n) { return new Date(n * DIA_MS).toISOString().slice(0, 10); }
    function somarDias(s, n) { return paraData(paraDias(s) + n); }
    function diferencaDias(a, b) { return paraDias(a) - paraDias(b); }

    // segunda-feira da semana de `data`
    function inicioSemana(data) {
        const diaSemana = new Date(paraDias(data) * DIA_MS).getUTCDay(); // 0 = domingo
        return somarDias(data, -((diaSemana + 6) % 7));
    }

    function datasUnicas(sessoes) {
        const set = {};
        (sessoes || []).forEach(s => { if (s && s.data) set[s.data] = true; });
        return Object.keys(set).sort();
    }

    function contarIntervalo(datas, de, ate) {
        return datas.filter(d => d >= de && d <= ate).length;
    }

    // Sequência (dias seguidos com treino) que termina hoje ou ontem:
    // se ainda não treinaste hoje, a sequência de ontem continua viva.
    function sequenciaAtual(datas, hoje) {
        const set = {};
        datas.forEach(d => { set[d] = true; });
        let dia = set[hoje] ? hoje : somarDias(hoje, -1);
        let n = 0;
        while (set[dia]) { n++; dia = somarDias(dia, -1); }
        return n;
    }

    function melhorSequencia(datas) {
        let melhor = 0, atual = 0, anterior = null;
        datas.forEach(d => {
            atual = (anterior !== null && diferencaDias(d, anterior) === 1) ? atual + 1 : 1;
            if (atual > melhor) melhor = atual;
            anterior = d;
        });
        return melhor;
    }

    // dias desde o último treino (0 = hoje); null se nunca treinou
    function diasDesdeUltimo(datas, hoje) {
        const passadas = datas.filter(d => d <= hoje);
        if (!passadas.length) return null;
        return diferencaDias(hoje, passadas[passadas.length - 1]);
    }

    // últimas `n` semanas (a atual inclusive), da mais antiga para a mais recente
    function semanasRecentes(datas, hoje, n) {
        const atual = inicioSemana(hoje);
        const semanas = [];
        for (let i = n - 1; i >= 0; i--) {
            const inicio = somarDias(atual, -7 * i);
            const fim = somarDias(inicio, 6);
            semanas.push({ inicio: inicio, fim: fim, dias: contarIntervalo(datas, inicio, fim) });
        }
        return semanas;
    }

    function diasNoMes(datas, hoje) {
        const prefixo = hoje.slice(0, 7);
        return datas.filter(d => d.slice(0, 7) === prefixo && d <= hoje).length;
    }

    return {
        inicioSemana: inicioSemana,
        datasUnicas: datasUnicas,
        contarIntervalo: contarIntervalo,
        sequenciaAtual: sequenciaAtual,
        melhorSequencia: melhorSequencia,
        diasDesdeUltimo: diasDesdeUltimo,
        semanasRecentes: semanasRecentes,
        diasNoMes: diasNoMes,
        somarDias: somarDias
    };
});
