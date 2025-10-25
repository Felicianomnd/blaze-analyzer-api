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
// CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MAX_GIROS: 2000,        // Limite de giros armazenados
  MAX_PADROES: 5000,      // Limite de padrões armazenados
  POLLING_INTERVAL: 2000, // Coletar da Blaze a cada 2 segundos
  BLAZE_API_URL: 'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1'
};

// Variáveis de controle
let pollingIntervalId = null;
let collectionStats = {
  totalCollected: 0,
  lastCollection: null,
  errors: 0,
  running: false
};

// ═══════════════════════════════════════════════════════════════════════════════
// COLETA AUTOMÁTICA DA BLAZE
// ═══════════════════════════════════════════════════════════════════════════════

// Função para converter número em cor
function getColorFromNumber(number) {
  if (number === 0) return 'white';
  if (number >= 1 && number <= 7) return 'red';
  if (number >= 8 && number <= 14) return 'black';
  return 'unknown';
}

// Função para coletar giro da API da Blaze
async function collectFromBlaze() {
  try {
    const response = await fetch(CONFIG.BLAZE_API_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // API retorna um array com 1 objeto
    if (Array.isArray(data) && data.length > 0) {
      const latestSpin = data[0];
      const rollNumber = latestSpin.roll;
      const rollColor = getColorFromNumber(rollNumber);
      
      const newGiro = {
        id: `spin_${latestSpin.created_at}`,
        number: rollNumber,
        color: rollColor,
        timestamp: latestSpin.created_at,
        created_at: latestSpin.created_at,
        collected_by: 'server'
      };
      
      // Verificar se já existe no banco
      const db = await readDB();
      const exists = db.giros.some(g => 
        g.id === newGiro.id || 
        (g.timestamp === newGiro.timestamp && g.number === newGiro.number)
      );
      
      if (!exists) {
        // Adicionar novo giro
        db.giros.unshift(newGiro);
        db.giros = db.giros.slice(0, CONFIG.MAX_GIROS); // Limitar a 2000
        db.metadata.totalGiros = db.giros.length;
        await saveDB(db);
        
        console.log(`🎯 NOVO GIRO coletado: #${rollNumber} ${rollColor.toUpperCase()} | Total: ${db.giros.length}`);
        collectionStats.totalCollected++;
        return { success: true, isNew: true, giro: newGiro };
      } else {
        return { success: true, isNew: false, message: 'Giro já existe' };
      }
    } else {
      throw new Error('Formato de resposta inválido');
    }
  } catch (error) {
    console.error('❌ Erro ao coletar da Blaze:', error.message);
    collectionStats.errors++;
    return { success: false, error: error.message };
  } finally {
    collectionStats.lastCollection = new Date().toISOString();
  }
}

// Iniciar coleta automática
function startAutoCollection() {
  if (collectionStats.running) {
    console.log('⚠️ Coleta automática já está rodando');
    return;
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🤖 INICIANDO COLETA AUTOMÁTICA DA BLAZE');
  console.log(`   Intervalo: ${CONFIG.POLLING_INTERVAL / 1000} segundos`);
  console.log(`   URL: ${CONFIG.BLAZE_API_URL}`);
  console.log('═══════════════════════════════════════════════════════════');
  
  collectionStats.running = true;
  
  // Coletar imediatamente
  collectFromBlaze();
  
  // Depois coletar a cada intervalo
  pollingIntervalId = setInterval(() => {
    collectFromBlaze();
  }, CONFIG.POLLING_INTERVAL);
}

// Parar coleta automática
function stopAutoCollection() {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
  collectionStats.running = false;
  console.log('⏸️ Coleta automática parada');
}

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

// GET - Retorna todos os giros (últimos 2000)
app.get("/api/giros", async (req, res) => {
  try {
    const db = await readDB();
    const limit = parseInt(req.query.limit) || CONFIG.MAX_GIROS;
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
    
    // Limita a 2000 giros
    db.giros = db.giros.slice(0, CONFIG.MAX_GIROS);
    
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

// GET - Retorna todos os padrões (até 5000)
app.get("/api/padroes", async (req, res) => {
  try {
    const db = await readDB();
    const limit = parseInt(req.query.limit) || CONFIG.MAX_PADROES;
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
        limit: CONFIG.MAX_PADROES,
        percentage: ((db.padroes.length / CONFIG.MAX_PADROES) * 100).toFixed(1),
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
    
    // Limita a 5000 padrões
    db.padroes = db.padroes.slice(0, CONFIG.MAX_PADROES);
    
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
      version: '2.0',
      uptime: process.uptime(),
      database: {
        giros: db.giros.length,
        padroes: db.padroes.length,
        lastUpdate: db.metadata.lastUpdate
      },
      autoCollection: {
        running: collectionStats.running,
        totalCollected: collectionStats.totalCollected,
        lastCollection: collectionStats.lastCollection,
        errors: collectionStats.errors,
        interval: `${CONFIG.POLLING_INTERVAL / 1000}s`
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

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 BLAZE ANALYZER API v2.0                               
╠═══════════════════════════════════════════════════════════╣
║  Status: Online ✅                                        
║  Porta: ${PORT}                                           
║  Ambiente: ${process.env.NODE_ENV || 'development'}      
╠═══════════════════════════════════════════════════════════╣
║  Limites:                                                 
║    • Giros: até ${CONFIG.MAX_GIROS}                       
║    • Padrões: até ${CONFIG.MAX_PADROES}                   
║    • Coleta automática: a cada ${CONFIG.POLLING_INTERVAL/1000}s (tempo real)
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
  
  // Iniciar coleta automática da Blaze
  console.log('');
  startAutoCollection();
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
  process.exit(1);
});

