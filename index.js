
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());


const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'fittrack',
  waitForConnections: true,
  connectionLimit: 10,
});


const ok = (res, data) => res.json({ ok: true, data });
const err = (res, msg, st) => res.status(st || 400).json({ ok: false, error: msg });

app.get('/api/usuarios', async (req, res) => {
  try {
    const { perfil, q } = req.query;
    let sql = 'SELECT id, nome, email, perfil, objetivo, peso, altura, status, criado_em FROM usuarios WHERE 1=1';
    const vals = [];

    if (perfil) { sql += ' AND perfil = ?'; vals.push(perfil); }
    if (q) { sql += ' AND (nome LIKE ? OR email LIKE ?)'; vals.push(`%${q}%`, `%${q}%`); }

    sql += ' ORDER BY criado_em DESC';
    const [rows] = await pool.execute(sql, vals);
    ok(res, rows);
  } catch (e) { err(res, e.message, 500); }
});


app.get('/api/usuarios/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome, email, perfil, objetivo, peso, altura, status, criado_em FROM usuarios WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Usuário não encontrado.', 404);
    ok(res, rows[0]);
  } catch (e) { err(res, e.message, 500); }
});


app.post('/api/usuarios', async (req, res) => {
  try {
    const { nome, email, senha, perfil = 'usuario', objetivo, peso, altura } = req.body;

    if (!nome) return err(res, 'Nome é obrigatório.');
    if (!email || !email.includes('@')) return err(res, 'E-mail inválido.');
    if (!senha || senha.length < 6) return err(res, 'Senha deve ter pelo menos 6 caracteres.');

    
    const [dup] = await pool.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (dup.length) return err(res, 'E-mail já cadastrado.');

    const hash = await bcrypt.hash(senha, 10);
    const [result] = await pool.execute(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, objetivo, peso, altura) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome, email, hash, perfil, objetivo || null, peso || null, altura || null]
    );

    ok(res, {
      id: result.insertId, nome, email, perfil,
      objetivo: objetivo || null, peso: peso || null, altura: altura || null,
      status: 'ativo', criado_em: new Date().toISOString()
    });
  } catch (e) { err(res, e.message, 500); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return err(res, 'E-mail e senha obrigatórios.');

    const [rows] = await pool.execute(
      'SELECT id, nome, email, perfil, senha_hash, status FROM usuarios WHERE email = ?',
      [email]
    );
    if (!rows.length) return err(res, 'E-mail não encontrado.', 404);

    const user = rows[0];
    if (user.status !== 'ativo') return err(res, 'Conta inativa.', 403);

    const match = await bcrypt.compare(senha, user.senha_hash);
    if (!match) return err(res, 'Senha incorreta.', 401);

  
    ok(res, { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil });
  } catch (e) { err(res, e.message, 500); }
});

app.patch('/api/usuarios/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ativo', 'inativo'].includes(status)) return err(res, 'Status inválido.');
    await pool.execute('UPDATE usuarios SET status = ? WHERE id = ?', [status, req.params.id]);
    ok(res, { id: Number(req.params.id), status });
  } catch (e) { err(res, e.message, 500); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return err(res, 'Usuário não encontrado.', 404);
    ok(res, { deleted: Number(req.params.id) });
  } catch (e) { err(res, e.message, 500); }
});


app.get('/api/usuarios/:id/diario', async (req, res) => {
  try {
    const { data } = req.query;
    let sql = 'SELECT * FROM diario_alimentar WHERE usuario_id = ?';
    const vals = [req.params.id];
    if (data) { sql += ' AND data = ?'; vals.push(data); }
    sql += ' ORDER BY data DESC, criado_em ASC';
    const [rows] = await pool.execute(sql, vals);
    ok(res, rows);
  } catch (e) { err(res, e.message, 500); }
});


app.post('/api/usuarios/:id/diario', async (req, res) => {
  try {
    const { data, refeicao, alimento, quantidade, calorias, proteinas, carboidratos, gorduras } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO diario_alimentar (usuario_id, data, refeicao, alimento, quantidade, calorias, proteinas, carboidratos, gorduras) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.params.id, data, refeicao, alimento, quantidade, calorias || 0, proteinas || 0, carboidratos || 0, gorduras || 0]
    );
    ok(res, { id: result.insertId });
  } catch (e) { err(res, e.message, 500); }
});


app.get('/api/usuarios/:id/peso', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM registros_peso WHERE usuario_id = ? ORDER BY data ASC',
      [req.params.id]
    );
    ok(res, rows);
  } catch (e) { err(res, e.message, 500); }
});


app.post('/api/usuarios/:id/peso', async (req, res) => {
  try {
    const { data, peso, observacao } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO registros_peso (usuario_id, data, peso, observacao) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE peso=VALUES(peso), observacao=VALUES(observacao)',
      [req.params.id, data, peso, observacao || null]
    );
    ok(res, { id: result.insertId || null, data, peso });
  } catch (e) { err(res, e.message, 500); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM usuarios');
    const [[{ admins }]] = await pool.execute("SELECT COUNT(*) AS admins FROM usuarios WHERE perfil='admin'");
    const [[{ ativos }]] = await pool.execute("SELECT COUNT(*) AS ativos FROM usuarios WHERE status='ativo'");
    const [[{ novos }]] = await pool.execute("SELECT COUNT(*) AS novos FROM usuarios WHERE DATE(criado_em) = CURDATE()");
    ok(res, { total, admins, ativos, novos });
  } catch (e) { err(res, e.message, 500); }
});


app.listen(PORT, () => {
  console.log(` FitTrack API rodando em http://localhost:${PORT}`);
});
