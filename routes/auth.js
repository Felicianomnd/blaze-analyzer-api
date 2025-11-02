// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DE AUTENTICAÇÃO COM MONGODB E CONTROLE DE DISPOSITIVOS
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const ActivationCode = require('../models/ActivationCode');
const Plan = require('../models/Plan');

// Função para gerar fingerprint do dispositivo
function generateDeviceFingerprint(userAgent, ip) {
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

        // Verificar se email já existe
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Este email já está cadastrado'
            });
        }

        // Criar novo usuário com status PENDING
        const newUser = new User({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password, // Será hasheado automaticamente pelo pre-save hook
            selectedPlan,
            status: 'pending'
        });

        await newUser.save();

        console.log(`✅ Novo usuário registrado: ${email} - Aguardando código`);

        // TODO: Enviar notificação via Telegram
        // sendTelegramNotification(...);

        res.status(201).json({
            success: true,
            message: 'Cadastro realizado! Aguarde o código de ativação.',
            userId: newUser._id,
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

        // Buscar usuário
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Verificar se já está ativo
        if (user.status === 'active') {
            return res.status(400).json({
                success: false,
                error: 'Conta já está ativa'
            });
        }

        // Buscar código de ativação
        const code = await ActivationCode.findOne({
            code: activationCode.toUpperCase(),
            userId: user._id,
            usedAt: null
        });

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Código de ativação inválido ou já utilizado'
            });
        }

        // Verificar se código expirou
        if (new Date(code.expiresAt) < new Date()) {
            return res.status(400).json({
                success: false,
                error: 'Código de ativação expirado'
            });
        }

        // Ativar usuário
        user.status = 'active';
        user.activatedAt = new Date();
        user.expiresAt = code.expiresAt;
        
        // 🔥 REGISTRAR DISPOSITIVO NA ATIVAÇÃO
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress || 
                   'unknown';
        
        const deviceFingerprint = generateDeviceFingerprint(userAgent, ip);
        const deviceInfo = parseUserAgent(userAgent);
        
        // Verificar se dispositivo já existe
        const existingDevice = user.devices.find(d => d.fingerprint === deviceFingerprint);
        
        if (!existingDevice) {
            // Adicionar primeiro dispositivo na ativação
            user.devices.push({
                fingerprint: deviceFingerprint,
                browser: deviceInfo.browser,
                os: deviceInfo.os,
                ip: ip,
                active: true,
                firstAccess: new Date(),
                lastAccess: new Date()
            });
            console.log(`📱 Primeiro dispositivo registrado: ${deviceInfo.browser} (${deviceInfo.os})`);
        }
        
        await user.save();

        // Marcar código como usado
        code.usedAt = new Date();
        await code.save();

        // Gerar token JWT com deviceFingerprint
        const token = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                name: user.name,
                deviceFingerprint
            },
            process.env.JWT_SECRET || 'seu-secret-key-aqui',
            { expiresIn: '30d' }
        );

        console.log(`✅ Conta ativada: ${email} | Dispositivo: ${deviceInfo.browser} - ${deviceInfo.os}`);

        res.json({
            success: true,
            message: 'Conta ativada com sucesso!',
            token,
            user: {
                ...user.toJSON(),
                devicesCount: user.devices.filter(d => d.active).length
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

        // Buscar usuário
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Email ou senha incorretos'
            });
        }

        // Verificar senha
        const isValidPassword = await user.comparePassword(password);
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
                user.status = 'expired';
                await user.save();

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

        // Verificar se o dispositivo já existe
        const existingDevice = user.devices.find(d => d.fingerprint === deviceFingerprint);

        if (existingDevice) {
            // Dispositivo já cadastrado - atualizar último acesso
            existingDevice.lastAccess = new Date();
            existingDevice.ip = ip;
        } else {
            // Novo dispositivo
            const activeDevices = user.devices.filter(d => d.active);

            // 🔧 BUSCAR LIMITE DE DISPOSITIVOS CONFIGURADO PELO ADMIN
            const Settings = require('../models/Settings');
            const maxDevices = await Settings.get('maxDevices', 2); // Padrão: 2 dispositivos

            if (activeDevices.length >= maxDevices) {
                // ⚠️ LIMITE DE DISPOSITIVOS ATINGIDO!
                console.log(`⚠️ ALERTA: Usuário ${email} tentou logar em mais de ${maxDevices} dispositivos!`);

                return res.status(403).json({
                    success: false,
                    error: `🚫 LIMITE DE DISPOSITIVOS ATINGIDO!\n\nSua conta já está ativa em ${maxDevices} dispositivo${maxDevices > 1 ? 's' : ''}. Por razões de segurança e conforme nossos Termos de Uso, cada conta pode estar ativa em no máximo ${maxDevices} dispositivo${maxDevices > 1 ? 's' : ''} simultaneamente.\n\nPara continuar, remova um dispositivo existente ou entre em contato com o suporte.`,
                    deviceLimitReached: true,
                    activeDevices: activeDevices.length,
                    maxDevices: maxDevices
                });
            }

            // Adicionar novo dispositivo
            user.devices.push({
                fingerprint: deviceFingerprint,
                browser: deviceInfo.browser,
                os: deviceInfo.os,
                ip: ip,
                active: true
            });
        }

        // Salvar alterações
        await user.save();

        // Gerar token JWT
        const token = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                name: user.name,
                deviceFingerprint
            },
            process.env.JWT_SECRET || 'seu-secret-key-aqui',
            { expiresIn: '30d' }
        );

        const activeDevicesCount = user.devices.filter(d => d.active).length;
        const Settings = require('../models/Settings');
        const maxDevices = await Settings.get('maxDevices', 2);
        console.log(`✅ Login bem-sucedido: ${email} | Dispositivos ativos: ${activeDevicesCount}/${maxDevices}`);

        res.json({
            success: true,
            token,
            user: {
                ...user.toJSON(),
                devicesCount: activeDevicesCount
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
// VERIFICAR TOKEN
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/verify', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);

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
            user: user.toJSON()
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
// BUSCAR INFORMAÇÕES DO PLANO
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/plan-info/:duration', async (req, res) => {
    try {
        const plan = await Plan.findOne({ duration: req.params.duration });

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
