const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Método estático para buscar configuração
settingsSchema.statics.get = async function(key, defaultValue = null) {
    const setting = await this.findOne({ key });
    return setting ? setting.value : defaultValue;
};

// Método estático para salvar configuração
settingsSchema.statics.set = async function(key, value, updatedBy = null) {
    return await this.findOneAndUpdate(
        { key },
        { value, updatedBy, updatedAt: Date.now() },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('Settings', settingsSchema);

