// src/controllers/registration.controller.js
import RegistrationRepository from "../repositories/RegistrationRepository.js";
import EventRepository from "../repositories/EventRepository.js";
import UserRepository from "../repositories/UserRepository.js";
import { sendPushNotification } from "../utils/sendPush.js";

// [POST] /api/registrations/event/:eventId
export const registerForEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const volunteerId = req.user.id;

    const event = await EventRepository.findById(eventId);
    if (!event || event.status !== "approved") {
      return res
        .status(404)
        .json({ message: "Sự kiện không tồn tại hoặc chưa được duyệt." });
    }

    const currentParticipants = await RegistrationRepository.countDocuments({
      event: eventId,
      status: "approved",
    });

    if (currentParticipants >= event.maxParticipants) {
      return res
        .status(409)
        .json({
          message: "Rất tiếc, sự kiện này đã đủ số lượng người tham gia.",
        });
    }

    const newRegistration = await RegistrationRepository.create({
      event: eventId,
      volunteer: volunteerId,
      status: "pending",
    });

    res
      .status(201)
      .json({
        message: "Đăng ký thành công, vui lòng chờ duyệt",
        registration: newRegistration,
      });
  } catch (error) {
    if (error.code === 11000)
      return res
        .status(409)
        .json({ message: "Bạn đã đăng ký sự kiện này rồi." });
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};

// [DELETE] /api/registrations/event/:eventId/cancel
export const cancelRegistration = async (req, res) => {
  try {
    const { eventId } = req.params;
    const volunteerId = req.user.id;

    const registration = await RegistrationRepository.findOne({
      event: eventId,
      volunteer: volunteerId,
    });
    if (!registration)
      return res.status(404).json({ message: "Bạn chưa đăng ký sự kiện này." });

    const event = await EventRepository.findById(eventId);
    let penaltyMessage = "";

    if (event) {
      const now = new Date();
      const eventDate = new Date(event.date);
      const diffDays = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));

      if (diffDays <= 2) {
        await UserRepository.incrementPoints(volunteerId, -10);
        penaltyMessage = " (Bạn bị trừ 10 điểm uy tín do hủy sát ngày diễn ra)";
      }
    }

    await RegistrationRepository.findByIdAndDelete(registration.id);
    res
      .status(200)
      .json({ message: "Hủy đăng ký thành công." + penaltyMessage });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};

// [GET] /api/registrations/my-history
export const getMyHistory = async (req, res) => {
  try {
    const history = await RegistrationRepository.find(
      { volunteer: req.user.id },
      null,
      { sort: { createdAt: -1 } },
      "event"
    );
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};

// [GET] /api/registrations/event/:eventId
export const getEventRegistrations = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await EventRepository.findById(eventId, "points status");
    if (!event)
      return res.status(404).json({ message: "Sự kiện không tồn tại" });

    const registrations = await RegistrationRepository.find(
      { event: eventId },
      null,
      { sort: { createdAt: -1 } },
      "volunteer"
    );

    const results = registrations.map((reg) => {
      let evaluation = "Chưa đánh giá",
        pointsAwarded = 0;
      if (reg.status === "completed" && reg.performance) {
        const eventPoints = event.points || 0;
        evaluation = reg.performance;

        const pointRules = {
          GOOD: eventPoints,
          AVERAGE: Math.floor(eventPoints / 2),
          BAD: Math.floor(eventPoints / 5),
          NO_SHOW: -10,
        };
        pointsAwarded = pointRules[reg.performance] ?? eventPoints;
      }
      return { ...reg, evaluation, pointsAwarded };
    });

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};

// [PUT] /api/registrations/:registrationId/status
export const updateRegistrationStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const registrationId = req.params.registrationId;

    // Approve flow: reserve slot atomically on Event, then mark registration approved
    if (status === "approved") {
      const registration = await RegistrationRepository.findById(registrationId);
      if (!registration)
        return res.status(404).json({ message: "Không tìm thấy đơn đăng ký" });

      if (registration.status !== "pending")
        return res
          .status(409)
          .json({ message: "Đơn đăng ký đã được xử lý trước đó." });

      // Try to reserve a participant slot
      const reserved = await EventRepository.reserveParticipantSlot(
        registration.event
      );
      if (!reserved)
        return res
          .status(409)
          .json({ message: "Sự kiện đã đủ người tham gia." });

      // Try to atomically update the registration only if still pending
      const updatedReg = await RegistrationRepository.findOneAndUpdate(
        { _id: registrationId, status: "pending" },
        { status: "approved" }
      );

      if (!updatedReg) {
        // registration was processed by another concurrent flow — release reserved slot
        await EventRepository.releaseParticipantSlot(registration.event).catch(() => { });
        return res
          .status(409)
          .json({ message: "Đơn đã được xử lý bởi luồng khác." });
      }

      const populatedEvent = await EventRepository.findById(updatedReg.event, "name");
      const clientUrl =
        process.env.CLIENT_URL ||
        process.env.FRONTEND_URL ||
        process.env.PUBLIC_CLIENT_URL ||
        "http://localhost:3000";
      const url = `${clientUrl}/my-registrations`;
      const title = "Đăng ký thành công! ✅";
      const message = `Yêu cầu tham gia sự kiện "${populatedEvent?.name || ''}" đã được chấp thuận.`;

      res.status(200).json({
        message: "Cập nhật trạng thái thành công",
        registration: { ...updatedReg, event: populatedEvent },
      });

      await sendPushNotification(updatedReg.volunteer, title, message, url).catch(() => { });
      return;
    }

    // Reject flow: only reject if still pending
    if (status === "rejected") {
      const updateData = { status: "rejected" };
      if (rejectionReason) updateData.rejectionReason = rejectionReason;

      const updatedReg = await RegistrationRepository.findOneAndUpdate(
        { _id: registrationId, status: "pending" },
        updateData
      );
      if (!updatedReg)
        return res.status(409).json({ message: "Đơn đã được xử lý trước đó." });

      const populatedEvent = await EventRepository.findById(updatedReg.event, "name");
      const clientUrl =
        process.env.CLIENT_URL ||
        process.env.FRONTEND_URL ||
        process.env.PUBLIC_CLIENT_URL ||
        "http://localhost:3000";
      const url = `${clientUrl}/my-registrations`;
      const title = "Thông báo từ chối ❌";
      let message = `Rất tiếc, yêu cầu đăng ký tham gia sự kiện "${populatedEvent?.name || ''}" đã bị từ chối.`;
      if (rejectionReason) message += ` Lý do: ${rejectionReason}`;

      res.status(200).json({
        message: "Cập nhật trạng thái thành công",
        registration: { ...updatedReg, event: populatedEvent },
      });

      await sendPushNotification(updatedReg.volunteer, title, message, url).catch(() => { });
      return;
    }

    // Default fallback for other statuses: apply directly
    const fallbackUpdated = await RegistrationRepository.findByIdAndUpdate(
      registrationId,
      { status }
    );
    if (!fallbackUpdated)
      return res.status(404).json({ message: "Không tìm thấy đơn đăng ký" });

    const populatedEvent = await EventRepository.findById(fallbackUpdated.event, "name");
    res.status(200).json({
      message: "Cập nhật trạng thái thành công",
      registration: { ...fallbackUpdated, event: populatedEvent },
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};

// [POST] /api/registrations/:registrationId/complete
export const markAsCompleted = async (req, res) => {
  try {
    const { registrationId } = req.params;
    const { performance } = req.body;
    const rating = ["GOOD", "AVERAGE", "BAD", "NO_SHOW"].includes(performance)
      ? performance
      : "GOOD";

    const registration = await RegistrationRepository.findById(registrationId);
    if (!registration)
      return res.status(404).json({ message: "Không tìm thấy đơn đăng ký." });

    const event = await EventRepository.findById(registration.event);
    const eventPoints = event?.points || 0;

    let pointsToAdd = 0;
    let pushTitle = "";
    let pushBody = "";

    switch (rating) {
      case "GOOD":
        pointsToAdd = eventPoints;
        pushTitle = "Đánh giá: Tốt 🌟";
        break;
      case "AVERAGE":
        pointsToAdd = Math.floor(eventPoints / 2);
        pushTitle = "Đánh giá: Trung bình 😐";
        break;
      case "BAD":
        pointsToAdd = Math.floor(eventPoints / 5);
        pushTitle = "Đánh giá: Kém 🔴";
        break;
      case "NO_SHOW":
        pointsToAdd = -10;
        pushTitle = "Đánh giá: Vắng mặt 👤-";
        break;
    }

    await UserRepository.incrementPoints(registration.volunteer, pointsToAdd);

    const updated = await RegistrationRepository.findByIdAndUpdate(
      registrationId,
      { status: "completed", performance: rating }
    );

    res
      .status(200)
      .json({
        message: "Đánh giá thành công",
        points: pointsToAdd,
        registration: updated,
      });

    const clientUrl =
      process.env.CLIENT_URL ||
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_CLIENT_URL ||
      "http://localhost:3000";
    const url = `${clientUrl}/my-registrations`;

    // Đã sửa: Không khai báo lại pushBody mà chỉ gán giá trị
    pushBody =
      pointsToAdd >= 0
        ? `Bạn đã hoàn thành nhiệm vụ tại "${event.name}". (+${pointsToAdd}đ)`
        : `Bạn đã vắng mặt tại sự kiện "${event.name}". (-10đ)`;

    await sendPushNotification(
      registration.volunteer,
      pushTitle,
      pushBody,
      url
    ).catch(() => { });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};
