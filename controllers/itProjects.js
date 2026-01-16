const ITProject = require('../models/ITProject');

exports.listProjects = async (req, res) => {
  try {
    const projects = await ITProject.find({ department: 'IT' })
      .populate('team', 'fullName email')
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: projects });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createProject = async (req, res) => {
  try {
    const payload = { ...req.body, department: 'IT', createdBy: req.user.id };
    
    // Handle technologies (string to array)
    if (typeof payload.technologies === 'string') {
      try { 
        payload.technologies = JSON.parse(payload.technologies); 
      } catch (_) { 
        payload.technologies = payload.technologies.split(',').map(s => s.trim()).filter(s => s.length > 0); 
      }
    }
    
    // Handle team (ensure it's an array of ObjectIds)
    if (payload.team) {
      if (typeof payload.team === 'string') {
        try {
          payload.team = JSON.parse(payload.team);
        } catch (_) {
          payload.team = payload.team.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
      }
      // Ensure team is an array of ObjectIds
      const mongoose = require('mongoose');
      payload.team = payload.team.map(id => {
        if (mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        return id;
      });
    }
    
    // Handle dates
    if (payload.startDate) {
      payload.startDate = new Date(payload.startDate);
    }
    if (payload.endDate) {
      payload.endDate = new Date(payload.endDate);
    }
    
    const project = await ITProject.create(payload);
    const populatedProject = await ITProject.findById(project._id)
      .populate('team', 'fullName email')
      .populate('createdBy', 'fullName email');
    res.status(201).json({ success: true, data: populatedProject });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };
    
    // Handle technologies (string to array)
    if (typeof update.technologies === 'string') {
      try { 
        update.technologies = JSON.parse(update.technologies); 
      } catch (_) { 
        update.technologies = update.technologies.split(',').map(s => s.trim()).filter(s => s.length > 0); 
      }
    }
    
    // Handle team (ensure it's an array of ObjectIds)
    if (update.team) {
      if (typeof update.team === 'string') {
        try {
          update.team = JSON.parse(update.team);
        } catch (_) {
          update.team = update.team.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
      }
      // Ensure team is an array of ObjectIds
      const mongoose = require('mongoose');
      update.team = update.team.map(id => {
        if (mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        return id;
      });
    }
    
    // Handle dates
    if (update.startDate) {
      update.startDate = new Date(update.startDate);
    }
    if (update.endDate) {
      update.endDate = new Date(update.endDate);
    }
    
    const project = await ITProject.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .populate('team', 'fullName email')
      .populate('createdBy', 'fullName email');
    res.status(200).json({ success: true, data: project });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    await ITProject.findByIdAndDelete(id);
    res.status(200).json({ success: true, data: {} });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
