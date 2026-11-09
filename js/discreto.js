// ============================================
// discreto.js — Preferência "modo discreto"
// Ligado por defeito. Guardado em localStorage (chave própria).
// ============================================
(function (root) {
    const CHAVE = 'treinos_modo_discreto';

    function ativo() {
        try { return localStorage.getItem(CHAVE) !== '0'; }
        catch (e) { return true; }
    }

    function definir(ligado) {
        try { localStorage.setItem(CHAVE, ligado ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    }

    function alternar() {
        const novo = !ativo();
        definir(novo);
        return novo;
    }

    root.Discreto = { ativo: ativo, definir: definir, alternar: alternar };
})(window);
