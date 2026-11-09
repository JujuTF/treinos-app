// Testes simples, sem dependências. Correr com:  node tests/ciclo-calc.test.js
const assert = require('node:assert/strict');
const C = require('../js/ciclo-calc.js');

let falhas = 0;
function caso(nome, fn) {
    try { fn(); console.log('ok   - ' + nome); }
    catch (e) { falhas++; console.log('FAIL - ' + nome + '\n       ' + e.message); }
}

const reg = (...inicios) => inicios.map(i => ({ inicio: i, fim: null }));

caso('ciclo regular de 28 dias', () => {
    const r = reg('2026-01-01', '2026-01-29', '2026-02-26', '2026-03-26', '2026-04-23');

    assert.deepEqual(C.cicloMedio(r), { media: 28, variacao: 0, ciclosUsados: 4 });
    assert.equal(C.proximoPeriodo(r), '2026-05-21');
    assert.equal(C.ovulacaoEstimada(r), '2026-05-07');
    assert.deepEqual(C.janelaFertil(r), { inicio: '2026-05-02', fim: '2026-05-08', alargada: false });

    // dia 3: menstrual (sem fim registado = 5 dias)
    let f = C.faseAtual(r, '2026-04-25');
    assert.equal(f.nome, 'Menstrual');
    assert.equal(f.dia, 3);

    // dia 8: folicular, janela daqui a 2 dias
    f = C.faseAtual(r, '2026-04-30');
    assert.equal(f.nome, 'Folicular');
    assert.equal(f.diasAteJanela, 2);
    assert.equal(f.diasAteMenstruacao, 21);
    assert.equal(f.menosFiavel, false);
    assert.equal(f.aviso, null);

    // dia 11: dentro da janela fértil
    f = C.faseAtual(r, '2026-05-03');
    assert.equal(f.nome, 'Janela fértil');
    assert.equal(f.dia, 11);
    assert.equal(f.emJanela, true);
    assert.equal(f.diasAteJanela, 0);

    // dia 20: lútea; menstruação em 9 dias; próxima janela em 18 dias
    f = C.faseAtual(r, '2026-05-12');
    assert.equal(f.nome, 'Lútea');
    assert.equal(f.dia, 20);
    assert.equal(f.diasAteMenstruacao, 9);
    assert.equal(f.diasAteJanela, 18);

    // atraso: 3 dias depois da previsão
    f = C.faseAtual(r, '2026-05-24');
    assert.equal(f.diasAteMenstruacao, -3);
    assert.equal(f.atrasoDias, 3);
});

caso('ciclo irregular (ignora intervalos fora de 21-45 e alarga a janela)', () => {
    // intervalos: 92 (ignorado), 25, 33, 22, 39
    const r = reg('2025-10-01', '2026-01-01', '2026-01-26', '2026-02-28', '2026-03-22', '2026-04-30');

    const cm = C.cicloMedio(r);
    assert.equal(cm.media, 30);        // (25+33+22+39)/4 = 29.75
    assert.equal(cm.variacao, 17);     // 39 - 22
    assert.equal(cm.ciclosUsados, 4);

    assert.equal(C.proximoPeriodo(r), '2026-05-30');
    assert.equal(C.ovulacaoEstimada(r), '2026-05-16');
    // base 05-11..05-17, alargada 2 dias de cada lado
    assert.deepEqual(C.janelaFertil(r), { inicio: '2026-05-09', fim: '2026-05-19', alargada: true });

    const f = C.faseAtual(r, '2026-05-12');
    assert.equal(f.nome, 'Janela fértil');
    assert.equal(f.menosFiavel, true);
    assert.ok(f.aviso && f.aviso.includes('menos fiável'));
});

caso('um único registo usa 28 dias', () => {
    const r = [{ inicio: '2026-03-10', fim: null }];

    assert.deepEqual(C.cicloMedio(r), { media: 28, variacao: 0, ciclosUsados: 0 });
    assert.equal(C.proximoPeriodo(r), '2026-04-07');
    assert.equal(C.ovulacaoEstimada(r), '2026-03-24');
    assert.deepEqual(C.janelaFertil(r), { inicio: '2026-03-19', fim: '2026-03-25', alargada: false });

    let f = C.faseAtual(r, '2026-03-12');
    assert.equal(f.nome, 'Menstrual');
    assert.equal(f.dia, 3);
    assert.equal(f.menosFiavel, false);

    // com fim registado, a fase menstrual acaba nessa data
    const comFim = [{ inicio: '2026-03-10', fim: '2026-03-12' }];
    assert.equal(C.faseAtual(comFim, '2026-03-12').nome, 'Menstrual');
    assert.equal(C.faseAtual(comFim, '2026-03-13').nome, 'Folicular');

    // sem registos
    assert.equal(C.proximoPeriodo([]), null);
    assert.equal(C.janelaFertil([]), null);
    assert.equal(C.faseAtual([], '2026-03-12'), null);
});

caso('modo gravidez: sem gravidez', () => {
    assert.equal(C.modoGravidez([]).ativo, false);
    assert.equal(C.modoGravidez(undefined).ativo, false);
    // relações e testes de ovulação não ativam o modo
    const ev = [
        { id: 1, data: '2026-04-10', tipo: 'relacao', nota: null },
        { id: 2, data: '2026-04-12', tipo: 'teste_ovulacao', nota: null }
    ];
    assert.equal(C.modoGravidez(ev).ativo, false);
    // só uma perda, sem gravidez
    assert.equal(C.modoGravidez([{ id: 3, data: '2026-04-12', tipo: 'perda' }]).ativo, false);
});

caso('modo gravidez: gravidez ativa e contagem de semanas', () => {
    const ev = [
        { id: 1, data: '2026-04-10', tipo: 'relacao', nota: null },
        { id: 2, data: '2026-04-20', tipo: 'gravidez', nota: null }
    ];
    const m = C.modoGravidez(ev);
    assert.equal(m.ativo, true);
    assert.equal(m.evento.id, 2);

    const r = [{ inicio: '2026-02-01', fim: '2026-02-05' }, { inicio: '2026-03-01', fim: '2026-03-05' }];
    // 1 de março -> 12 de abril = 42 dias = 6+0
    assert.deepEqual(C.semanasGravidez(r, '2026-04-12'), { semanas: 6, dias: 0, totalDias: 42, inicio: '2026-03-01' });
    // 45 dias = 6+3
    const g = C.semanasGravidez(r, '2026-04-15');
    assert.equal(g.semanas, 6);
    assert.equal(g.dias, 3);
    assert.equal(C.textoGravidez(g), 'Gravidez: semana 6+3');
    assert.equal(C.semanasGravidez([], '2026-04-15'), null);

    // terminado manualmente: deixa de estar ativo sem existir perda
    const terminado = [{ id: 2, data: '2026-04-20', tipo: 'gravidez', nota: C.MARCA_TERMINADA }];
    assert.equal(C.modoGravidez(terminado).ativo, false);
});

caso('modo gravidez: gravidez seguida de perda', () => {
    const ev = [
        { id: 1, data: '2026-04-20', tipo: 'gravidez', nota: null },
        { id: 2, data: '2026-05-10', tipo: 'perda', nota: null }
    ];
    assert.equal(C.modoGravidez(ev).ativo, false);

    // nova gravidez depois da perda volta a ativar o modo
    ev.push({ id: 3, data: '2026-08-01', tipo: 'gravidez', nota: null });
    const m = C.modoGravidez(ev);
    assert.equal(m.ativo, true);
    assert.equal(m.evento.id, 3);
});

if (falhas) { console.log('\n' + falhas + ' teste(s) falharam'); process.exit(1); }
console.log('\nTodos os testes passaram');
