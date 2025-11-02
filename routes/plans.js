// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DE PLANOS COM MONGODB
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Plan = require('../models/Plan');
const Settings = require('../models/Settings');

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
        return res.status(401).json({
            success: false,
            error: 'Token inválido ou expirado'
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LISTAR TODOS OS PLANOS (PÚBLICO)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
    try {
        const plans = await Plan.find({ active: true }).sort({ days: 1 }).lean();

        res.json({
            success: true,
            plans
        });
    } catch (error) {
        console.error('Erro ao listar planos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar planos'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUSCAR PLANO POR DURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:duration', async (req, res) => {
    try {
        const plan = await Plan.findOne({ duration: req.params.duration }).lean();

        if (!plan) {
            return res.status(404).json({
                success: false,
                error: 'Plano não encontrado'
            });
        }

        res.json({
            success: true,
            plan
        });
    } catch (error) {
        console.error('Erro ao buscar plano:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar plano'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ATUALIZAR PLANO (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/:duration', checkAdmin, async (req, res) => {
    try {
        const { name, price, description, active, days } = req.body;

        const updateData = {
            updatedBy: req.admin.email
        };

        if (name !== undefined) updateData.name = name;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (description !== undefined) updateData.description = description;
        if (active !== undefined) updateData.active = active;
        if (days !== undefined) updateData.days = parseInt(days);

        const plan = await Plan.findOneAndUpdate(
            { duration: req.params.duration },
            updateData,
            { new: true }
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                error: 'Plano não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Plano atualizado com sucesso',
            plan
        });
    } catch (error) {
        console.error('Erro ao atualizar plano:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar plano'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CRIAR NOVO PLANO (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/', checkAdmin, async (req, res) => {
    try {
        const { name, price, days, description } = req.body;

        // Validar campos obrigatórios
        if (!name || !price || !days) {
            return res.status(400).json({
                success: false,
                error: 'Nome, preço e dias são obrigatórios'
            });
        }

        // Validar valores
        const priceNum = parseFloat(price);
        const daysNum = parseInt(days);

        if (isNaN(priceNum) || priceNum < 0) {
            return res.status(400).json({
                success: false,
                error: 'Preço inválido'
            });
        }

        if (isNaN(daysNum) || daysNum < 1) {
            return res.status(400).json({
                success: false,
                error: 'Dias de acesso inválido'
            });
        }

        // Gerar duration baseado nos dias
        let duration;
        if (daysNum === 30) {
            duration = '1month';
        } else if (daysNum === 90) {
            duration = '3months';
        } else if (daysNum === 180) {
            duration = '6months';
        } else if (daysNum === 365) {
            duration = '1year';
        } else {
            // Para valores customizados, criar um ID único
            duration = `custom_${daysNum}days_${Date.now()}`;
        }

        // Verificar se já existe (apenas para durações padrão)
        if (['1month', '3months', '6months', '1year'].includes(duration)) {
            const existingPlan = await Plan.findOne({ duration });
            if (existingPlan) {
                return res.status(400).json({
                    success: false,
                    error: 'Já existe um plano com esta duração'
                });
            }
        }

        // Criar novo plano
        const newPlan = new Plan({
            duration,
            name,
            price: priceNum,
            days: daysNum,
            description: description || `Acesso por ${daysNum} dias`,
            active: true,
            updatedBy: req.admin.email
        });

        await newPlan.save();

        console.log(`✅ Novo plano criado: ${name} (${daysNum} dias) - R$ ${priceNum} (por ${req.admin.email})`);

        res.json({
            success: true,
            message: 'Plano criado com sucesso',
            plan: newPlan
        });
    } catch (error) {
        console.error('Erro ao criar plano:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao criar plano'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETAR PLANO (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════

router.delete('/:duration', checkAdmin, async (req, res) => {
    try {
        const { duration } = req.params;

        // Proteger planos padrão
        if (duration === '1month' || duration === '3months') {
            return res.status(403).json({
                success: false,
                error: 'Não é possível excluir planos padrão'
            });
        }

        const plan = await Plan.findOneAndDelete({ duration });

        if (!plan) {
            return res.status(404).json({
                success: false,
                error: 'Plano não encontrado'
            });
        }

        console.log(`🗑️ Plano excluído: ${plan.name} (${plan.days} dias) (por ${req.admin.email})`);

        res.json({
            success: true,
            message: 'Plano excluído com sucesso'
        });
    } catch (error) {
        console.error('Erro ao excluir plano:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir plano'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUSCAR CONFIGURAÇÕES DE PAGAMENTO (PÚBLICO)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/payment/settings', async (req, res) => {
    try {
        const payment = await Settings.get('payment', {
            pixKey: '',
            pixType: 'email',
            whatsapp: '',
            supportEmail: ''
        });

        res.json({
            success: true,
            payment
        });

    } catch (error) {
        console.error('Erro ao buscar configurações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar configurações'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ATUALIZAR CONFIGURAÇÕES DE PAGAMENTO (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/payment/settings', checkAdmin, async (req, res) => {
    try {
        const { pixKey, pixType, whatsapp, supportEmail } = req.body;

        // Buscar configuração atual
        const currentPayment = await Settings.get('payment', {});

        // Atualizar campos
        const updatedPayment = {
            ...currentPayment,
            pixKey: pixKey !== undefined ? pixKey : currentPayment.pixKey,
            pixType: pixType !== undefined ? pixType : currentPayment.pixType,
            whatsapp: whatsapp !== undefined ? whatsapp : currentPayment.whatsapp,
            supportEmail: supportEmail !== undefined ? supportEmail : currentPayment.supportEmail
        };

        // Salvar
        await Settings.set('payment', updatedPayment, req.admin.email);

        res.json({
            success: true,
            message: 'Configurações atualizadas com sucesso',
            payment: updatedPayment
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
