# 🚀 Blaze Analyzer API

API REST para armazenamento de histórico de giros e banco de padrões do Blaze Double Analyzer.

## 📦 **Instalação Local**

```bash
cd blaze_api
npm install
npm start
```

Servidor rodará em: `http://localhost:3000`

## 🌐 **Deploy no Render.com**

1. Acesse: https://render.com
2. Faça login (GitHub/Google)
3. Clique em `+ New` → `Web Service`
4. Conecte seu repositório Git
5. Configure:
   - **Nome**: `blaze-analyzer`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
6. Clique em `Deploy Web Service`

**URL da API**: `https://blaze-analyzer.onrender.com`

## 📡 **Endpoints**

### **Giros**

```http
GET  /api/giros              # Retorna últimos 800 giros
GET  /api/giros/latest       # Retorna apenas o último giro
POST /api/giros              # Adiciona novo(s) giro(s)
```

**Exemplo POST:**
```javascript
fetch('https://blaze-analyzer.onrender.com/api/giros', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: "spin_123",
    number: 5,
    color: "red",
    timestamp: "2024-01-15T10:30:00Z",
    created_at: 1705318200000
  })
});
```

### **Padrões**

```http
GET  /api/padroes            # Retorna todos os padrões (4000)
GET  /api/padroes/stats      # Retorna estatísticas do banco
POST /api/padroes            # Adiciona novo(s) padrão(ões)
```

**Exemplo POST:**
```javascript
fetch('https://blaze-analyzer.onrender.com/api/padroes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 123,
    pattern: ["red", "black", "red"],
    expected_next: "black",
    confidence: 82,
    occurrences: 15,
    type: "color-discovery",
    total_wins: 12,
    total_losses: 3
  })
});
```

### **Status**

```http
GET  /api/status             # Status da API e banco de dados
GET  /                       # Healthcheck
```

## 📊 **Estrutura de Dados**

### Giro
```json
{
  "id": "string",
  "number": 0-14,
  "color": "red|black|white",
  "timestamp": "ISO-8601",
  "created_at": 1234567890
}
```

### Padrão
```json
{
  "id": 123,
  "pattern": ["red", "black", "red"],
  "expected_next": "black",
  "confidence": 82,
  "occurrences": 15,
  "found_at": "ISO-8601",
  "type": "color-discovery",
  "total_wins": 12,
  "total_losses": 3,
  "triggerColor": "white"
}
```

## ⚙️ **Limites**

- **Giros**: Máximo 800 (FIFO - primeiro a entrar, primeiro a sair)
- **Padrões**: Máximo 4000 (FIFO)
- **Payload**: Máximo 50MB por requisição

## 🔒 **Segurança**

- CORS habilitado para todos os domínios
- Rate limiting: implementar posteriormente
- Autenticação: implementar posteriormente

## 📝 **Logs**

O servidor exibe logs coloridos no console:
- ✅ Operações bem-sucedidas
- ❌ Erros capturados
- 📊 Estatísticas ao iniciar

## 🐛 **Troubleshooting**

**Servidor hibernando?**
- Render.com hiberna após 15min de inatividade (plano gratuito)
- Primeira requisição pode demorar 30-60s
- Use um serviço de ping (cron-job.org) para manter ativo

**Dados não persistem?**
- Render.com apaga `database.json` a cada deploy
- Solução: Migrar para PostgreSQL (gratuito no Render)

## 📄 **Licença**

MIT License - Use livremente!

