import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Event from '../src/models/event.js';
import Registration from '../src/models/registration.js';

dotenv.config();

const MONGO = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/volunteerhub';

async function backfill() {
    console.log('Connecting to', MONGO);
    await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        const events = await Event.find({}, '_id').lean();
        for (const ev of events) {
            const count = await Registration.countDocuments({ event: ev._id, status: { $in: ['approved', 'completed'] } });
            await Event.findByIdAndUpdate(ev._id, { $set: { approvedParticipantsCount: count } });
            console.log(`Event ${ev._id}: set approvedParticipantsCount=${count}`);
        }
        console.log('Backfill completed');
    } catch (err) {
        console.error('Backfill error', err);
    } finally {
        await mongoose.disconnect();
    }
}

backfill().catch((err) => {
    console.error(err);
    process.exit(1);
});
