// Rotas para gerenciar planos
const express = require('express');
const router = express.Router();
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
            giros: [],
            settings: {}
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

// ═══════════════════════════════════════════════════════════════════════════════
// LISTAR TODOS OS PLANOS (PÚBLICO - para tela de escolha de plano)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
    try {
        const db = await readDB();
        const plans = db.plans || [];

        // Retornar apenas planos ativos
        const activePlans = plans.filter(p => p.active !== false);

        res.json({
            success: true,
            plans: activePlans
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
        const db = await readDB();
        const plan = db.plans?.find(p => p.duration === req.params.duration);

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
        const { name, price, description, active } = req.body;
        const duration = req.params.duration;

        const db = await readDB();
        const planIndex = db.plans?.findIndex(p => p.duration === duration);

        if (planIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Plano não encontrado'
            });
        }

        // Atualizar plano
        if (name !== undefined) db.plans[planIndex].name = name;
        if (price !== undefined) db.plans[planIndex].price = parseFloat(price);
        if (description !== undefined) db.plans[planIndex].description = description;
        if (active !== undefined) db.plans[planIndex].active = active;
        
        db.plans[planIndex].updatedAt = new Date().toISOString();
        db.plans[planIndex].updatedBy = req.admin.email;

        await saveDB(db);

        res.json({
            success: true,
            message: 'Plano atualizado com sucesso',
            plan: db.plans[planIndex]
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
// BUSCAR CONFIGURAÇÕES DE PAGAMENTO (PÚBLICO)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/payment/settings', async (req, res) => {
    try {
        const db = await readDB();
        const settings = db.settings?.payment || {};

        res.json({
            success: true,
            payment: {
                pixKey: settings.pixKey || '',
                pixType: settings.pixType || 'email',
                whatsapp: settings.whatsapp || '',
                supportEmail: settings.supportEmail || ''
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

// ═══════════════════════════════════════════════════════════════════════════════
// ATUALIZAR CONFIGURAÇÕES DE PAGAMENTO (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/payment/settings', checkAdmin, async (req, res) => {
    try {
        const { pixKey, pixType, whatsapp, supportEmail } = req.body;

        const db = await readDB();
        
        if (!db.settings) db.settings = {};
        if (!db.settings.payment) db.settings.payment = {};

        // Atualizar configurações
        if (pixKey !== undefined) db.settings.payment.pixKey = pixKey;
        if (pixType !== undefined) db.settings.payment.pixType = pixType;
        if (whatsapp !== undefined) db.settings.payment.whatsapp = whatsapp;
        if (supportEmail !== undefined) db.settings.payment.supportEmail = supportEmail;
        
        db.settings.payment.updatedAt = new Date().toISOString();
        db.settings.payment.updatedBy = req.admin.email;

        await saveDB(db);

        res.json({
            success: true,
            message: 'Configurações atualizadas com sucesso',
            payment: db.settings.payment
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

