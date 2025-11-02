// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DE AUTENTICAÇÃO COM SISTEMA DE CÓDIGOS DE ATIVAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
            padroes: [],
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

// Middleware de autenticação
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token não fornecido'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seu-secret-key-aqui');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Token inválido ou expirado'
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASSO 1: REGISTRO INICIAL (SEM CÓDIGO)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/register', async (req, res) => {
    try {
        const { name, email, password, selectedPlan } = req.body;

        // Validações
        if (!name || !email || !password || !selectedPlan) {
            return res.status(400).json({
                success: false,
                error: 'Todos os campos são obrigatórios'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'A senha deve ter no mínimo 6 caracteres'
            });
        }

        if (!['1month', '3months'].includes(selectedPlan)) {
            return res.status(400).json({
                success: false,
                error: 'Plano inválido'
            });
        }

        const db = await readDB();

        // Verificar se email já existe
        const existingUser = db.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Este email já está cadastrado'
            });
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Criar novo usuário com status PENDING
        const newUser = {
            id: (db.users?.length || 0) + 1,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            selectedPlan,
            status: 'pending', // Aguardando código de ativação
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: null,
            activatedAt: null
        };

        // Adicionar ao banco
        if (!db.users) db.users = [];
        db.users.push(newUser);

        await saveDB(db);

        console.log(`✅ Novo usuário registrado: ${email} - Aguardando código`);

        // TODO: Enviar notificação via Telegram para admin
        // sendTelegramNotification(`🆕 Novo cadastro!\nNome: ${name}\nEmail: ${email}\nPlano: ${selectedPlan === '1month' ? '1 Mês' : '3 Meses'}`);

        res.status(201).json({
            success: true,
            message: 'Cadastro realizado! Aguarde o código de ativação.',
            userId: newUser.id,
            requiresActivation: true
        });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao criar cadastro'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASSO 2: ATIVAR CONTA COM CÓDIGO DE 6 DÍGITOS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/activate', async (req, res) => {
    try {
        const { email, activationCode } = req.body;

        if (!email || !activationCode) {
            return res.status(400).json({
                success: false,
                error: 'Email e código de ativação são obrigatórios'
            });
        }

        const db = await readDB();

        // Buscar usuário
        const userIndex = db.users?.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        const user = db.users[userIndex];

        // Verificar se já está ativo
        if (user.status === 'active') {
            return res.status(400).json({
                success: false,
                error: 'Conta já está ativa'
            });
        }

        // Buscar código de ativação
        const codeIndex = db.activationCodes?.findIndex(c => 
            c.code === activationCode.toUpperCase() &&
            c.userId === user.id &&
            !c.usedAt
        );

        if (codeIndex === -1) {
            return res.status(400).json({
                success: false,
                error: 'Código de ativação inválido ou já utilizado'
            });
        }

        const code = db.activationCodes[codeIndex];

        // Verificar se código expirou
        if (new Date(code.expiresAt) < new Date()) {
            return res.status(400).json({
                success: false,
                error: 'Código de ativação expirado'
            });
        }

        // Ativar usuário
        db.users[userIndex].status = 'active';
        db.users[userIndex].activatedAt = new Date().toISOString();
        db.users[userIndex].expiresAt = code.expiresAt;
        db.users[userIndex].updatedAt = new Date().toISOString();

        // Marcar código como usado
        db.activationCodes[codeIndex].usedAt = new Date().toISOString();

        await saveDB(db);

        // Gerar token JWT
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                name: user.name
            },
            process.env.JWT_SECRET || 'seu-secret-key-aqui',
            { expiresIn: '30d' }
        );

        console.log(`✅ Conta ativada: ${email}`);

        res.json({
            success: true,
            message: 'Conta ativada com sucesso!',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                status: 'active',
                expiresAt: code.expiresAt
            }
        });

    } catch (error) {
        console.error('Erro na ativação:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao ativar conta'
        });
    }
});

// Função para gerar fingerprint do dispositivo
function generateDeviceFingerprint(userAgent, ip) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(userAgent + ip);
    return hash.digest('hex').substring(0, 16);
}

// Função para extrair informações do User Agent
function parseUserAgent(userAgent) {
    const ua = userAgent || '';
    let browser = 'Desconhecido';
    let os = 'Desconhecido';
    
    // Detectar navegador
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    else if (ua.includes('Opera')) browser = 'Opera';
    
    // Detectar sistema operacional
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    
    return { browser, os };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN COM CONTROLE DE DISPOSITIVOS
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

        // Buscar usuário
        const userIndex = db.users?.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
        if (userIndex === -1) {
            return res.status(401).json({
                success: false,
                error: 'Email ou senha incorretos'
            });
        }

        const user = db.users[userIndex];

        // Verificar senha
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: 'Email ou senha incorretos'
            });
        }

        // Verificar status da conta
        if (user.status === 'pending') {
            return res.status(403).json({
                success: false,
                error: 'Conta aguardando ativação. Insira o código recebido.',
                requiresActivation: true
            });
        }

        if (user.status === 'blocked') {
            return res.status(403).json({
                success: false,
                error: 'Conta bloqueada por violação dos termos de uso. Entre em contato com o suporte.',
                blocked: true
            });
        }

        // Verificar se expirou
        if (user.status === 'active' && user.expiresAt) {
            if (new Date(user.expiresAt) < new Date()) {
                db.users[userIndex].status = 'expired';
                await saveDB(db);

                return res.status(403).json({
                    success: false,
                    error: 'Sua assinatura expirou. Renove para continuar.',
                    expired: true
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CONTROLE DE DISPOSITIVOS (MÁXIMO 2)
        // ═══════════════════════════════════════════════════════════════════════════════

        const userAgent = req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
        const deviceFingerprint = generateDeviceFingerprint(userAgent, ip);
        const deviceInfo = parseUserAgent(userAgent);

        // Inicializar array de dispositivos se não existir
        if (!db.users[userIndex].devices) {
            db.users[userIndex].devices = [];
        }

        // Verificar se o dispositivo já existe
        const existingDeviceIndex = db.users[userIndex].devices.findIndex(d => d.fingerprint === deviceFingerprint);

        if (existingDeviceIndex !== -1) {
            // Dispositivo já cadastrado - atualizar último acesso
            db.users[userIndex].devices[existingDeviceIndex].lastAccess = new Date().toISOString();
            db.users[userIndex].devices[existingDeviceIndex].ip = ip;
        } else {
            // Novo dispositivo
            const activeDevices = db.users[userIndex].devices.filter(d => d.active);

            if (activeDevices.length >= 2) {
                // ⚠️ LIMITE DE DISPOSITIVOS ATINGIDO!
                console.log(`⚠️ ALERTA: Usuário ${email} tentou logar em mais de 2 dispositivos!`);

                return res.status(403).json({
                    success: false,
                    error: '🚫 LIMITE DE DISPOSITIVOS ATINGIDO!\n\nSua conta já está ativa em 2 dispositivos. Por razões de segurança e conforme nossos Termos de Uso, cada conta pode estar ativa em no máximo 2 dispositivos simultaneamente.\n\nPara continuar, remova um dispositivo existente ou entre em contato com o suporte.',
                    deviceLimitReached: true,
                    activeDevices: activeDevices.length
                });
            }

            // Adicionar novo dispositivo
            const newDevice = {
                id: Date.now(),
                fingerprint: deviceFingerprint,
                browser: deviceInfo.browser,
                os: deviceInfo.os,
                ip: ip,
                firstAccess: new Date().toISOString(),
                lastAccess: new Date().toISOString(),
                active: true
            };

            db.users[userIndex].devices.push(newDevice);
        }

        // Salvar alterações
        await saveDB(db);

        // Gerar token JWT
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                name: user.name,
                deviceFingerprint
            },
            process.env.JWT_SECRET || 'seu-secret-key-aqui',
            { expiresIn: '30d' }
        );

        console.log(`✅ Login bem-sucedido: ${email} | Dispositivos ativos: ${db.users[userIndex].devices.filter(d => d.active).length}/2`);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                status: user.status,
                expiresAt: user.expiresAt,
                selectedPlan: user.selectedPlan,
                devicesCount: db.users[userIndex].devices.filter(d => d.active).length
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao fazer login'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICAR TOKEN (MIDDLEWARE DE AUTENTICAÇÃO)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/verify', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const user = db.users?.find(u => u.id === req.user.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Verificar se expirou
        if (user.status === 'active' && user.expiresAt) {
            if (new Date(user.expiresAt) < new Date()) {
                return res.status(403).json({
                    success: false,
                    error: 'Assinatura expirada',
                    expired: true
                });
            }
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                status: user.status,
                expiresAt: user.expiresAt,
                selectedPlan: user.selectedPlan
            }
        });

    } catch (error) {
        console.error('Erro na verificação:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao verificar token'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUSCAR INFORMAÇÕES DO PLANO SELECIONADO
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/plan-info/:duration', async (req, res) => {
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
            error: 'Erro ao buscar informações do plano'
        });
    }
});

module.exports = router;
