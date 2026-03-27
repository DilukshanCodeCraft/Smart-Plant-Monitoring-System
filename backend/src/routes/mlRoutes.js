const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const router = express.Router();

/**
 * Execute the Python prediction script and return JSON
 */
router.get('/predict', async (req, res) => {
  const scriptPath = path.resolve(__dirname, '../../ml/predict_next_from_model.py');
  const pythonPath = 'python'; // or your preferred python alias

  console.log(`[ML] Executing Prediction: ${pythonPath} ${scriptPath}`);

  exec(`${pythonPath} "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`[ML] Error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }

    try {
      // Find the JSON block in stdout (it might have some python print noise)
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
         throw new Error("No JSON payload in script output");
      }
      const payload = JSON.parse(jsonMatch[0]);
      res.json({ success: true, data: payload });
    } catch (parseError) {
      console.error(`[ML] Parse Error: ${parseError.message}`);
      res.status(500).json({ success: false, error: 'Failed to parse AI output', raw: stdout });
    }
  });
});

/**
 * List available plots in the artifacts directory
 */
router.get('/plots/list', (req, res) => {
  const plotsDir = path.resolve(__dirname, '../../ml/artifacts/plots');
  if (!fs.existsSync(plotsDir)) {
    return res.json({ success: true, plots: [] });
  }

  const files = fs.readdirSync(plotsDir).filter(f => f.endsWith('.png'));
  res.json({ success: true, plots: files });
});

/**
 * Serve a specific plot file
 */
router.get('/plots/:name', (req, res) => {
  const plotName = req.params.name;
  const plotPath = path.resolve(__dirname, '../../ml/artifacts/plots', plotName);

  if (fs.existsSync(plotPath)) {
    res.sendFile(plotPath);
  } else {
    res.status(404).send('Plot not found');
  }
});

module.exports = router;
