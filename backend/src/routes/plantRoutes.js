const express = require('express');
const Plant = require('../models/Plant');
const { AppError } = require('../middleware/errorHandler');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();

router.use(requireDatabase);

// GET /api/plants
router.get('/', async (req, res, next) => {
  try {
    const plants = await Plant.find({ archived: false }).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: plants });
  } catch (err) {
    next(err);
  }
});

// POST /api/plants
router.post('/', async (req, res, next) => {
  try {
    const { name, species, scientificName, roomOrArea, notes, potMaterial, potSize, toxicityFlag, deviceId } = req.body;
    if (!name || !name.trim()) throw new AppError(400, 'name is required.');
    if (!deviceId || !deviceId.trim()) throw new AppError(400, 'deviceId is required.');

    const plant = await Plant.create({
      name: name.trim(),
      species: species || null,
      scientificName: scientificName || null,
      roomOrArea: roomOrArea || null,
      notes: notes || null,
      potMaterial: potMaterial || null,
      potSize: potSize || null,
      toxicityFlag: toxicityFlag === true,
      deviceId: deviceId.trim()
    });

    res.status(201).json({ success: true, data: plant });
  } catch (err) {
    next(err);
  }
});

// GET /api/plants/:id
router.get('/:id', async (req, res, next) => {
  try {
    const plant = await Plant.findById(req.params.id).lean();
    if (!plant) throw new AppError(404, 'Plant not found.');
    res.json({ success: true, data: plant });
  } catch (err) {
    next(err);
  }
});

// PUT /api/plants/:id
router.put('/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'species', 'scientificName', 'roomOrArea', 'notes', 'potMaterial', 'potSize', 'toxicityFlag', 'deviceId'];
    const update = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    });

    const plant = await Plant.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!plant) throw new AppError(404, 'Plant not found.');
    res.json({ success: true, data: plant });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/plants/:id  (archives rather than hard-delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const plant = await Plant.findByIdAndUpdate(req.params.id, { $set: { archived: true } }, { new: true });
    if (!plant) throw new AppError(404, 'Plant not found.');
    res.json({ success: true, message: 'Plant archived.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
