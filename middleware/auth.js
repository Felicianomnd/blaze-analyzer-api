const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para proteger rotas
async function authenticateToken(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Acesso negado. Token não fornecido.'
            });
        }
        
        // Verificar token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Buscar usuário
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Token inválido. Usuário não encontrado.'
            });
        }
        
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Conta desativada.'
            });
        }
        
        // Adicionar usuário ao request
        req.user = user;
        next();
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token inválido.'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expirado. Faça login novamente.'
            });
        }
        
        console.error('Erro na autenticação:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao autenticar.'
        });
    }
}

module.exports = { authenticateToken };

