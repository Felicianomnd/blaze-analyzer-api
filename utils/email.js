const nodemailer = require('nodemailer');

// Configurar transporter
let transporter = null;

function initializeTransporter() {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        console.warn('⚠️ Email não configurado. Recuperação de senha não enviará emails.');
        return null;
    }
    
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false, // true para 465, false para outras portas
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

async function sendPasswordResetEmail(email, resetToken) {
    if (!transporter) {
        transporter = initializeTransporter();
    }
    
    if (!transporter) {
        console.warn('⚠️ Transporter não configurado. Token:', resetToken);
        return;
    }
    
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8000'}/reset-password.html?token=${resetToken}`;
    
    const mailOptions = {
        from: `"Blaze Analyzer" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔐 Recuperação de Senha - Blaze Analyzer',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .container {
                        background: #f4f4f4;
                        padding: 30px;
                        border-radius: 10px;
                    }
                    .header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 20px;
                        border-radius: 10px 10px 0 0;
                        text-align: center;
                    }
                    .content {
                        background: white;
                        padding: 30px;
                        border-radius: 0 0 10px 10px;
                    }
                    .button {
                        display: inline-block;
                        padding: 15px 30px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white !important;
                        text-decoration: none;
                        border-radius: 5px;
                        margin: 20px 0;
                        font-weight: bold;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        font-size: 12px;
                        color: #999;
                    }
                    .warning {
                        background: #fff3cd;
                        border-left: 4px solid #ffc107;
                        padding: 15px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Recuperação de Senha</h1>
                    </div>
                    <div class="content">
                        <p>Olá,</p>
                        
                        <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Blaze Analyzer</strong>.</p>
                        
                        <p>Para criar uma nova senha, clique no botão abaixo:</p>
                        
                        <center>
                            <a href="${resetUrl}" class="button">Redefinir Senha</a>
                        </center>
                        
                        <p>Ou copie e cole este link no seu navegador:</p>
                        <p style="background: #f4f4f4; padding: 10px; border-radius: 5px; word-break: break-all;">
                            ${resetUrl}
                        </p>
                        
                        <div class="warning">
                            <strong>⚠️ Atenção:</strong>
                            <ul>
                                <li>Este link expira em <strong>1 hora</strong></li>
                                <li>Se você não solicitou esta alteração, ignore este email</li>
                                <li>Sua senha atual continuará funcionando normalmente</li>
                            </ul>
                        </div>
                        
                        <p>Se tiver alguma dúvida, entre em contato conosco.</p>
                        
                        <p>Atenciosamente,<br>
                        <strong>Equipe Blaze Analyzer</strong></p>
                    </div>
                    <div class="footer">
                        <p>Este é um email automático. Não responda a esta mensagem.</p>
                        <p>&copy; ${new Date().getFullYear()} Blaze Analyzer. Todos os direitos reservados.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email enviado:', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error);
        throw error;
    }
}

module.exports = {
    sendPasswordResetEmail
};

