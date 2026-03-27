const express = require('express');
const UserProfile = require('../models/UserProfile');
const { AppError } = require('../middleware/errorHandler');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();

router.use(requireDatabase);

async function getOrCreateProfile() {
  let profile = await UserProfile.findOne().lean();
  if (!profile) {
    profile = await UserProfile.create({});
  }
  return profile;
}

// GET /api/profile
router.get('/', async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile();
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

// PUT /api/profile
router.put('/', async (req, res, next) => {
  try {
    const allowed = ['experienceLevel', 'environmentType', 'notificationPreference', 'onboardingComplete'];
    const update = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    });

    let profile = await UserProfile.findOne();
    if (!profile) {
      profile = await UserProfile.create(update);
    } else {
      Object.assign(profile, update);
      await profile.save();
    }

    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

// POST /api/profile/onboarding — complete onboarding in one call
router.post('/onboarding', async (req, res, next) => {
  try {
    const { experienceLevel, environmentType, notificationPreference } = req.body;

    const VALID_LEVELS = ['beginner', 'intermediate', 'expert'];
    const VALID_ENVS = ['indoor', 'outdoor', 'greenhouse'];
    const VALID_NOTIFS = ['morning', 'evening', 'urgent_only'];

    const update = { onboardingComplete: true };

    if (experienceLevel) {
      if (!VALID_LEVELS.includes(experienceLevel)) {
        throw new AppError(400, `experienceLevel must be one of: ${VALID_LEVELS.join(', ')}`);
      }
      update.experienceLevel = experienceLevel;
    }

    if (environmentType) {
      if (!VALID_ENVS.includes(environmentType)) {
        throw new AppError(400, `environmentType must be one of: ${VALID_ENVS.join(', ')}`);
      }
      update.environmentType = environmentType;
    }

    if (notificationPreference) {
      if (!VALID_NOTIFS.includes(notificationPreference)) {
        throw new AppError(400, `notificationPreference must be one of: ${VALID_NOTIFS.join(', ')}`);
      }
      update.notificationPreference = notificationPreference;
    }

    let profile = await UserProfile.findOne();
    if (!profile) {
      profile = await UserProfile.create(update);
    } else {
      Object.assign(profile, update);
      await profile.save();
    }

    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
