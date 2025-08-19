const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  images: {
    type: [String],
    required: true,
    validate: {
      validator: function(images) {
        return images && images.length > 0;
      },
      message: 'At least one image is required'
    }
  },
  category: {
    type: String,
    required: true,
    enum: ['Medical', 'Residential', 'Commercial']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Project', projectSchema); 