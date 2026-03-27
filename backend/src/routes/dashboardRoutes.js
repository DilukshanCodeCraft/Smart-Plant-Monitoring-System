const express = require('express');
const { getDashboardOverviewHandler } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/overview', getDashboardOverviewHandler);

module.exports = router;
