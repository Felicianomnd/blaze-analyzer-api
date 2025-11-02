const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    duration: {
        type: String,
        required: true,
        unique: true,
        enum: ['1month', '3months']
    },
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    days: {
        type: Number,
        required: true,
        min: 1
    },
    description: {
        type: String,
        default: ''
    },
    active: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
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

module.exports = mongoose.model('Plan', planSchema);

