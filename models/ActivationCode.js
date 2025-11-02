const mongoose = require('mongoose');

const activationCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        minlength: 6,
        maxlength: 6
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    planDuration: {
        type: String,
        required: true,
        enum: ['1month', '3months']
    },
    planDays: {
        type: Number,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    usedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

// Índice para busca rápida por código
activationCodeSchema.index({ code: 1 });
activationCodeSchema.index({ userId: 1 });

module.exports = mongoose.model('ActivationCode', activationCodeSchema);

