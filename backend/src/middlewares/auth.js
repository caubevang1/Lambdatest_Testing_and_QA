/**
 * Authentication Middleware
 * Provides JWT token verification and role-based access control.
 * Implements permission checks for admin, event manager, and event members.
 */

import jwt from "jsonwebtoken";
import UserRepository from "../repositories/UserRepository.js";
import RegistrationRepository from "../repositories/RegistrationRepository.js";
import EventRepository from "../repositories/EventRepository.js";

/**
 * Verify JWT token and attach user to request.
 */
export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await UserRepository.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "Người dùng không tồn tại hoặc phiên làm việc hết hạn." });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn." });
  }
};

/**
 * Restrict access to admin users only.
 */
export const admin = (req, res, next) => {
  const role = String(req.user?.role || "").toUpperCase();
  if (req.user && role === "ADMIN") {
    next();
  } else {
    res.status(403).json({ message: "Yêu cầu quyền Quản trị viên (Admin)." });
  }
};

/**
 * Restrict access to event managers and admins.
 */
export const eventManager = (req, res, next) => {
  const userRole = String(req.user?.role || "").toUpperCase();
  if (userRole === "EVENTMANAGER" || userRole === "ADMIN") {
    next();
  } else {
    res.status(403).json({ message: "Yêu cầu quyền Quản lý sự kiện hoặc Admin." });
  }
};

/**
 * Verify user is a member of the event or has manager/admin privileges.
 */
export const isEventMember = async (req, res, next) => {
  try {
    const eventId = req.params.eventId || req.params.id || req.body.eventId;
    const userId = req.user.id;
    const userRole = String(req.user?.role || "").toUpperCase();

    if (userRole === "ADMIN") return next();

    const event = await EventRepository.findById(eventId);
    if (!event) return res.status(404).json({ message: "Không tìm thấy sự kiện." });

    if (userRole === "EVENTMANAGER" && String(event.createdBy) === String(userId)) {
      return next();
    }

    const isMember = await RegistrationRepository.checkMemberStatus(userId, eventId);

    if (isMember) return next();

    res.status(403).json({ message: "Bạn không có quyền truy cập sự kiện này." });
  } catch (error) {
    res.status(500).json({ message: "Lỗi xác thực quyền truy cập sự kiện.", error: error.message });
  }
};