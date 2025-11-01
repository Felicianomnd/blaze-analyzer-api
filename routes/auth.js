const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const validator = require('validator');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/email');

// ========================================
// REGISTRO DE NOVO USUÁRIO
// ========================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        // Validações
        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Email, senha e nome são obrigatórios'
            });
        }
        
        if (!validator.isEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Email inválido'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha deve ter pelo menos 6 caracteres'
            });
        }
        
        // Verificar se usuário já existe
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Este email já está cadastrado'
            });
        }
        
        // Criar novo usuário
        const user = new User({
            email: email.toLowerCase(),
            password,
            name
        });
        
        await user.save();
        
        // Gerar token JWT
        const token = jwt.sign(
            { 
                userId: user._id,
                email: user.email
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        console.log(`✅ Novo usuário cadastrado: ${email}`);
        
        res.status(201).json({
            success: true,
            message: 'Cadastro realizado com sucesso!',
            token,
            user: user.toJSON()
        });
        
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar conta. Tente novamente.'
        });
    }
});

// ========================================
// LOGIN
// ========================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validações
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email e senha são obrigatórios'
            });
        }
        
        // Buscar usuário
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Email ou senha incorretos'
            });
        }
        
        // Verificar se conta está ativa
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Sua conta foi desativada. Entre em contato com o suporte.'
            });
        }
        
        // Verificar senha
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Email ou senha incorretos'
            });
        }
        
        // Atualizar último login
        user.lastLogin = new Date();
        await user.save();
        
        // Gerar token JWT
        const token = jwt.sign(
            { 
                userId: user._id,
                email: user.email
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        console.log(`✅ Login realizado: ${email}`);
        
        res.json({
            success: true,
            message: 'Login realizado com sucesso!',
            token,
            user: user.toJSON()
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao fazer login. Tente novamente.'
        });
    }
});

// ========================================
// VERIFICAR TOKEN
// ========================================
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token não fornecido'
            });
        }
        
        // Verificar token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Buscar usuário
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Token inválido ou conta desativada'
            });
        }
        
        res.json({
            success: true,
            user: user.toJSON()
        });
        
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        res.status(401).json({
            success: false,
            message: 'Token inválido ou expirado'
        });
    }
});

// ========================================
// ESQUECI MINHA SENHA (Gerar token)
// ========================================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email é obrigatório'
            });
        }
        
        // Buscar usuário
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Não revelar se email existe (segurança)
            return res.json({
                success: true,
                message: 'Se o email existir, você receberá um link de recuperação.'
            });
        }
        
        // Gerar token de recuperação
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpires = Date.now() + 3600000; // 1 hora
        
        user.resetToken = resetToken;
        user.resetTokenExpires = resetTokenExpires;
        await user.save();
        
        // Enviar email (se configurado)
        try {
            await sendPasswordResetEmail(user.email, resetToken);
            console.log(`📧 Email de recuperação enviado para: ${email}`);
        } catch (emailError) {
            console.error('Erro ao enviar email:', emailError);
            // Não falhar a requisição se email falhar
        }
        
        res.json({
            success: true,
            message: 'Se o email existir, você receberá um link de recuperação.',
            // Em desenvolvimento, retornar token (REMOVER EM PRODUÇÃO)
            ...(process.env.NODE_ENV !== 'production' && { resetToken })
        });
        
    } catch (error) {
        console.error('Erro em forgot-password:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar solicitação. Tente novamente.'
        });
    }
});

// ========================================
// RESETAR SENHA (Com token)
// ========================================
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Token e nova senha são obrigatórios'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha deve ter pelo menos 6 caracteres'
            });
        }
        
        // Buscar usuário com token válido
        const user = await User.findOne({
            resetToken: token,
            resetTokenExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Token inválido ou expirado'
            });
        }
        
        // Atualizar senha
        user.password = newPassword;
        user.resetToken = null;
        user.resetTokenExpires = null;
        await user.save();
        
        console.log(`✅ Senha redefinida para: ${user.email}`);
        
        res.json({
            success: true,
            message: 'Senha redefinida com sucesso!'
        });
        
    } catch (error) {
        console.error('Erro em reset-password:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao redefinir senha. Tente novamente.'
        });
    }
});

module.exports = router;

