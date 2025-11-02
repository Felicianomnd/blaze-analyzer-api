const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const deviceSchema = new mongoose.Schema({
    fingerprint: {
        type: String,
        required: true
    },
    browser: {
        type: String,
        default: 'Desconhecido'
    },
    os: {
        type: String,
        default: 'Desconhecido'
    },
    ip: {
        type: String,
        default: 'unknown'
    },
    firstAccess: {
        type: Date,
        default: Date.now
    },
    lastAccess: {
        type: Date,
        default: Date.now
    },
    active: {
        type: Boolean,
        default: true
    }
}, { _id: true });

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    selectedPlan: {
        type: String,
        enum: ['1month', '3months'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'expired', 'blocked'],
        default: 'pending'
    },
    expiresAt: {
        type: Date,
        default: null
    },
    activatedAt: {
        type: Date,
        default: null
    },
    devices: [deviceSchema],
    maxDevices: {
        type: Number,
        default: null // null = usar configuração global
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Hash da senha antes de salvar
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Método para comparar senhas
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Método para retornar dados sem senha
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
