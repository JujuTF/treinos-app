// Testes simples, sem dependências. Correr com:  node tests/treino-calc.test.js
const assert = require('node:assert/strict');
const T = require('../js/treino-calc.js');

let falhas = 0;
function caso(nome, fn) {
    try { fn(); console.log('ok   - ' + nome); }
    catch (e) { falhas++; console.log('FAIL - ' + nome + '\n       ' + e.message); }
}

const sessoes = ['2026-11-02', '2026-11-03', '2026-11-03', '2026-11-04', '2026-11-07', '2026-10-20', '2026-10-21']
    .map(data => ({ data }));
const datas = T.datasUnicas(sessoes);

caso('datas únicas e ordenadas', () => {
    assert.deepEqual(datas, ['2026-10-20', '2026-10-21', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-07']);
});

caso('início da semana (segunda-feira)', () => {
    assert.equal(T.inicioSemana('2026-11-09'), '2026-11-09'); // segunda
    assert.equal(T.inicioSemana('2026-11-08'), '2026-11-02'); // domingo
    assert.equal(T.inicioSemana('2026-11-04'), '2026-11-02');
});

caso('sequência atual e melhor sequência', () => {
    assert.equal(T.sequenciaAtual(datas, '2026-11-07'), 1);   // treinou hoje, ontem não
    assert.equal(T.sequenciaAtual(datas, '2026-11-08'), 1);   // ontem conta: sequência ainda viva
    assert.equal(T.sequenciaAtual(datas, '2026-11-09'), 0);   // ontem sem treino
    assert.equal(T.sequenciaAtual(datas, '2026-11-04'), 3);   // 2, 3 e 4
    assert.equal(T.melhorSequencia(datas), 3);
    assert.equal(T.melhorSequencia([]), 0);
});

caso('dias desde o último treino', () => {
    assert.equal(T.diasDesdeUltimo(datas, '2026-11-07'), 0);
    assert.equal(T.diasDesdeUltimo(datas, '2026-11-10'), 3);
    assert.equal(T.diasDesdeUltimo([], '2026-11-10'), null);
});

caso('semana, mês e últimas semanas', () => {
    assert.equal(T.contarIntervalo(datas, '2026-11-02', '2026-11-08'), 4);
    assert.equal(T.diasNoMes(datas, '2026-11-09'), 4);
    const s = T.semanasRecentes(datas, '2026-11-09', 3);
    assert.deepEqual(s.map(x => x.inicio), ['2026-10-26', '2026-11-02', '2026-11-09']);
    assert.deepEqual(s.map(x => x.dias), [0, 4, 0]);
    assert.equal(T.semanasRecentes(datas, '2026-11-09', 8).length, 8);
});

if (falhas) { console.log('\n' + falhas + ' teste(s) falharam'); process.exit(1); }
console.log('\nTodos os testes passaram');
