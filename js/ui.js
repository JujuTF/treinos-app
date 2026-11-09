// ============================================
// ui.js — Componentes visuais partilhados (anel de progresso)
// ============================================
(function (root) {
    const CIRCUNFERENCIA = 263.9; // 2 * PI * 42

    function garantirGradiente() {
        if (document.getElementById('anel-defs') || !document.body) return;
        document.body.insertAdjacentHTML('afterbegin',
            '<svg id="anel-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
            '<defs><linearGradient id="grad-anel" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="#0D9488"/><stop offset="1" stop-color="#6366F1"/>' +
            '</linearGradient></defs></svg>');
    }

    // Devolve o HTML de um anel (r=42, começa no topo). O traço arranca vazio
    // e anima até ao valor quando se chama animarAneis().
    // opcoes: { pct, tamanho, traco, centro (html), id (do círculo do traço), rotulo (aria) }
    function anel(opcoes) {
        garantirGradiente();
        const o = opcoes || {};
        const pct = Math.max(0, Math.min(100, Number(o.pct) || 0));
        const t = o.tamanho || 76;
        const w = o.traco || 9;
        const aria = o.rotulo ? ' role="img" aria-label="' + o.rotulo + '"' : ' aria-hidden="true"';
        return '<div class="anel" style="width:' + t + 'px;height:' + t + 'px"' + aria + '>' +
            '<svg viewBox="0 0 100 100" fill="none">' +
            '<circle class="anel-pista" cx="50" cy="50" r="42" stroke-width="' + w + '"/>' +
            '<circle class="anel-traco"' + (o.id ? ' id="' + o.id + '"' : '') + ' data-pct="' + pct + '"' +
            ' cx="50" cy="50" r="42" stroke-width="' + w + '" stroke="url(#grad-anel)" stroke-linecap="round"' +
            ' transform="rotate(-90 50 50)" stroke-dasharray="0 ' + CIRCUNFERENCIA + '" style="opacity:0"/>' +
            '</svg>' +
            '<div class="anel-centro">' + (o.centro || '') + '</div></div>';
    }

    function definirAnel(circulo, pct) {
        if (!circulo) return;
        const p = Math.max(0, Math.min(100, Number(pct) || 0));
        circulo.setAttribute('data-pct', p);
        circulo.style.strokeDasharray = (p * CIRCUNFERENCIA / 100) + ' ' + CIRCUNFERENCIA;
        circulo.style.opacity = p > 0 ? 1 : 0; // evita o ponto do linecap a 0 %
    }

    // Donut segmentado (r=42, começa no topo). Cada segmento tem uma cor própria e
    // arranca vazio; animarAneis() faz crescer todos até ao valor.
    // opcoes: { segmentos: [{ valor, cor }], tamanho, traco, centro (html), rotulo (aria) }
    // Sem valores (total 0) desenha só a pista cinzenta.
    function donut(opcoes) {
        const o = opcoes || {};
        const t = o.tamanho || 132;
        const w = o.traco || 12;
        const segs = (o.segmentos || []).filter(function (s) { return s && s.valor > 0; });
        const total = segs.reduce(function (a, s) { return a + s.valor; }, 0);
        const folga = segs.length > 1 ? 2.5 : 0; // espaço entre segmentos
        let acumulado = 0;
        const circulos = segs.map(function (s) {
            const comp = s.valor / total * CIRCUNFERENCIA;
            const visivel = Math.max(0.5, comp - folga);
            const c = '<circle class="donut-seg" data-len="' + visivel.toFixed(2) + '" cx="50" cy="50" r="42"' +
                ' stroke-width="' + w + '" stroke="' + s.cor + '" transform="rotate(-90 50 50)"' +
                ' stroke-dasharray="0 ' + CIRCUNFERENCIA + '" stroke-dashoffset="' + (-(acumulado + folga / 2)).toFixed(2) + '"/>';
            acumulado += comp;
            return c;
        }).join('');
        const aria = o.rotulo ? ' role="img" aria-label="' + o.rotulo + '"' : ' aria-hidden="true"';
        return '<div class="anel" style="width:' + t + 'px;height:' + t + 'px"' + aria + '>' +
            '<svg viewBox="0 0 100 100" fill="none">' +
            '<circle class="anel-pista" cx="50" cy="50" r="42" stroke-width="' + w + '"/>' + circulos +
            '</svg><div class="anel-centro">' + (o.centro || '') + '</div></div>';
    }

    // Anima todos os anéis e donuts ainda vazios dentro de raiz
    function animarAneis(raiz) {
        const r = raiz || document;
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                r.querySelectorAll('.anel-traco').forEach(function (c) {
                    definirAnel(c, c.getAttribute('data-pct'));
                });
                r.querySelectorAll('.donut-seg').forEach(function (c) {
                    c.style.strokeDasharray = c.getAttribute('data-len') + ' ' + CIRCUNFERENCIA;
                });
            });
        });
    }

    root.UI = { anel: anel, donut: donut, definirAnel: definirAnel, animarAneis: animarAneis };
})(window);
