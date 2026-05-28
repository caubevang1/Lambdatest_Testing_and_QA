import bcrypt from "bcrypt";
import User from "../models/user.js";

const DEFAULT_ACCOUNTS = [
  {
    username: "admin",
    password: "admin",
    name: "Admin User",
    email: "admin@volunteerhub.local",
    role: "ADMIN",
    birthday: new Date("1990-01-01"),
    gender: "Male",
    phone: "0900000001",
  },
  {
    username: "eventmanager",
    password: "eventmanager",
    name: "Event Manager",
    email: "eventmanager@volunteerhub.local",
    role: "EVENTMANAGER",
    birthday: new Date("1990-01-01"),
    gender: "Male",
    phone: "0900000002",
  },
];

export async function seedDefaultAccounts() {
  for (const account of DEFAULT_ACCOUNTS) {
    try {
      const exists = await User.findOne({ username: account.username });
      if (exists) {
        console.log(`⏭️  Seed skipped (already exists): ${account.username}`);
        continue;
      }

      const hashed = await bcrypt.hash(account.password, 10);
      await User.create({ ...account, password: hashed });
      console.log(`✅ Seeded default account: ${account.username} (${account.role})`);
    } catch (err) {
      console.error(`❌ Seed failed for ${account.username}:`, err.message);
    }
  }
}
