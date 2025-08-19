const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['unread', 'read', 'responded'],
    default: 'unread'
  },
  response: {
    type: String,
    trim: true
  },
  respondedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ContactMessage', contactMessageSchema); 