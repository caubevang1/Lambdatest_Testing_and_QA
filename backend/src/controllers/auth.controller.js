/**
 * Authentication Controller
 * Handles user registration, login, and password reset flows.
 * Implements OTP verification for secure account operations.
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import UserRepository from "../repositories/UserRepository.js";
import OtpRepository from "../repositories/OtpRepository.js";
import { generateOtp } from "../utils/generateOtp.js";
import { sendOtpEmail } from "../utils/sendMail.js";
import fs from "fs";
import path from "path";

const NAME_REGEX = /^(\p{Lu}\p{Ll}*)(\s\p{Lu}\p{Ll}*)+$/u;
const PHONE_REGEX = /^0[0-9]{9,10}$/;

/**
 * Capitalize each word in a name string.
 */
const capitalizeName = (name) => {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Validate user input data for registration.
 */
const validateUserEntry = (name, birthday, phone) => {
  const cleanName = capitalizeName(name);
  if (cleanName.split(" ").length < 2 || !NAME_REGEX.test(cleanName)) {
    return {
      error: "Họ tên phải từ 2 từ trở lên và không chứa ký tự đặc biệt.",
    };
  }

  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate())
  )
    age--;

  if (age < 10 || age > 80)
    return { error: `Tuổi (${age}) không phù hợp để tham gia hệ thống.` };

  const cleanPhone = phone?.replace(/\s/g, "");
  if (cleanPhone && !PHONE_REGEX.test(cleanPhone))
    return { error: "Số điện thoại không hợp lệ (10-11 số)." };

  return { cleanName, cleanPhone };
};

/**
 * Remove uploaded file on registration failure.
 */
const rollbackUpload = (req) => {
  if (req.file) {
    const filePath = path.join(process.cwd(), req.file.path);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) { }
  }
};

/**
 * Send OTP for user registration.
 */
export const sendRegisterOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    console.log(`[OTP][REGISTER] Incoming request for: ${email || "<empty>"}`);

    if (!email) {
      return res.status(400).json({ message: "Vui lòng nhập email." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Email không đúng định dạng." });
    }

    if (await UserRepository.findOne({ email }))
      return res.status(409).json({ message: "Email đã tồn tại." });

    const otp = generateOtp();
    await OtpRepository.createOtp(email, otp, "REGISTER");
    console.log(`[OTP][REGISTER] OTP generated and saved for: ${email}`);

    await sendOtpEmail(email, otp, "Đăng ký tài khoản VolunteerHub");
    console.log(`[OTP][REGISTER] Email sent successfully to: ${email}`);
    res.status(200).json({ message: "OTP đã được gửi." });
  } catch (err) {
    console.error("[sendRegisterOtp] Error:", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });

    const email = (req.body?.email || "").trim().toLowerCase();
    if (email) {
      await OtpRepository.clearOtps(email, "REGISTER").catch(() => { });
    }

    if (
      ["EAUTH", "ESOCKET", "ETIMEDOUT", "EENVELOPE", "ECONNECTION"].includes(
        err?.code
      ) ||
      /SMTP|gmail|auth|login|Invalid login/i.test(err?.message || "")
    ) {
      return res.status(500).json({
        message: "Không thể gửi OTP qua email. Vui lòng kiểm tra cấu hình SMTP.",
        error: err.message,
      });
    }

    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

/**
 * Verify OTP and complete user registration.
 */
export const verifyAndRegister = async (req, res) => {
  try {
    const {
      email,
      name,
      username,
      birthday,
      password,
      otp,
      gender,
      phone,
      avatar,
      role,
    } = req.body;

    const validation = validateUserEntry(name, birthday, phone);
    if (validation.error)
      return res.status(400).json({ message: validation.error });

    const isValid = await OtpRepository.verifyAndExpire(email, otp, "REGISTER");
    if (!isValid) {
      return res
        .status(400)
        .json({ message: "OTP không chính xác hoặc đã hết hạn." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await UserRepository.create({
      email,
      name: validation.cleanName,
      username,
      birthday,
      password: hashedPassword,
      gender: gender === "Nam" ? "Male" : gender === "Nữ" ? "Female" : "Other",
      phone: validation.cleanPhone,
      avatar,
      role: role || "VOLUNTEER",
    });

    res.status(201).json({ message: "Đăng ký thành công." });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await UserRepository.findByIdentifierWithPassword(identifier);

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(400).json({ message: "Sai tài khoản hoặc mật khẩu." });
    }

    if (user.status !== "ACTIVE")
      return res.status(403).json({ message: "Tài khoản bị khóa." });

    const token = jwt.sign(
      { userId: user.id, role: user.role }, // Đã dùng user.id
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const userResponse = { ...user };
    delete userResponse.password; // Xóa an toàn

    res.json({ token, user: userResponse });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, birthday, gender, phone } = req.body;
    const validation = validateUserEntry(name, birthday, phone);
    if (validation.error) throw { status: 400, message: validation.error };

    const updateData = {
      name: validation.cleanName,
      birthday,
      gender,
      phone: validation.cleanPhone,
    };
    if (req.file) {
      updateData.avatar = `/uploads/avatars/${req.file.filename}`;
      if (req.user.avatar?.startsWith("/uploads/avatars/")) {
        const old = path.join(process.cwd(), req.user.avatar);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
    }

    const updated = await UserRepository.findByIdAndUpdate(
      req.user.id,
      updateData
    );

    const { password: _, ...userWithoutPassword } = updated;
    res.json({ message: "Cập nhật thành công.", user: userWithoutPassword });
  } catch (err) {
    rollbackUpload(req);
    res.status(err.status || 500).json({ message: err.message });
  }
};

/**
 * Send OTP for password reset.
 */
export const sendResetOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    console.log(`[OTP][RESET] Incoming request for: ${email || "<empty>"}`);

    if (!email) {
      return res.status(400).json({ message: "Vui lòng nhập email." });
    }

    if (!(await UserRepository.findOne({ email })))
      return res.status(404).json({ message: "Email không tồn tại." });

    const otp = generateOtp();
    await OtpRepository.createOtp(email, otp, "RESET");
    console.log(`[OTP][RESET] OTP generated and saved for: ${email}`);

    await sendOtpEmail(email, otp, "Khôi phục mật khẩu");
    console.log(`[OTP][RESET] Email sent successfully to: ${email}`);
    res.json({ message: "OTP đã gửi." });
  } catch (err) {
    console.error("[sendResetOtp] Error:", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });

    const email = (req.body?.email || "").trim().toLowerCase();
    if (email) {
      await OtpRepository.clearOtps(email, "RESET").catch(() => { });
    }
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

/**
 * Reset password using OTP verification.
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const isValid = await OtpRepository.verifyAndExpire(email, otp, "RESET");
    if (!isValid)
      return res.status(400).json({ message: "OTP sai hoặc hết hạn." });

    const hashed = await bcrypt.hash(newPassword, 10);
    await UserRepository.updatePasswordByEmail(email, hashed);
    await OtpRepository.clearOtps(email, "RESET");

    res.json({ message: "Đã đổi mật khẩu." });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

/**
 * Change password for authenticated user.
 */
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await UserRepository.findByIdWithPassword(req.user.id);
    if (!user)
      return res.status(404).json({ message: "Người dùng không tồn tại." });

    if (!(await bcrypt.compare(oldPassword, user.password))) {
      return res.status(400).json({ message: "Mật khẩu cũ sai." });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await UserRepository.findByIdAndUpdate(req.user.id, {
      password: hashedNewPassword,
    });

    res.json({ message: "Đổi mật khẩu thành công." });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

export const getMe = async (req, res) => res.json(req.user);

export const register = async (req, res) => {
  try {
    const { username, email, password, name, birthday, gender, phone, role } =
      req.body;
    const validation = validateUserEntry(name, birthday, phone);
    if (validation.error)
      return res.status(400).json({ message: validation.error });

    await UserRepository.create({
      username,
      email,
      password: await bcrypt.hash(password, 10),
      name: validation.cleanName,
      birthday,
      gender,
      phone: validation.cleanPhone,
      avatar: req.file ? `/uploads/avatars/${req.file.filename}` : null,
      role: role || "VOLUNTEER",
    });
    res.status(201).json({ message: "Đăng ký thành công" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

export const changeEmail = async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    if (!newEmail)
      return res.status(400).json({ message: "Vui lòng cung cấp email mới." });

    // Kiểm tra email đã tồn tại
    const existing = await UserRepository.findOne({ email: newEmail });
    if (existing)
      return res.status(400).json({ message: "Email đã được sử dụng." });

    const user = await UserRepository.findByIdWithPassword(req.user.id);
    if (!user)
      return res.status(404).json({ message: "Người dùng không tồn tại." });

    // Yêu cầu mật khẩu hiện tại để xác thực
    if (!(await bcrypt.compare(password || "", user.password))) {
      return res.status(400).json({ message: "Mật khẩu không chính xác." });
    }

    const updated = await UserRepository.findByIdAndUpdate(req.user.id, {
      email: newEmail,
    });
    const { password: _, ...userWithoutPassword } = updated;
    res.json({ message: "Đổi email thành công.", user: userWithoutPassword });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};
