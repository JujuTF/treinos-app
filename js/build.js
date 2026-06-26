// build.js — corre no Netlify antes de cada deploy
// Injeta a data/hora do deploy no index.html e login.html

const fs = require('fs');

const agora = new Date();
const data = agora.toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Europe/Lisbon'
});
const hora = agora.toLocaleTimeString('pt-PT', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Lisbon'
});

const timestamp = `${data} ${hora}`;

// Injeta no index.html
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('__DEPLOY_TIME__', timestamp);
fs.writeFileSync('index.html', html);

console.log(`✅ Deploy timestamp: ${timestamp}`);
