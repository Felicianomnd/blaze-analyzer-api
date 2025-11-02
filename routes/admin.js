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
// 🔧 ROTA TEMPORÁRIA - CRIAR PRIMEIRO ADMIN (SEM AUTENTICAÇÃO)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/setup-first-admin', async (req, res) => {
    try {
        // Verificar se já existe algum admin
        const adminCount = await Admin.countDocuments();
        
        if (adminCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Admin já existe! Use a rota de login normal.',
                adminsCount: adminCount
            });
        }

        // Criar admin padrão
        const admin = new Admin({
            name: 'FELICIANO DE SOUZA BRITO',
            email: 'felicianods21@gmail.com',
            password: 'Casa@21@21.', // Será hasheado automaticamente
            isSuperAdmin: true
        });

        await admin.save();

        console.log('✅ Administrador padrão criado via setup!');

        res.json({
            success: true,
            message: '✅ Administrador criado com sucesso!',
            admin: {
                name: admin.name,
                email: admin.email,
                isSuperAdmin: admin.isSuperAdmin
            },
            nextStep: 'Agora você pode fazer login normalmente!'
        });

    } catch (error) {
        console.error('❌ Erro ao criar admin:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao criar administrador',
            details: error.message
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

// Desconectar dispositivo (marcar como inativo)
router.delete('/users/:userId/devices/:deviceId', checkAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // ✅ ENCONTRAR E DESATIVAR o dispositivo (NÃO deletar)
        const device = user.devices.find(d => d._id.toString() === req.params.deviceId);
        
        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Dispositivo não encontrado'
            });
        }

        // Marcar como INATIVO (usuário pode logar novamente se tiver limite)
        device.active = false;
        await user.save();

        console.log(`✅ Dispositivo desconectado: Usuário ${user.email} | Device: ${device.browser} - ${device.os} | IP: ${device.ip}`);
        console.log(`   📱 Dispositivo marcado como inativo. Usuário pode logar novamente se tiver limite disponível.`);

        res.json({
            success: true,
            message: 'Dispositivo desconectado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao desconectar dispositivo:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao desconectar dispositivo'
        });
    }
});

// Alterar limite de dispositivos de um usuário específico
router.put('/users/:userId/device-limit', checkAdmin, async (req, res) => {
    try {
        const { maxDevices } = req.body;
        const user = await User.findById(req.params.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Validar
        if (maxDevices !== undefined) {
            // null = usar limite global
            if (maxDevices === null) {
                user.maxDevices = null;
                await user.save();
                console.log(`⚙️ Usuário ${user.email} agora usa limite global (por ${req.admin.email})`);
            } else {
                const maxDevicesNum = parseInt(maxDevices);
                if (isNaN(maxDevicesNum) || maxDevicesNum < 1 || maxDevicesNum > 10) {
                    return res.status(400).json({
                        success: false,
                        error: 'Limite de dispositivos deve ser entre 1 e 10, ou null para usar o limite global'
                    });
                }
                
                user.maxDevices = maxDevicesNum;
                await user.save();
                
                console.log(`⚙️ Limite de dispositivos alterado para usuário ${user.email}: ${maxDevicesNum} (por ${req.admin.email})`);
            }
        }

        res.json({
            success: true,
            message: 'Limite de dispositivos atualizado com sucesso!',
            maxDevices: user.maxDevices
        });
    } catch (error) {
        console.error('Erro ao atualizar limite de dispositivos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar limite de dispositivos'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETAR USUÁRIO
// ═══════════════════════════════════════════════════════════════════════════════

router.delete('/users/:id', checkAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        console.log(`✅ Usuário deletado: ${user.email} (${user.name})`);

        res.json({
            success: true,
            message: 'Usuário deletado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao deletar usuário'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÕES GLOBAIS DO SISTEMA
// ═══════════════════════════════════════════════════════════════════════════════

// Buscar configurações
router.get('/settings', checkAdmin, async (req, res) => {
    try {
        const Settings = require('../models/Settings');
        
        const maxDevices = await Settings.get('maxDevices', 2);
        
        res.json({
            success: true,
            settings: {
                maxDevices: maxDevices
            }
        });
    } catch (error) {
        console.error('Erro ao buscar configurações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar configurações'
        });
    }
});

// Atualizar configurações
router.put('/settings', checkAdmin, async (req, res) => {
    try {
        const { maxDevices } = req.body;
        const Settings = require('../models/Settings');
        
        // Validar
        if (maxDevices !== undefined) {
            const maxDevicesNum = parseInt(maxDevices);
            if (isNaN(maxDevicesNum) || maxDevicesNum < 1 || maxDevicesNum > 10) {
                return res.status(400).json({
                    success: false,
                    error: 'Limite de dispositivos deve ser entre 1 e 10'
                });
            }
            
            await Settings.set('maxDevices', maxDevicesNum, req.admin.email);
            console.log(`⚙️ Configuração atualizada: maxDevices = ${maxDevicesNum} (por ${req.admin.email})`);
        }
        
        res.json({
            success: true,
            message: 'Configurações atualizadas com sucesso!'
        });
    } catch (error) {
        console.error('Erro ao atualizar configurações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar configurações'
        });
    }
});

module.exports = router;
