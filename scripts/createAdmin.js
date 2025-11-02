// Script para criar administrador inicial
// Rode este script uma vez para criar seu usuário admin

const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const DB_FILE = path.join(__dirname, '../database.json');

// Interface para input do usuário
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function readDB() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Erro ao ler banco:', error.message);
        console.log('📝 Criando banco de dados inicial...');
        
        // Criar estrutura inicial
        const initialDB = {
            giros: [],
            padroes: [],
            users: [],
            admins: [],
            plans: [
                {
                    id: 1,
                    duration: '1month',
                    name: 'Plano 1 Mês',
                    price: 29.90,
                    days: 30,
                    description: 'Acesso por 30 dias',
                    active: true,
                    createdAt: new Date().toISOString()
                },
                {
                    id: 2,
                    duration: '3months',
                    name: 'Plano 3 Meses',
                    price: 79.90,
                    days: 90,
                    description: 'Acesso por 90 dias',
                    active: true,
                    createdAt: new Date().toISOString()
                }
            ],
            activationCodes: [],
            settings: {
                payment: {
                    pixKey: '',
                    pixType: 'email',
                    whatsapp: '',
                    supportEmail: ''
                }
            },
            metadata: {
                version: '3.0',
                created_at: new Date().toISOString(),
                lastUpdate: new Date().toISOString(),
                totalGiros: 0,
                totalPadroes: 0
            }
        };
        
        await fs.writeFile(DB_FILE, JSON.stringify(initialDB, null, 2));
        return initialDB;
    }
}

async function saveDB(data) {
    try {
        await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar banco:', error.message);
        return false;
    }
}

async function createAdmin() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔐 CRIAR ADMINISTRADOR - BLAZE ANALYZER');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    try {
        // Ler banco de dados
        const db = await readDB();
        
        if (!db.admins) {
            db.admins = [];
        }
        
        // Verificar se já existe admin
        if (db.admins.length > 0) {
            console.log('⚠️  Já existe(m) administrador(es) cadastrado(s):');
            db.admins.forEach((admin, index) => {
                console.log(`   ${index + 1}. ${admin.name} (${admin.email})`);
            });
            console.log('');
            
            const confirm = await question('❓ Deseja adicionar outro administrador? (s/N): ');
            if (confirm.toLowerCase() !== 's' && confirm.toLowerCase() !== 'sim') {
                console.log('❌ Operação cancelada.');
                rl.close();
                return;
            }
            console.log('');
        }
        
        // Coletar dados do novo admin
        const name = await question('📝 Nome do administrador: ');
        if (!name || name.trim() === '') {
            console.log('❌ Nome é obrigatório.');
            rl.close();
            return;
        }
        
        const email = await question('📧 Email: ');
        if (!email || !email.includes('@')) {
            console.log('❌ Email inválido.');
            rl.close();
            return;
        }
        
        // Verificar se email já existe
        if (db.admins.some(a => a.email === email)) {
            console.log('❌ Este email já está cadastrado.');
            rl.close();
            return;
        }
        
        const password = await question('🔑 Senha: ');
        if (!password || password.length < 6) {
            console.log('❌ Senha deve ter no mínimo 6 caracteres.');
            rl.close();
            return;
        }
        
        console.log('\n⏳ Criando administrador...\n');
        
        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Criar novo admin
        const newAdmin = {
            id: db.admins.length + 1,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            isSuperAdmin: db.admins.length === 0, // Primeiro admin é super admin
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Adicionar ao banco
        db.admins.push(newAdmin);
        
        // Salvar
        const saved = await saveDB(db);
        
        if (saved) {
            console.log('═══════════════════════════════════════════════════════════');
            console.log('✅ ADMINISTRADOR CRIADO COM SUCESSO!');
            console.log('═══════════════════════════════════════════════════════════');
            console.log(`📝 Nome: ${newAdmin.name}`);
            console.log(`📧 Email: ${newAdmin.email}`);
            console.log(`🔐 Super Admin: ${newAdmin.isSuperAdmin ? 'Sim' : 'Não'}`);
            console.log(`📅 Criado em: ${new Date(newAdmin.createdAt).toLocaleString('pt-BR')}`);
            console.log('═══════════════════════════════════════════════════════════');
            console.log('\n🎉 Agora você pode fazer login no painel admin!');
            console.log('🌐 Acesse: https://seu-painel-admin.netlify.app/login.html\n');
        } else {
            console.log('❌ Erro ao salvar administrador.');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        rl.close();
    }
}

// Executar
createAdmin();

