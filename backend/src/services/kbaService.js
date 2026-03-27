const KBAArticle = require('../models/KBAArticle');

async function listArticles({ category, tag, q, status = 'published' } = {}) {
  const query = { status };

  if (category) query.category = category;
  if (tag) query.tags = tag;
  if (q) {
    query.$or = [
      { title: { $regex: q, $options: 'i' } },
      { summary: { $regex: q, $options: 'i' } },
      { tags: { $regex: q, $options: 'i' } }
    ];
  }

  return KBAArticle.find(query).select('-content').sort({ title: 1 }).lean();
}

async function getArticle(slug) {
  return KBAArticle.findOne({ slug, status: 'published' }).lean();
}

module.exports = { listArticles, getArticle };
