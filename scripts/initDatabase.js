// Script para inicializar o banco de dados MongoDB
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Plan = require('../models/Plan');
const Settings = require('../models/Settings');
require('dotenv').config();

async function initDatabase() {
    try {
        // Conectar ao MongoDB
        console.log('📡 Conectando ao MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ MongoDB conectado!');

        // ═══════════════════════════════════════════════════════════════════════════════
        // CRIAR PLANOS PADRÃO
        // ═══════════════════════════════════════════════════════════════════════════════

        console.log('\n📋 Verificando planos...');
        
        const plans = [
            {
                duration: '1month',
                name: 'Plano 1 Mês',
                price: 29.90,
                days: 30,
                description: 'Acesso por 30 dias',
                active: true
            },
            {
                duration: '3months',
                name: 'Plano 3 Meses',
                price: 79.90,
                days: 90,
                description: 'Acesso por 90 dias',
                active: true
            }
        ];

        for (const planData of plans) {
            const existingPlan = await Plan.findOne({ duration: planData.duration });
            if (!existingPlan) {
                await Plan.create(planData);
                console.log(`✅ Plano criado: ${planData.name}`);
            } else {
                console.log(`⏭️  Plano já existe: ${planData.name}`);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CRIAR ADMIN PADRÃO
        // ═══════════════════════════════════════════════════════════════════════════════

        console.log('\n👨‍💼 Verificando administrador...');
        
        const adminCount = await Admin.countDocuments();
        
        if (adminCount === 0) {
            const defaultAdmin = new Admin({
                name: 'FELICIANO DE SOUZA BRITO',
                email: 'felicianods21@gmail.com',
                password: 'Casa@21@21.',
                isSuperAdmin: true
            });
            
            await defaultAdmin.save();
            console.log('✅ Administrador padrão criado!');
            console.log('   Email: felicianods21@gmail.com');
            console.log('   Senha: Casa@21@21.');
        } else {
            console.log(`⏭️  Já existem ${adminCount} administrador(es) cadastrado(s)`);
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CONFIGURAÇÕES INICIAIS
        // ═══════════════════════════════════════════════════════════════════════════════

        console.log('\n⚙️  Configurando settings...');
        
        const defaultSettings = {
            pixKey: '',
            pixType: 'email',
            whatsapp: '',
            supportEmail: ''
        };

        const existingPayment = await Settings.get('payment');
        if (!existingPayment) {
            await Settings.set('payment', defaultSettings);
            console.log('✅ Configurações de pagamento criadas');
        } else {
            console.log('⏭️  Configurações de pagamento já existem');
        }

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('🎉 BANCO DE DADOS INICIALIZADO COM SUCESSO!');
        console.log('═══════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n👋 Conexão fechada');
        process.exit(0);
    }
}

// Executar
initDatabase();

