const express = require('express');
const {
	createReadingHandler,
	getLatestReadingHandler,
	listReadingsHandler,
	deleteReadingsHandler
} = require('../controllers/readingController');

const router = express.Router();

router.get('/', listReadingsHandler);
router.post('/', createReadingHandler);
router.delete('/', deleteReadingsHandler);
router.get('/latest', getLatestReadingHandler);

module.exports = router;
