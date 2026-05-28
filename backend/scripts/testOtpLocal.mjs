import dotenv from "dotenv";
import { sendOtpEmail } from "../src/utils/sendMail.js";

dotenv.config();

const to = process.env.SMTP_EMAIL;

if (!to) {
    console.log("MISSING_SMTP_EMAIL");
    process.exit(2);
}

try {
    await sendOtpEmail(to, "123456", "Local OTP Test");
    console.log("OTP_TEST_SUCCESS");
} catch (e) {
    console.log("OTP_TEST_FAIL");
    console.log(`ERR_CODE=${e && e.code ? e.code : ""}`);
    console.log(`ERR_MSG=${e && e.message ? e.message : ""}`);
    process.exit(1);
}
