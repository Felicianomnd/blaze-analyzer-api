// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS ADMINISTRATIVAS COM MONGODB
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const ActivationCode = require('../models/ActivationCode');
const Plan = require('../models/Plan');

// Middleware de autenticação admin
function checkAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'Token não fornecido'
            });
        }

        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seu-secret-key-aqui');
        
        if (decoded.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Acesso negado - Apenas administradores'
            });
        }

        req.admin = decoded;
        next();
    } catch (error) {
        console.error('Erro na autenticação admin:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expirado'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Erro ao verificar autenticação'
        });
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

        // Procurar admin
        const admin = await Admin.findOne({ email: email.toLowerCase() });

        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Email ou senha inválidos'
            });
        }

        // Verificar senha
        const isValidPassword = await admin.comparePassword(password);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: 'Email ou senha inválidos'
            });
        }

        // Gerar token JWT
        const token = jwt.sign(
            {
                id: admin._id,
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
            admin: admin.toJSON()
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
        const now = new Date();

        const stats = {
            totalUsers: await User.countDocuments(),
            pendingUsers: await User.countDocuments({ status: 'pending' }),
            activeUsers: await User.countDocuments({ 
                status: 'active', 
                expiresAt: { $gt: now } 
            }),
            expiredUsers: await User.countDocuments({
                $or: [
                    { status: 'expired' },
                    { status: 'active', expiresAt: { $lte: now } }
                ]
            }),
            totalCodes: await ActivationCode.countDocuments(),
            usedCodes: await ActivationCode.countDocuments({ usedAt: { $ne: null } }),
            unusedCodes: await ActivationCode.countDocuments({ usedAt: null })
        };

        // Últimos usuários cadastrados
        const recentUsers = await User.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .select('-password')
            .lean();

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
        const { status, search, page = 1, limit = 20 } = req.query;

        let query = {};

        // Filtrar por status
        if (status && status !== 'all') {
            query.status = status;
        }

        // Pesquisar
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Paginação
        const skip = (page - 1) * limit;
        
        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('-password')
            .lean();

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            users,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
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
        const user = await User.findById(req.params.id).select('-password').lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            user
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

        // Verificar se usuário existe
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Verificar se plano existe
        const plan = await Plan.findOne({ duration: planDuration });
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
            const existing = await ActivationCode.findOne({ code });
            codeExists = !!existing;
        }

        // Calcular data de expiração
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + plan.days);

        // Criar código
        const activationCode = new ActivationCode({
            code,
            userId: user._id,
            planDuration,
            planDays: plan.days,
            expiresAt,
            createdBy: req.admin.email
        });

        await activationCode.save();

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
        const { used, userId } = req.query;

        let query = {};

        // Filtrar por usado/não usado
        if (used === 'true') {
            query.usedAt = { $ne: null };
        } else if (used === 'false') {
            query.usedAt = null;
        }

        // Filtrar por usuário
        if (userId) {
            query.userId = userId;
        }

        const codes = await ActivationCode.find(query)
            .sort({ createdAt: -1 })
            .populate('userId', 'name email')
            .lean();

        // Formatar resposta
        const codesWithUser = codes.map(c => ({
            ...c,
            user: c.userId ? {
                name: c.userId.name,
                email: c.userId.email
            } : null
        }));

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
// ATUALIZAR STATUS DO USUÁRIO
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/users/:id/status', checkAdmin, async (req, res) => {
    try {
        const { status } = req.body;

        if (!['pending', 'active', 'expired', 'blocked'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Status inválido'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            user
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
// RENOVAR ASSINATURA
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/users/:id/renew', checkAdmin, async (req, res) => {
    try {
        const { days } = req.body;

        if (!days || days < 1) {
            return res.status(400).json({
                success: false,
                error: 'Número de dias inválido'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Calcular nova data de expiração
        let newExpiresAt;
        if (user.expiresAt && new Date(user.expiresAt) > new Date()) {
            newExpiresAt = new Date(user.expiresAt);
        } else {
            newExpiresAt = new Date();
        }
        newExpiresAt.setDate(newExpiresAt.getDate() + parseInt(days));

        user.expiresAt = newExpiresAt;
        user.status = 'active';
        await user.save();

        res.json({
            success: true,
            message: `Assinatura renovada por ${days} dias`,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Erro ao renovar assinatura:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao renovar assinatura'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GERENCIAR DISPOSITIVOS
// ═══════════════════════════════════════════════════════════════════════════════

// Listar dispositivos de um usuário
router.get('/users/:id/devices', checkAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('devices').lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        const devices = user.devices || [];

        res.json({
            success: true,
            devices: devices.map(d => ({
                ...d,
                isActive: d.active
            }))
        });
    } catch (error) {
        console.error('Erro ao listar dispositivos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar dispositivos'
        });
    }
});

// Remover dispositivo
router.delete('/users/:userId/devices/:deviceId', checkAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Remover dispositivo
        user.devices = user.devices.filter(d => d._id.toString() !== req.params.deviceId);
        await user.save();

        console.log(`✅ Dispositivo removido: Usuário ID ${req.params.userId} | Device ID ${req.params.deviceId}`);

        res.json({
            success: true,
            message: 'Dispositivo removido com sucesso'
        });
    } catch (error) {
        console.error('Erro ao remover dispositivo:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao remover dispositivo'
        });
    }
});

module.exports = router;
