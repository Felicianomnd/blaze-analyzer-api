// Middleware de autenticação do administrador
const jwt = require('jsonwebtoken');

// Verificar se o usuário é administrador
function checkAdmin(req, res, next) {
    try {
        // Pegar token do header
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'Token não fornecido'
            });
        }

        const token = authHeader.split(' ')[1]; // Bearer TOKEN
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }

        // Verificar token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seu-secret-key-aqui');
        
        // Verificar se é admin
        if (decoded.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Acesso negado - Apenas administradores'
            });
        }

        // Adicionar dados do admin na requisição
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

// Verificar se é super admin (para operações críticas)
function checkSuperAdmin(req, res, next) {
    if (!req.admin || req.admin.role !== 'admin' || !req.admin.isSuperAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado - Apenas super administradores'
        });
    }
    next();
}

module.exports = {
    checkAdmin,
    checkSuperAdmin
};

