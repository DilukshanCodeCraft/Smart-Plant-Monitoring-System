require('dotenv').config();
const mongoose = require('mongoose');
const Reading = require('../src/models/Reading');

const MONGODB_URI = process.env.MONGODB_URI;

async function updateRatio() {
    try {
        console.log('Connecting to Database for MQ Ratio fix...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        /* 
           Constraint: MQ Ratio is 1.0 for 100ppm.
           Formula: Ratio = (PPM / 100) ^ (-1 / 2.769)
           For 150 PPM: Ratio = (150/100) ^ (-0.361) = 1.5 ^ -0.361 = 0.864
        */
        
        const updateResult = await Reading.updateMany(
            {}, 
            [
              {
                $set: {
                  mqRatio: 0.86,
                  rounds: {
                    $map: {
                      input: "$rounds",
                      as: "round",
                      in: {
                        $mergeObjects: ["$$round", { mqRatio: 0.86 }]
                      }
                    }
                  }
                }
              }
            ]
        );

        console.log(`✅ Successfully updated MQ Ratio to 0.86 (calibrated for 150ppm) across ${updateResult.modifiedCount} records.`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Update Error:', err);
        process.exit(1);
    }
}

updateRatio();
