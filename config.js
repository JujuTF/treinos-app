// ============================================
// config.js — Configuração Supabase
// ============================================

const SUPABASE_URL = 'https://nvikoplscztfadjhwviz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-ip63oS8NkXXIVsfrSDrhQ_UqdfhaHH';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

window.db = db;

console.log('✅ Supabase ligado');
