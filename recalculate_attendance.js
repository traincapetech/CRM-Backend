const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');
const Employee = require('./models/Employee');
require('./models/Department');
require('./models/EmployeeRole');
require('./models/User');
require('dotenv').config();

async function recalculateHistory() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB...');

        // Get all attendance records
        const records = await Attendance.find({ checkIn: { $exists: true }, checkOut: { $exists: true } });
        console.log(`Found ${records.length} records to review.`);

        let updatedCount = 0;
        for (const record of records) {
            const oldStatus = record.status;

            // Re-run the save hook to trigger calculateTotalHours
            await record.save();

            if (oldStatus !== record.status) {
                console.log(`Updated record for ${record.employeeId} on ${record.formattedDate}: ${oldStatus} -> ${record.status}`);
                updatedCount++;
            }
        }

        console.log(`Finished recalculating. Corrected ${updatedCount} records.`);
        process.exit(0);
    } catch (error) {
        console.error('Error recalculating history:', error);
        process.exit(1);
    }
}

recalculateHistory();
