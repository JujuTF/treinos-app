// ============================================
// ciclo-calc.js — Cálculos do ciclo (funções puras)
// Partilhado por index.html e ciclo.html; também corre em Node (testes).
//
// Os registos são objetos { inicio: 'AAAA-MM-DD', fim: 'AAAA-MM-DD' | null }
// em qualquer ordem. Todas as datas são strings ISO e o cálculo é feito em
// dias inteiros (UTC), por isso não há problemas de fuso horário.
// ============================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CicloCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    const DIA_MS = 86400000;

    const CICLO_PADRAO = 28;        // usado com dados insuficientes
    const CICLO_MIN = 21;           // intervalos fora de 21-45 são ignorados
    const CICLO_MAX = 45;
    const CICLOS_CONSIDERADOS = 6;  // últimos N intervalos
    const FASE_LUTEA = 14;          // ovulação ≈ 14 dias antes da menstruação
    const JANELA_ANTES = 5;         // janela fértil: ovulação -5 ... +1
    const JANELA_DEPOIS = 1;
    const VARIACAO_LIMITE = 7;      // acima disto a estimativa é menos fiável
    const JANELA_EXTRA = 2;         // dias extra de cada lado se menos fiável
    const MENSTRUACAO_PADRAO = 5;   // duração assumida sem data de fim

    const AVISO_ESTIMATIVA = 'Estimativa com base nos teus registos. Não é um diagnóstico.';

    const FASES_INFO = {
        'Menstrual': { emoji: '🔴', cor: '#EF4444',
            desc: 'Período. Prioriza descanso e mobilidade suave.', treino: '🟢 Mobilidade' },
        'Folicular': { emoji: '🌱', cor: '#22C55E',
            desc: 'Energia crescente. Boa fase para intensidade.', treino: '🔴 Treino Completo' },
        'Janela fértil': { emoji: '✨', cor: '#EAB308',
            desc: 'Dias com maior probabilidade de conceção.', treino: '🔴 Treino Completo' },
        'Lútea': { emoji: '🌙', cor: '#A855F7',
            desc: 'Energia variável. Treinos moderados.', treino: '🔵 Força Curta' }
    };

    // ---------- datas ----------
    function paraDias(s) {
        const p = s.split('-').map(Number);
        return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / DIA_MS);
    }
    function paraData(n) { return new Date(n * DIA_MS).toISOString().slice(0, 10); }
    function somarDias(s, n) { return paraData(paraDias(s) + n); }
    function diferencaDias(a, b) { return paraDias(a) - paraDias(b); }
    function hojeLocal() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    function ordenados(registos) {
        return (registos || [])
            .filter(r => r && r.inicio)
            .slice()
            .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
    }

    // ---------- 1. ciclo médio ----------
    function cicloMedio(registos) {
        const asc = ordenados(registos);
        const intervalos = [];
        for (let i = 1; i < asc.length; i++) {
            intervalos.push(diferencaDias(asc[i].inicio, asc[i - 1].inicio));
        }
        const usados = intervalos
            .slice(-CICLOS_CONSIDERADOS)
            .filter(v => v >= CICLO_MIN && v <= CICLO_MAX);

        if (usados.length < 2) {
            return { media: CICLO_PADRAO, variacao: 0, ciclosUsados: 0 };
        }
        const soma = usados.reduce((a, b) => a + b, 0);
        return {
            media: Math.round(soma / usados.length),
            variacao: Math.max.apply(null, usados) - Math.min.apply(null, usados),
            ciclosUsados: usados.length
        };
    }

    // ---------- 2-4. previsões ----------
    function ultimoRegisto(registos) {
        const asc = ordenados(registos);
        return asc.length ? asc[asc.length - 1] : null;
    }

    function menosFiavel(cm) { return cm.variacao > VARIACAO_LIMITE; }

    function proximoPeriodo(registos) {
        const ultimo = ultimoRegisto(registos);
        if (!ultimo) return null;
        return somarDias(ultimo.inicio, cicloMedio(registos).media);
    }

    function ovulacaoEstimada(registos) {
        const prox = proximoPeriodo(registos);
        return prox ? somarDias(prox, -FASE_LUTEA) : null;
    }

    function janelaFertil(registos) {
        const ov = ovulacaoEstimada(registos);
        if (!ov) return null;
        const extra = menosFiavel(cicloMedio(registos)) ? JANELA_EXTRA : 0;
        return {
            inicio: somarDias(ov, -JANELA_ANTES - extra),
            fim: somarDias(ov, JANELA_DEPOIS + extra),
            alargada: extra > 0
        };
    }

    // ---------- 5. fase atual ----------
    function faseAtual(registos, hoje) {
        hoje = hoje || hojeLocal();
        const ultimo = ultimoRegisto(registos);
        if (!ultimo || hoje < ultimo.inicio) return null;

        const cm = cicloMedio(registos);
        const prox = somarDias(ultimo.inicio, cm.media);
        const ov = somarDias(prox, -FASE_LUTEA);
        const janela = janelaFertil(registos);
        const dia = diferencaDias(hoje, ultimo.inicio) + 1;

        const duracaoMenstruacao = (ultimo.fim && ultimo.fim >= ultimo.inicio)
            ? diferencaDias(ultimo.fim, ultimo.inicio) + 1
            : MENSTRUACAO_PADRAO;

        let nome;
        if (dia <= duracaoMenstruacao) nome = 'Menstrual';
        else if (hoje < janela.inicio) nome = 'Folicular';
        else if (hoje <= janela.fim) nome = 'Janela fértil';
        else nome = 'Lútea';

        const emJanela = nome === 'Janela fértil';
        let diasAteJanela;
        if (hoje < janela.inicio) {
            diasAteJanela = diferencaDias(janela.inicio, hoje);
        } else if (hoje <= janela.fim) {
            diasAteJanela = 0;
        } else {
            // próxima janela = a deste ciclo deslocada um ciclo médio
            const seguinte = diferencaDias(somarDias(janela.inicio, cm.media), hoje);
            diasAteJanela = seguinte >= 0 ? seguinte : null;
        }

        const diasAteMenstruacao = diferencaDias(prox, hoje);

        return {
            nome: nome,
            dia: dia,
            emJanela: emJanela,
            diasAteJanela: diasAteJanela,
            diasAteFimJanela: emJanela ? diferencaDias(janela.fim, hoje) : null,
            diasAteOvulacao: diferencaDias(ov, hoje),
            diasAteMenstruacao: diasAteMenstruacao,
            atrasoDias: Math.max(0, -diasAteMenstruacao),
            proximoPeriodo: prox,
            ovulacao: ov,
            janela: janela,
            cicloMedio: cm.media,
            variacao: cm.variacao,
            ciclosUsados: cm.ciclosUsados,
            menosFiavel: menosFiavel(cm),
            aviso: avisoFiabilidade(cm)
        };
    }

    // ---------- 6. aviso ----------
    function avisoFiabilidade(cm) {
        if (!menosFiavel(cm)) return null;
        return 'Os teus ciclos variam ' + cm.variacao +
            ' dias; a estimativa é menos fiável e a janela fértil foi alargada.';
    }

    // ---------- textos ----------
    function plural(n, singular, pluralTxt) { return n + ' ' + (n === 1 ? singular : pluralTxt); }

    function textoJanela(f) {
        if (!f) return '';
        if (f.emJanela) {
            if (f.diasAteOvulacao === 0) return 'Estás na janela fértil · ovulação estimada hoje';
            return 'Estás na janela fértil';
        }
        if (f.diasAteJanela === null) return '';
        if (f.diasAteJanela === 1) return 'A janela fértil começa amanhã';
        return 'A janela fértil começa em ' + plural(f.diasAteJanela, 'dia', 'dias');
    }

    function textoMenstruacao(f) {
        if (!f) return '';
        const d = f.diasAteMenstruacao;
        if (d > 1) return 'Próxima menstruação prevista em ' + d + ' dias';
        if (d === 1) return 'Próxima menstruação prevista para amanhã';
        if (d === 0) return 'Menstruação prevista para hoje';
        return 'Menstruação atrasada ' + plural(-d, 'dia', 'dias') + ' face à previsão';
    }

    // ---------- estrutura do ciclo (barra de posição) ----------
    // Segmentos [de, ate] em dias do ciclo (1-based) para o ciclo médio.
    function estruturaCiclo(registos) {
        const ultimo = ultimoRegisto(registos);
        if (!ultimo) return null;
        const cm = cicloMedio(registos);
        const extra = menosFiavel(cm) ? JANELA_EXTRA : 0;
        const total = cm.media;

        const fimMenst = (ultimo.fim && ultimo.fim >= ultimo.inicio)
            ? Math.min(diferencaDias(ultimo.fim, ultimo.inicio) + 1, total)
            : MENSTRUACAO_PADRAO;
        const ovDia = total - FASE_LUTEA + 1;
        const janIni = Math.max(ovDia - JANELA_ANTES - extra, fimMenst + 1);
        const janFim = Math.min(ovDia + JANELA_DEPOIS + extra, total);

        const segs = [
            { nome: 'Menstrual', de: 1, ate: fimMenst },
            { nome: 'Folicular', de: fimMenst + 1, ate: janIni - 1 },
            { nome: 'Janela fértil', de: janIni, ate: janFim },
            { nome: 'Lútea', de: janFim + 1, ate: total }
        ].filter(s => s.ate >= s.de);
        return { total: total, segmentos: segs };
    }

    // ---------- marcas do calendário ----------
    // Devolve { 'AAAA-MM-DD': { periodo, inicio, fim, janela, ovulacao, previsao } }
    // apenas para datas entre `de` e `ate` (inclusive).
    function marcasCalendario(registos, de, ate) {
        const asc = ordenados(registos);
        const mapa = {};
        if (!asc.length) return mapa;

        function marcar(d, props) {
            if (d < de || d > ate) return;
            mapa[d] = Object.assign(mapa[d] || {}, props);
        }
        function marcarIntervalo(a, b, props) {
            const ini = Math.max(paraDias(a), paraDias(de));
            const fim = Math.min(paraDias(b), paraDias(ate));
            for (let n = ini; n <= fim; n++) marcar(paraData(n), props);
        }

        const cm = cicloMedio(registos);
        const extra = menosFiavel(cm) ? JANELA_EXTRA : 0;

        // período registado
        asc.forEach(r => {
            if (r.fim && r.fim >= r.inicio) marcarIntervalo(r.inicio, r.fim, { periodo: true });
            marcar(r.inicio, { periodo: true, inicio: true });
            if (r.fim && r.fim >= r.inicio) marcar(r.fim, { periodo: true, fim: true });
        });

        // ovulação e janela: ciclos passados (próximo início real - 14),
        // ciclo atual e ciclo seguinte (previstos)
        const ultimo = asc[asc.length - 1];
        const prox = somarDias(ultimo.inicio, cm.media);
        const ovulacoes = [];
        for (let i = 0; i < asc.length - 1; i++) {
            ovulacoes.push(somarDias(asc[i + 1].inicio, -FASE_LUTEA));
        }
        ovulacoes.push(somarDias(prox, -FASE_LUTEA));
        ovulacoes.push(somarDias(prox, cm.media - FASE_LUTEA));

        ovulacoes.forEach(ov => {
            marcarIntervalo(somarDias(ov, -JANELA_ANTES - extra), somarDias(ov, JANELA_DEPOIS + extra), { janela: true });
            marcar(ov, { ovulacao: true });
        });

        // próxima menstruação prevista
        marcarIntervalo(prox, somarDias(prox, MENSTRUACAO_PADRAO - 1), { previsao: true });

        return mapa;
    }

    // ---------- modo gravidez ----------
    // Eventos: { id, data: 'AAAA-MM-DD', tipo: 'relacao'|'gravidez'|'perda'|'teste_ovulacao', nota }.
    // Os eventos NÃO entram em cicloMedio/previsões.
    // O modo termina por uma 'perda' posterior ao teste, ou manualmente: nesse caso a
    // nota do evento 'gravidez' fica com o prefixo MARCA_TERMINADA (sem registar perda).
    const MARCA_TERMINADA = '[modo terminado]';
    const TEXTO_GRAVIDEZ = 'Contagem desde o início do último período. Não substitui o acompanhamento médico.';

    function modoGravidez(eventos) {
        const gravidezes = (eventos || [])
            .filter(e => e && e.tipo === 'gravidez' && e.data)
            .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
        if (!gravidezes.length) return { ativo: false, evento: null };

        const ultima = gravidezes[gravidezes.length - 1];
        const terminada = typeof ultima.nota === 'string' && ultima.nota.indexOf(MARCA_TERMINADA) === 0;
        const perdaPosterior = (eventos || []).some(e => e && e.tipo === 'perda' && e.data >= ultima.data);

        return { ativo: !terminada && !perdaPosterior, evento: ultima };
    }

    // Semana gestacional (X+Y) desde o início do último período que começou até `hoje`.
    function semanasGravidez(registos, hoje) {
        hoje = hoje || hojeLocal();
        const anteriores = ordenados(registos).filter(r => r.inicio <= hoje);
        if (!anteriores.length) return null;
        const inicio = anteriores[anteriores.length - 1].inicio;
        const total = diferencaDias(hoje, inicio);
        return { semanas: Math.floor(total / 7), dias: total % 7, totalDias: total, inicio: inicio };
    }

    function textoGravidez(g) {
        return g ? 'Gravidez: semana ' + g.semanas + '+' + g.dias : 'Gravidez';
    }

    return {
        MARCA_TERMINADA: MARCA_TERMINADA,
        TEXTO_GRAVIDEZ: TEXTO_GRAVIDEZ,
        modoGravidez: modoGravidez,
        semanasGravidez: semanasGravidez,
        textoGravidez: textoGravidez,
        AVISO_ESTIMATIVA: AVISO_ESTIMATIVA,
        FASES_INFO: FASES_INFO,
        cicloMedio: cicloMedio,
        proximoPeriodo: proximoPeriodo,
        ovulacaoEstimada: ovulacaoEstimada,
        janelaFertil: janelaFertil,
        faseAtual: faseAtual,
        estruturaCiclo: estruturaCiclo,
        marcasCalendario: marcasCalendario,
        textoJanela: textoJanela,
        textoMenstruacao: textoMenstruacao,
        hojeLocal: hojeLocal,
        somarDias: somarDias,
        diferencaDias: diferencaDias
    };
});
