require('dotenv').config({ path: './backend/.env' });
const mongoose = require('mongoose');
const Reading = require('./backend/src/models/Reading');

const MONGODB_URI = process.env.MONGODB_URI;

async function fastUpdate() {
    try {
        console.log('Connecting for High-Speed Calibration (Fixed Paths)...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to ' + mongoose.connection.name);

        const updateResult = await Reading.updateMany(
            {}, 
            [
              {
                $set: {
                  mqRatio: { 
                    $pow: [ 
                      { $divide: [ { $ifNull: ["$mqPPM", 150] }, 100 ] }, 
                      -0.3611 
                    ] 
                  },
                  rounds: {
                    $map: {
                      input: "$rounds",
                      as: "r",
                      in: {
                        $mergeObjects: [
                          "$$r",
                          { 
                            mqRatio: { 
                              $pow: [ 
                                { $divide: [ { $ifNull: ["$$r.mqPPM", 150] }, 100 ] }, 
                                -0.3611 
                              ] 
                            } 
                          }
                        ]
                      }
                    }
                  }
                }
              }
            ]
        );

        console.log(`✅ Successfully updated MQ Ratios for ${updateResult.modifiedCount} monitoring sessions.`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Update Error:', err);
        process.exit(1);
    }
}

fastUpdate();
