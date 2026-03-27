const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const express = require('express');
const multer = require('multer');

const router = express.Router();

const APP_MEDIA_ROOT = process.env.APP_MEDIA_ROOT
  ? path.resolve(process.env.APP_MEDIA_ROOT)
  : path.resolve(__dirname, '../../app-media');

const CATEGORY_DEFINITIONS = {
  daily_tracking: {
    label: 'Daily tracking',
    folderName: 'daily-tracking',
    allowedMediaTypes: new Set(['image', 'video'])
  },
  leaf_damage: {
    label: 'Leaf damage',
    folderName: 'leaf-damage',
    allowedMediaTypes: new Set(['image'])
  },
  insect_detection: {
    label: 'Insect detection',
    folderName: 'insect-detection-videos',
    allowedMediaTypes: new Set(['video'])
  }
};

const CATEGORY_ALIASES = {
  all: 'all',
  daily: 'daily_tracking',
  growth: 'daily_tracking',
  daily_tracking: 'daily_tracking',
  'daily-tracking': 'daily_tracking',
  leaf: 'leaf_damage',
  leaf_damage: 'leaf_damage',
  'leaf-damage': 'leaf_damage',
  insect: 'insect_detection',
  insect_video: 'insect_detection',
  insect_videos: 'insect_detection',
  insect_detection: 'insect_detection',
  'insect-detection': 'insect_detection'
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.webm', '.m4v']);
const DEFAULT_CATEGORY = 'daily_tracking';

const MIME_EXTENSION_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv'
};

function normalizeMediaType(rawMediaType) {
  if (typeof rawMediaType !== 'string' || rawMediaType.trim().length === 0) {
    return null;
  }

  const normalized = rawMediaType.trim().toLowerCase();

  if (normalized === 'image' || normalized === 'video') {
    return normalized;
  }

  throw new Error('mediaType must be either image or video.');
}

function normalizeCategory(rawCategory, { allowAll = false, fallback = DEFAULT_CATEGORY } = {}) {
  if (typeof rawCategory !== 'string' || rawCategory.trim().length === 0) {
    return fallback;
  }

  const normalizedKey = rawCategory.trim().toLowerCase().replace(/\s+/g, '_');
  const category = CATEGORY_ALIASES[normalizedKey] || null;

  if (!category) {
    throw new Error(`Unsupported category: ${rawCategory}`);
  }

  if (category === 'all') {
    if (allowAll) {
      return category;
    }

    throw new Error('Category "all" is not allowed for this endpoint.');
  }

  return category;
}

function getCategoryDirectory(category) {
  const definition = CATEGORY_DEFINITIONS[category];

  if (!definition) {
    throw new Error(`Unknown category: ${category}`);
  }

  return path.join(APP_MEDIA_ROOT, definition.folderName);
}

function getMediaTypeFromFilename(filename) {
  const extension = path.extname(filename || '').toLowerCase();

  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }

  return null;
}

function getMediaTypeFromMime(mimeType) {
  const value = String(mimeType || '').toLowerCase();

  if (value.startsWith('image/')) {
    return 'image';
  }

  if (value.startsWith('video/')) {
    return 'video';
  }

  return null;
}

function getMediaType(filename, mimeType) {
  return getMediaTypeFromMime(mimeType) || getMediaTypeFromFilename(filename);
}

function sanitizeStem(value) {
  const stem = String(value || 'capture')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);

  return stem || 'capture';
}

function resolveSafeExtension(originalName, mimeType) {
  const rawExtension = path.extname(String(originalName || '')).toLowerCase();
  const hasSafeExtension = /^\.[a-z0-9]{1,10}$/.test(rawExtension);

  if (hasSafeExtension && (IMAGE_EXTENSIONS.has(rawExtension) || VIDEO_EXTENSIONS.has(rawExtension))) {
    return rawExtension;
  }

  const normalizedMimeType = String(mimeType || '').toLowerCase();
  const fromMime = MIME_EXTENSION_MAP[normalizedMimeType];
  if (fromMime) {
    return fromMime;
  }

  const mediaType = getMediaType(originalName, mimeType);
  return mediaType === 'image' ? '.jpg' : '.mp4';
}

function buildStoredFilename(category, originalName, mimeType) {
  const extension = resolveSafeExtension(originalName, mimeType);
  const stem = sanitizeStem(originalName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomPart = Math.random().toString(36).slice(2, 8);

  return `${category}-${timestamp}-${randomPart}-${stem}${extension}`;
}

async function ensureAllCategoryDirectories() {
  await fsPromises.mkdir(APP_MEDIA_ROOT, { recursive: true });

  await Promise.all(Object.keys(CATEGORY_DEFINITIONS).map((category) => fsPromises.mkdir(getCategoryDirectory(category), { recursive: true })));
}

function buildFileRecord(category, filename, stats) {
  const type = getMediaType(filename);

  return {
    name: filename,
    category,
    categoryLabel: CATEGORY_DEFINITIONS[category].label,
    type,
    size: stats.size,
    mtime: stats.mtime.toISOString(),
    url: `/api/camera-roll/file?category=${encodeURIComponent(category)}&name=${encodeURIComponent(filename)}`
  };
}

async function readCategoryFiles(category, mediaTypeFilter = null) {
  const categoryDir = getCategoryDirectory(category);

  let entries = [];
  try {
    entries = await fsPromises.readdir(categoryDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files = await Promise.all(entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const mediaType = getMediaType(entry.name);
      if (!mediaType) {
        return null;
      }

      if (mediaTypeFilter && mediaType !== mediaTypeFilter) {
        return null;
      }

      const absolutePath = path.join(categoryDir, entry.name);
      const stats = await fsPromises.stat(absolutePath);
      return buildFileRecord(category, entry.name, stats);
    }));

  return files.filter(Boolean);
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    try {
      const category = normalizeCategory(req.query.category || req.body.category, {
        allowAll: false,
        fallback: DEFAULT_CATEGORY
      });

      req.mediaCategory = category;

      const destinationPath = getCategoryDirectory(category);
      fs.mkdirSync(destinationPath, { recursive: true });
      callback(null, destinationPath);
    } catch (error) {
      callback(error);
    }
  },
  filename(req, file, callback) {
    try {
      const category = req.mediaCategory || DEFAULT_CATEGORY;
      const filename = buildStoredFilename(category, file.originalname, file.mimetype);
      callback(null, filename);
    } catch (error) {
      callback(error);
    }
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 750 * 1024 * 1024
  }
});

router.get('/categories', async (req, res, next) => {
  try {
    await ensureAllCategoryDirectories();

    const categories = Object.entries(CATEGORY_DEFINITIONS).map(([key, definition]) => ({
      key,
      label: definition.label,
      folder: getCategoryDirectory(key),
      accepts: Array.from(definition.allowedMediaTypes)
    }));

    return res.json({
      rootFolder: APP_MEDIA_ROOT,
      categories
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    await ensureAllCategoryDirectories();

    const category = normalizeCategory(req.query.category, {
      allowAll: true,
      fallback: 'all'
    });

    const mediaTypeFilter = normalizeMediaType(req.query.mediaType);

    const categoriesToRead = category === 'all'
      ? Object.keys(CATEGORY_DEFINITIONS)
      : [category];

    const bucketedFiles = await Promise.all(categoriesToRead.map((categoryKey) => readCategoryFiles(categoryKey, mediaTypeFilter)));

    const files = bucketedFiles
      .flat()
      .sort((left, right) => new Date(right.mtime).getTime() - new Date(left.mtime).getTime());

    return res.json({
      rootFolder: APP_MEDIA_ROOT,
      folder: category === 'all' ? APP_MEDIA_ROOT : getCategoryDirectory(category),
      category,
      mediaType: mediaTypeFilter || 'all',
      count: files.length,
      files,
      categories: categoriesToRead.map((categoryKey) => ({
        key: categoryKey,
        label: CATEGORY_DEFINITIONS[categoryKey].label,
        folder: getCategoryDirectory(categoryKey)
      }))
    });
  } catch (error) {
    if (error.message && error.message.startsWith('Unsupported category')) {
      return res.status(400).json({ message: error.message });
    }

    if (error.message && error.message.includes('mediaType must be')) {
      return res.status(400).json({ message: error.message });
    }

    return next(error);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    await ensureAllCategoryDirectories();

    if (!req.file) {
      return res.status(400).json({ message: 'A media file is required.' });
    }

    const category = normalizeCategory(req.mediaCategory || req.query.category || req.body.category, {
      allowAll: false,
      fallback: DEFAULT_CATEGORY
    });

    const mediaType = getMediaType(req.file.originalname || req.file.filename, req.file.mimetype);

    if (!mediaType) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: 'Unsupported media type. Upload an image or a video file.' });
    }

    const categoryDefinition = CATEGORY_DEFINITIONS[category];

    if (!categoryDefinition.allowedMediaTypes.has(mediaType)) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        message: `Category ${category} accepts ${Array.from(categoryDefinition.allowedMediaTypes).join(' and ')} files only.`
      });
    }

    const stats = await fsPromises.stat(req.file.path);
    const file = buildFileRecord(category, req.file.filename, stats);

    return res.status(201).json({
      success: true,
      rootFolder: APP_MEDIA_ROOT,
      folder: getCategoryDirectory(category),
      category,
      file
    });
  } catch (error) {
    if (error.message && error.message.startsWith('Unsupported category')) {
      return res.status(400).json({ message: error.message });
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File is too large. Maximum allowed size is 750 MB.' });
    }

    return next(error);
  }
});

router.get('/file', async (req, res, next) => {
  try {
    await ensureAllCategoryDirectories();

    const { name } = req.query;

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'A file name is required.' });
    }

    const safeName = path.basename(name);
    if (safeName !== name) {
      return res.status(400).json({ message: 'Invalid file name.' });
    }

    const mediaType = getMediaType(safeName);
    if (!mediaType) {
      return res.status(400).json({ message: 'Unsupported file type.' });
    }

    const requestedCategory = normalizeCategory(req.query.category, {
      allowAll: true,
      fallback: 'all'
    });

    const searchCategories = requestedCategory === 'all'
      ? Object.keys(CATEGORY_DEFINITIONS)
      : [requestedCategory];

    for (const category of searchCategories) {
      const absolutePath = path.join(getCategoryDirectory(category), safeName);

      try {
        await fsPromises.access(absolutePath);
        return res.sendFile(absolutePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    return res.status(404).json({ message: 'File not found.' });
  } catch (error) {
    if (error.message && error.message.startsWith('Unsupported category')) {
      return res.status(400).json({ message: error.message });
    }

    return next(error);
  }
});

module.exports = router;