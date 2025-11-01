const rateLimit = require('express-rate-limit');

// Rate limiter para rotas de autenticação (login, registro)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 tentativas
    message: {
        success: false,
        message: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter para recuperação de senha
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // 3 tentativas
    message: {
        success: false,
        message: 'Muitas tentativas de recuperação. Aguarde 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter geral para API
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 60, // 60 requisições por minuto
    message: {
        success: false,
        message: 'Muitas requisições. Aguarde um momento.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    authLimiter,
    passwordResetLimiter,
    generalLimiter
};

