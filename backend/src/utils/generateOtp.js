export function generateOtp() {
  if (process.env.OTP_FIXED) return String(process.env.OTP_FIXED);
  return Math.floor(100000 + Math.random() * 900000).toString();
}
