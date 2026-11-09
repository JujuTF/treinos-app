// Testes simples, sem dependências. Correr com:  node tests/conquistas.test.js
const assert = require('node:assert/strict');
const C = require('../js/conquistas.js');

let falhas = 0;
function caso(nome, fn) {
    try { fn(); console.log('ok   - ' + nome); }
    catch (e) { falhas++; console.log('FAIL - ' + nome + '\n       ' + e.message); }
}

// Constrói dados a partir de uma lista de dias completos / parciais
const treinos = d => d.map(data => ({ data }));
const agua = d => d.map(data => ({ data, agua_ml: 2000, meta_agua_ml: 2000 }));
const sup = d => d.map(data => ({ data, suplementos: true }));

caso('dia com 2 de 3 não é combo', () => {
    const idx = C.indexar({ treinos: treinos(['2026-11-05']), agua: agua(['2026-11-05']), suplementos: [] });
    const e = C.estadoDoDia(idx, '2026-11-05');
    assert.equal(e.feitas, 2);
    assert.equal(e.combo, false);
    assert.equal(e.suplementos, false);
    assert.deepEqual(C.datasCombo(idx), []);
});

caso('água: só conta ao atingir a meta; progresso parcial', () => {
    const idx = C.indexar({ agua: [
        { data: '2026-11-01', agua_ml: 1000, meta_agua_ml: 2000 },
        { data: '2026-11-02', agua_ml: 2500, meta_agua_ml: 2000 },
        { data: '2026-11-03', agua_ml: 1500, meta_agua_ml: null }
    ] });
    assert.equal(C.estadoDoDia(idx, '2026-11-01').agua, false);
    assert.equal(C.estadoDoDia(idx, '2026-11-01').aguaPct, 50);
    assert.equal(C.estadoDoDia(idx, '2026-11-02').agua, true);
    assert.equal(C.estadoDoDia(idx, '2026-11-02').aguaPct, 100);
    assert.equal(C.estadoDoDia(idx, '2026-11-03').aguaPct, 75); // meta por defeito 2000
    assert.equal(C.estadoDoDia(idx, '2026-11-09').aguaPct, 0);  // sem linha
});

caso('suplementos false não conta', () => {
    const idx = C.indexar({ suplementos: [{ data: '2026-11-05', suplementos: false }] });
    assert.equal(C.estadoDoDia(idx, '2026-11-05').suplementos, false);
});

const dias = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07'];
const idxSeq = C.indexar({ treinos: treinos(dias), agua: agua(dias), suplementos: sup(dias) });
const combos = C.datasCombo(idxSeq);

caso('sequência que se parte (falta o dia 4)', () => {
    assert.deepEqual(combos, dias);
    assert.equal(C.melhorCombos(combos), 3);
    assert.equal(C.sequenciaCombos(combos, '2026-11-07'), 3);
    assert.equal(C.sequenciaCombos(combos, '2026-11-08'), 3); // hoje ainda por fazer: ontem mantém
    assert.equal(C.sequenciaCombos(combos, '2026-11-09'), 0); // partiu
    assert.equal(C.sequenciaCombos(combos, '2026-11-03'), 3);
    assert.equal(C.sequenciaCombos(combos, '2026-11-05'), 1);
});

caso('combos do mês e mês sem combos', () => {
    assert.equal(C.combosDoMes(combos, '2026-11'), 6);
    assert.equal(C.combosDoMes(combos, '2026-10'), 0);
    assert.equal(C.melhorCombos([]), 0);
    assert.equal(C.sequenciaCombos([], '2026-11-09'), 0);
});

caso('mês anterior', () => {
    assert.equal(C.mesAnterior('2026-11'), '2026-10');
    assert.equal(C.mesAnterior('2026-01'), '2025-12');
});

caso('calendário do mês', () => {
    const cal = C.calendarioMes(idxSeq, '2026-11', '2026-11-09');
    assert.equal(cal.dias.length, 30);
    assert.equal(cal.offset, 6); // 1 nov 2026 é domingo
    assert.equal(cal.dias[0].combo, true);
    assert.equal(cal.dias[3].combo, false); // dia 4
    assert.equal(cal.dias[8].hoje, true);
    assert.equal(cal.dias[9].futuro, true);
    assert.equal(C.calendarioMes(idxSeq, '2026-02', '2026-11-09').dias.length, 28);
});

caso('troféu: faixas e quanto falta', () => {
    assert.deepEqual(C.nivelTrofeu(0), { nivel: 0, nome: null, proximo: { nome: 'Bronze', min: 5, faltam: 5 } });
    assert.equal(C.nivelTrofeu(4).nivel, 0);
    assert.equal(C.nivelTrofeu(4).proximo.faltam, 1);
    assert.equal(C.nivelTrofeu(5).nome, 'Bronze');
    assert.equal(C.nivelTrofeu(9).proximo.faltam, 1);
    assert.equal(C.nivelTrofeu(10).nome, 'Prata');
    assert.equal(C.nivelTrofeu(19).nome, 'Prata');
    assert.equal(C.nivelTrofeu(20).nome, 'Ouro');
    assert.equal(C.nivelTrofeu(31).proximo, null);
});

if (falhas) { console.log('\n' + falhas + ' teste(s) falharam'); process.exit(1); }
console.log('\nTodos os testes passaram');
