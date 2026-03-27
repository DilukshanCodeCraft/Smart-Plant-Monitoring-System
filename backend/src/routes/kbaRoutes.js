const express = require('express');
const { listArticles, getArticle } = require('../services/kbaService');
const { AppError } = require('../middleware/errorHandler');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();

router.use(requireDatabase);

// GET /api/kba/articles?category=plant_care&tag=watering&q=soil
router.get('/articles', async (req, res, next) => {
  try {
    const { category, tag, q } = req.query;
    const articles = await listArticles({ category, tag, q });
    res.json({ success: true, data: articles });
  } catch (err) {
    next(err);
  }
});

// GET /api/kba/articles/:slug
router.get('/articles/:slug', async (req, res, next) => {
  try {
    const article = await getArticle(req.params.slug);
    if (!article) throw new AppError(404, 'Article not found.');
    res.json({ success: true, data: article });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
