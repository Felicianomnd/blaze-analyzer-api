// Rotas administrativas
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { checkAdmin } = require('../middleware/adminAuth');
const fs = require('fs').promises;
const path = require('path');

const DB_FILE = path.join(__dirname, '../database.json');

// Função auxiliar para ler banco de dados
async function readDB() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erro ao ler banco:', error);
        return {
            users: [],
            admins: [],
            plans: [],
            activationCodes: [],
            giros: []
        };
    }
}

// Função auxiliar para salvar banco de dados
async function saveDB(data) {
    try {
        await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Erro ao salvar banco:', error);
        return false;
    }
}

// Gerar código de ativação único
function generateActivationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ ROTA TEMPORÁRIA DE SETUP - CRIAR PRIMEIRO ADMIN
// ACESSE UMA VEZ: GET /api/admin/setup-first-admin
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/setup-first-admin', async (req, res) => {
    try {
        const db = await readDB();
        
        // Verificar se já existe admin
        if (db.admins && db.admins.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Já existe um administrador cadastrado. Esta rota está desabilitada.'
            });
        }
        
        // Criar primeiro admin
        const hashedPassword = await bcrypt.hash('Casa@21@21.', 10);
        
        const firstAdmin = {
            id: 1,
            name: 'FELICIANO DE SOUZA BRITO',
            email: 'felicianods21@gmail.com',
            password: hashedPassword,
            isSuperAdmin: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (!db.admins) db.admins = [];
        db.admins.push(firstAdmin);
        
        await saveDB(db);
        
        res.json({
            success: true,
            message: '✅ Primeiro administrador criado com sucesso!',
            admin: {
                name: firstAdmin.name,
                email: firstAdmin.email
            }
        });
        
    } catch (error) {
        console.error('Erro ao criar admin:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao criar administrador'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN DO ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email e senha são obrigatórios'
            });
        }

        const db = await readDB();

        // Procurar admin
        const admin = db.admins?.find(a => a.email === email);

        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Email ou senha inválidos'
            });
        }

        // Verificar senha
        const isValidPassword = await bcrypt.compare(password, admin.password);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: 'Email ou senha inválidos'
            });
        }

        // Gerar token JWT
        const token = jwt.sign(
            {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: 'admin',
                isSuperAdmin: admin.isSuperAdmin || false
            },
            process.env.JWT_SECRET || 'seu-secret-key-aqui',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name
            }
        });
    } catch (error) {
        console.error('Erro no login admin:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao fazer login'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD - ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/stats', checkAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const now = new Date();

        const stats = {
            totalUsers: db.users?.length || 0,
            pendingUsers: db.users?.filter(u => u.status === 'pending').length || 0,
            activeUsers: db.users?.filter(u => u.status === 'active' && new Date(u.expiresAt) > now).length || 0,
            expiredUsers: db.users?.filter(u => u.status === 'expired' || (u.status === 'active' && new Date(u.expiresAt) <= now)).length || 0,
            totalCodes: db.activationCodes?.length || 0,
            usedCodes: db.activationCodes?.filter(c => c.usedAt).length || 0,
            unusedCodes: db.activationCodes?.filter(c => !c.usedAt).length || 0
        };

        // Últimos usuários cadastrados
        const recentUsers = (db.users || [])
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10)
            .map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                status: u.status,
                selectedPlan: u.selectedPlan,
                createdAt: u.createdAt,
                expiresAt: u.expiresAt
            }));

        res.json({
            success: true,
            stats,
            recentUsers
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar estatísticas'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LISTAR TODOS OS USUÁRIOS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/users', checkAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const { status, search, page = 1, limit = 20 } = req.query;

        let users = db.users || [];

        // Filtrar por status
        if (status && status !== 'all') {
            users = users.filter(u => u.status === status);
        }

        // Pesquisar
        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(u =>
                u.name.toLowerCase().includes(searchLower) ||
                u.email.toLowerCase().includes(searchLower)
            );
        }

        // Ordenar por data de criação (mais recentes primeiro)
        users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Paginação
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedUsers = users.slice(startIndex, endIndex);

        res.json({
            success: true,
            users: paginatedUsers.map(u => ({
                ...u,
                password: undefined // Não enviar senha
            })),
            pagination: {
                total: users.length,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(users.length / limit)
            }
        });
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar usuários'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUSCAR USUÁRIO POR ID
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/users/:id', checkAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const user = db.users?.find(u => u.id === parseInt(req.params.id));

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            user: {
                ...user,
                password: undefined
            }
        });
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar usuário'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GERAR CÓDIGO DE ATIVAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/generate-code', checkAdmin, async (req, res) => {
    try {
        const { userId, planDuration } = req.body;

        if (!userId || !planDuration) {
            return res.status(400).json({
                success: false,
                error: 'userId e planDuration são obrigatórios'
            });
        }

        const db = await readDB();

        // Verificar se usuário existe
        const user = db.users?.find(u => u.id === parseInt(userId));
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Verificar se plano existe
        const plan = db.plans?.find(p => p.duration === planDuration);
        if (!plan) {
            return res.status(404).json({
                success: false,
                error: 'Plano não encontrado'
            });
        }

        // Gerar código único
        let code;
        let codeExists = true;
        while (codeExists) {
            code = generateActivationCode();
            codeExists = db.activationCodes?.some(c => c.code === code);
        }

        // Calcular data de expiração
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + plan.days);

        // Criar código
        const activationCode = {
            id: (db.activationCodes?.length || 0) + 1,
            code,
            userId: parseInt(userId),
            planDuration,
            planDays: plan.days,
            expiresAt: expiresAt.toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: req.admin.email,
            usedAt: null
        };

        // Salvar
        if (!db.activationCodes) db.activationCodes = [];
        db.activationCodes.push(activationCode);

        await saveDB(db);

        res.json({
            success: true,
            code: activationCode.code,
            activationCode,
            user: {
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Erro ao gerar código:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao gerar código'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LISTAR CÓDIGOS DE ATIVAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/codes', checkAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const { used, userId } = req.query;

        let codes = db.activationCodes || [];

        // Filtrar por usado/não usado
        if (used === 'true') {
            codes = codes.filter(c => c.usedAt);
        } else if (used === 'false') {
            codes = codes.filter(c => !c.usedAt);
        }

        // Filtrar por usuário
        if (userId) {
            codes = codes.filter(c => c.userId === parseInt(userId));
        }

        // Ordenar por data de criação (mais recentes primeiro)
        codes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Adicionar informações do usuário
        const codesWithUser = codes.map(c => {
            const user = db.users?.find(u => u.id === c.userId);
            return {
                ...c,
                user: user ? {
                    name: user.name,
                    email: user.email
                } : null
            };
        });

        res.json({
            success: true,
            codes: codesWithUser
        });
    } catch (error) {
        console.error('Erro ao listar códigos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar códigos'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ATUALIZAR STATUS DO USUÁRIO (ATIVAR/DESATIVAR)
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/users/:id/status', checkAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const userId = parseInt(req.params.id);

        if (!['pending', 'active', 'expired', 'blocked'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Status inválido'
            });
        }

        const db = await readDB();
        const userIndex = db.users?.findIndex(u => u.id === userId);

        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        db.users[userIndex].status = status;
        await saveDB(db);

        res.json({
            success: true,
            user: {
                ...db.users[userIndex],
                password: undefined
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar status'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RENOVAR ASSINATURA DE USUÁRIO
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/users/:id/renew', checkAdmin, async (req, res) => {
    try {
        const { days } = req.body;
        const userId = parseInt(req.params.id);

        if (!days || days < 1) {
            return res.status(400).json({
                success: false,
                error: 'Número de dias inválido'
            });
        }

        const db = await readDB();
        const userIndex = db.users?.findIndex(u => u.id === userId);

        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        const user = db.users[userIndex];

        // Calcular nova data de expiração
        let newExpiresAt;
        if (user.expiresAt && new Date(user.expiresAt) > new Date()) {
            // Se ainda está ativo, adicionar dias à data atual de expiração
            newExpiresAt = new Date(user.expiresAt);
        } else {
            // Se já expirou, começar de hoje
            newExpiresAt = new Date();
        }
        newExpiresAt.setDate(newExpiresAt.getDate() + parseInt(days));

        user.expiresAt = newExpiresAt.toISOString();
        user.status = 'active';

        await saveDB(db);

        res.json({
            success: true,
            message: `Assinatura renovada por ${days} dias`,
            user: {
                ...user,
                password: undefined
            }
        });
    } catch (error) {
        console.error('Erro ao renovar assinatura:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao renovar assinatura'
        });
    }
});

module.exports = router;

