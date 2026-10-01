import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Interview } from '../src/models/Interview.js';
import mongoose from 'mongoose';

const viewDatabase = async () => {
  await connectDB();

  console.log('\n========================================');
  console.log('       VOICEHIRE AI - DATABASE VIEWER   ');
  console.log('========================================\n');

  // 1. Users
  const users = await User.find({}).sort({ createdAt: -1 });
  console.log(`📌 USERS COLLECTION (${users.length} records):`);
  if (users.length === 0) {
    console.log('  No users found.\n');
  } else {
    console.table(
      users.map((u) => ({
        ID: u._id.toString(),
        Name: u.name,
        Email: u.email,
        Role: u.role,
        LoggedIn: u.isLoggedIn,
        LastActive: u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleTimeString() : 'N/A',
        Created: new Date(u.createdAt).toLocaleDateString()
      }))
    );
  }

  // 2. Interviews
  const interviews = await Interview.find({})
    .populate('candidateId', 'name email')
    .populate('recruiterId', 'name email')
    .sort({ createdAt: -1 });

  console.log(`\n📌 INTERVIEWS COLLECTION (${interviews.length} records):`);
  if (interviews.length === 0) {
    console.log('  No interviews found.\n');
  } else {
    console.table(
      interviews.map((i) => ({
        ID: i._id.toString(),
        Title: i.title,
        Candidate: i.candidateId ? `${i.candidateId.name} (${i.candidateId.email})` : 'N/A',
        Recruiter: i.recruiterId ? `${i.recruiterId.name}` : 'N/A',
        Status: i.status,
        RecruiterReady: i.recruiterReady ? '✓' : '✗',
        CandidateReady: i.candidateReady ? '✓' : '✗',
        ScheduledAt: i.scheduledAt ? new Date(i.scheduledAt).toLocaleString() : 'Draft'
      }))
    );
  }

  console.log('========================================\n');
  await mongoose.disconnect();
  process.exit(0);
};

viewDatabase().catch((err) => {
  console.error('Error viewing database:', err.message);
  process.exit(1);
});
