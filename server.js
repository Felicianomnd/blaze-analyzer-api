const express = require("express");
const cors = require("cors");
const fs = require("fs-extra");
const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Suporta dados grandes

const PORT = process.env.PORT || 3000;
const DB_PATH = "./database.json";

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE BANCO DE DADOS
// ═══════════════════════════════════════════════════════════════════════════════

// Lê o banco de dados
async function readDB() {
  try {
    const exists = await fs.pathExists(DB_PATH);
    if (!exists) {
      await initDB();
    }
    return await fs.readJson(DB_PATH);
  } catch (error) {
    console.error('Erro ao ler banco:', error);
    return { giros: [], padroes: [], metadata: { lastUpdate: null, version: '1.0' } };
  }
}

// Salva o banco de dados
async function saveDB(data) {
  try {
    data.metadata = data.metadata || {};
    data.metadata.lastUpdate = new Date().toISOString();
    await fs.writeJson(DB_PATH, data, { spaces: 2 });
    return true;
  } catch (error) {
    console.error('Erro ao salvar banco:', error);
    return false;
  }
}

// Inicializa banco vazio
async function initDB() {
  const initialData = {
    giros: [],
    padroes: [],
    metadata: {
      version: '1.0',
      created_at: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      totalGiros: 0,
      totalPadroes: 0
    }
  };
  await saveDB(initialData);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS - GIROS
// ═══════════════════════════════════════════════════════════════════════════════

// GET - Retorna todos os giros (últimos 800)
app.get("/api/giros", async (req, res) => {
  try {
    const db = await readDB();
    const limit = parseInt(req.query.limit) || 800;
    const giros = db.giros.slice(0, limit);
    
    res.json({
      success: true,
      total: giros.length,
      limit: limit,
      data: giros
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao buscar giros',
      message: error.message 
    });
  }
});

// GET - Retorna apenas o último giro
app.get("/api/giros/latest", async (req, res) => {
  try {
    const db = await readDB();
    const latest = db.giros[0] || null;
    
    res.json({
      success: true,
      data: latest
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao buscar último giro',
      message: error.message 
    });
  }
});

// POST - Adiciona novo(s) giro(s)
app.post("/api/giros", async (req, res) => {
  try {
    const db = await readDB();
    const novosGiros = Array.isArray(req.body) ? req.body : [req.body];
    
    // Adiciona os novos giros no início (mais recentes primeiro)
    for (const giro of novosGiros) {
      // Verifica se já existe (evita duplicatas)
      const existe = db.giros.some(g => 
        g.id === giro.id || 
        (g.timestamp === giro.timestamp && g.number === giro.number)
      );
      
      if (!existe) {
        db.giros.unshift(giro);
      }
    }
    
    // Limita a 800 giros
    db.giros = db.giros.slice(0, 800);
    
    // Atualiza metadata
    db.metadata.totalGiros = db.giros.length;
    
    await saveDB(db);
    
    res.json({
      success: true,
      message: `${novosGiros.length} giro(s) processado(s)`,
      totalGiros: db.giros.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao salvar giros',
      message: error.message 
    });
  }
});

// DELETE - Limpa histórico de giros (cuidado!)
app.delete("/api/giros", async (req, res) => {
  try {
    const db = await readDB();
    db.giros = [];
    db.metadata.totalGiros = 0;
    await saveDB(db);
    
    res.json({
      success: true,
      message: 'Histórico de giros limpo'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao limpar giros',
      message: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS - PADRÕES
// ═══════════════════════════════════════════════════════════════════════════════

// GET - Retorna todos os padrões (até 4000)
app.get("/api/padroes", async (req, res) => {
  try {
    const db = await readDB();
    const limit = parseInt(req.query.limit) || 4000;
    const padroes = db.padroes.slice(0, limit);
    
    res.json({
      success: true,
      total: padroes.length,
      limit: limit,
      data: padroes
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao buscar padrões',
      message: error.message 
    });
  }
});

// GET - Estatísticas do banco de padrões
app.get("/api/padroes/stats", async (req, res) => {
  try {
    const db = await readDB();
    
    // Calcular estatísticas
    const byType = {};
    const byConfidence = { high: 0, medium: 0, low: 0 };
    
    db.padroes.forEach(p => {
      const type = p.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      
      const conf = p.confidence || 0;
      if (conf >= 80) byConfidence.high++;
      else if (conf >= 60) byConfidence.medium++;
      else byConfidence.low++;
    });
    
    res.json({
      success: true,
      stats: {
        total: db.padroes.length,
        limit: 4000,
        percentage: ((db.padroes.length / 4000) * 100).toFixed(1),
        byType: byType,
        byConfidence: byConfidence
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao calcular estatísticas',
      message: error.message 
    });
  }
});

// POST - Adiciona novo(s) padrão(ões)
app.post("/api/padroes", async (req, res) => {
  try {
    const db = await readDB();
    const novosPadroes = Array.isArray(req.body) ? req.body : [req.body];
    
    let adicionados = 0;
    
    for (const padrao of novosPadroes) {
      // Gerar ID único se não existir
      if (!padrao.id) {
        padrao.id = Date.now() + Math.floor(Math.random() * 1000);
      }
      
      // Verificar se já existe (por ID ou pattern)
      const existe = db.padroes.some(p => 
        p.id === padrao.id || 
        (JSON.stringify(p.pattern) === JSON.stringify(padrao.pattern) && 
         p.expected_next === padrao.expected_next)
      );
      
      if (!existe) {
        db.padroes.unshift(padrao);
        adicionados++;
      } else {
        // Atualizar padrão existente (merge de dados)
        const index = db.padroes.findIndex(p => 
          p.id === padrao.id || 
          (JSON.stringify(p.pattern) === JSON.stringify(padrao.pattern) && 
           p.expected_next === padrao.expected_next)
        );
        
        if (index !== -1) {
          db.padroes[index] = {
            ...db.padroes[index],
            ...padrao,
            found_at: db.padroes[index].found_at, // Mantém data original
            total_wins: (db.padroes[index].total_wins || 0) + (padrao.total_wins || 0),
            total_losses: (db.padroes[index].total_losses || 0) + (padrao.total_losses || 0),
            occurrences: Math.max(db.padroes[index].occurrences || 0, padrao.occurrences || 0)
          };
        }
      }
    }
    
    // Limita a 4000 padrões
    db.padroes = db.padroes.slice(0, 4000);
    
    // Atualiza metadata
    db.metadata.totalPadroes = db.padroes.length;
    
    await saveDB(db);
    
    res.json({
      success: true,
      message: `${adicionados} padrão(ões) adicionado(s)`,
      totalPadroes: db.padroes.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao salvar padrões',
      message: error.message 
    });
  }
});

// DELETE - Limpa banco de padrões (cuidado!)
app.delete("/api/padroes", async (req, res) => {
  try {
    const db = await readDB();
    db.padroes = [];
    db.metadata.totalPadroes = 0;
    await saveDB(db);
    
    res.json({
      success: true,
      message: 'Banco de padrões limpo'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao limpar padrões',
      message: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS - STATUS E HEALTHCHECK
// ═══════════════════════════════════════════════════════════════════════════════

// GET - Status da API
app.get("/api/status", async (req, res) => {
  try {
    const db = await readDB();
    
    res.json({
      success: true,
      status: 'online',
      version: '1.0',
      uptime: process.uptime(),
      database: {
        giros: db.giros.length,
        padroes: db.padroes.length,
        lastUpdate: db.metadata.lastUpdate
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao verificar status',
      message: error.message 
    });
  }
});

// GET - Healthcheck (para Render.com não hibernar)
app.get("/", (req, res) => {
  res.json({ 
    message: 'Blaze Analyzer API - Online ✅',
    version: '1.0',
    endpoints: [
      'GET  /api/giros',
      'GET  /api/giros/latest',
      'POST /api/giros',
      'GET  /api/padroes',
      'GET  /api/padroes/stats',
      'POST /api/padroes',
      'GET  /api/status'
    ]
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO DO SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════════

app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 BLAZE ANALYZER API                                    
╠═══════════════════════════════════════════════════════════╣
║  Status: Online ✅                                        
║  Porta: ${PORT}                                           
║  Ambiente: ${process.env.NODE_ENV || 'development'}      
╠═══════════════════════════════════════════════════════════╣
║  Endpoints disponíveis:                                   
║    • GET  /api/giros                                      
║    • GET  /api/giros/latest                               
║    • POST /api/giros                                      
║    • GET  /api/padroes                                    
║    • GET  /api/padroes/stats                              
║    • POST /api/padroes                                    
║    • GET  /api/status                                     
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Inicializar banco se não existir
  await initDB();
  const db = await readDB();
  console.log(`📊 Dados carregados: ${db.giros.length} giros, ${db.padroes.length} padrões`);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
  process.exit(1);
});

