/**
 * EventRepository
 * Manages event data access with complex aggregations and statistics.
 * Provides filtering, status tracking, and participant counting.
 */

import mongoose from "mongoose";
import BaseRepository from "./BaseRepository.js";
import Event from "../models/event.js";

class EventRepository extends BaseRepository {
  constructor() {
    super(Event);
  }

  /**
   * Prepare filter object for MongoDB queries.
   * Converts id to ObjectId and handles date range filtering.
   */
  #prepareFilter(filter) {
    const mongoFilter = {};
    Object.keys(filter).forEach((key) => {
      if (
        filter[key] !== undefined &&
        filter[key] !== null &&
        filter[key] !== ""
      ) {
        mongoFilter[key] = filter[key];
      }
    });

    const idVal = mongoFilter.id || mongoFilter._id;
    if (idVal && typeof idVal === "string" && mongoose.isValidObjectId(idVal)) {
      mongoFilter._id = new mongoose.Types.ObjectId(idVal);
      delete mongoFilter.id;
    }

    if (
      mongoFilter.createdBy &&
      typeof mongoFilter.createdBy === "string" &&
      mongoose.isValidObjectId(mongoFilter.createdBy)
    ) {
      mongoFilter.createdBy = new mongoose.Types.ObjectId(
        mongoFilter.createdBy
      );
    }

    if (mongoFilter.date && typeof mongoFilter.date === "string") {
      const d = new Date(mongoFilter.date);
      if (!isNaN(d.getTime())) {
        const nextD = new Date(d);
        nextD.setDate(nextD.getDate() + 1);
        mongoFilter.date = { $gte: d, $lt: nextD };
      } else {
        delete mongoFilter.date;
      }
    }
    return mongoFilter;
  }

  /**
   * Get event details with registration statistics for admin view.
   * Includes approved, pending, rejected counts and creator info.
   */
  async getEventWithStatsById(eventId) {
    try {
      if (!mongoose.isValidObjectId(eventId)) return null;
      const oId = new mongoose.Types.ObjectId(eventId);

      const results = await this.model.aggregate([
        { $match: { _id: oId } },
        {
          $lookup: {
            from: "registrations",
            localField: "_id",
            foreignField: "event",
            as: "registrations",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "creator",
          },
        },
        {
          $project: {
            name: 1,
            description: 1,
            date: 1,
            endDate: 1,
            location: 1,
            category: 1,
            coverImage: 1,
            galleryImages: 1,
            status: 1,
            maxParticipants: 1,
            points: 1,
            likesCount: 1,
            sharesCount: 1,
            viewsCount: 1,
            rejectionReason: 1,
            createdBy: { $arrayElemAt: ["$creator", 0] },
            totalRegistrations: { $size: "$registrations" },
            approvedCount: {
              $size: {
                $filter: {
                  input: "$registrations",
                  as: "reg",
                  cond: { $in: ["$$reg.status", ["approved", "completed"]] },
                },
              },
            },
            pendingCount: {
              $size: {
                $filter: {
                  input: "$registrations",
                  as: "reg",
                  cond: { $eq: ["$$reg.status", "pending"] },
                },
              },
            },
            rejectedCount: {
              $size: {
                $filter: {
                  input: "$registrations",
                  as: "reg",
                  cond: { $eq: ["$$reg.status", "rejected"] },
                },
              },
            },
            currentParticipants: {
              $size: {
                $filter: {
                  input: "$registrations",
                  as: "reg",
                  cond: { $eq: ["$$reg.status", "approved"] },
                },
              },
            },
          },
        },
      ]);
      return results.length > 0 ? this.transform(results[0]) : null;
    } catch (error) {
      throw new Error("Lỗi Repo Detail: " + error.message);
    }
  }

  /**
   * Get events filtered by status for admin approval workflow.
   * Returns events with creator information sorted by creation date.
   */
  async getEventsByStatus(status) {
    const results = await this.model.aggregate([
      { $match: { status: status } },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $project: {
          name: 1,
          date: 1,
          endDate: 1,
          location: 1,
          category: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          createdBy: { $arrayElemAt: ["$creator", 0] },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
    return this.transform(results);
  }

  async getAllSystemEventsWithStats() {
    const results = await this.model.aggregate([
      {
        $lookup: {
          from: "registrations",
          localField: "_id",
          foreignField: "event",
          as: "registrations",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $project: {
          name: 1,
          date: 1,
          endDate: 1,
          location: 1,
          category: 1,
          status: 1,
          rejectionReason: 1,
          createdAt: 1,
          createdBy: { $arrayElemAt: ["$creator", 0] },
          totalRegistrations: { $size: "$registrations" },
          currentParticipants: {
            $size: {
              $filter: {
                input: "$registrations",
                as: "reg",
                cond: { $eq: ["$$reg.status", "approved"] },
              },
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
    return this.transform(results);
  }

  async getEventsWithStats(filter = {}) {
    const mongoFilter = this.#prepareFilter(filter);
    const results = await this.model.aggregate([
      { $match: mongoFilter },
      {
        $lookup: {
          from: "registrations",
          localField: "_id",
          foreignField: "event",
          as: "registrations",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $project: {
          name: 1,
          description: 1,
          date: 1,
          endDate: 1,
          location: 1,
          category: 1,
          coverImage: 1,
          galleryImages: 1,
          status: 1,
          maxParticipants: 1,
          points: 1,
          likesCount: 1,
          sharesCount: 1,
          viewsCount: 1,
          rejectionReason: 1,
          createdAt: 1, // <<< FIX: Thêm createdAt
          createdBy: { $arrayElemAt: ["$creator", 0] },
          currentParticipants: {
            $size: {
              $filter: {
                input: "$registrations",
                as: "reg",
                cond: { $eq: ["$$reg.status", "approved"] },
              },
            },
          },
        },
      },
      { $sort: { date: 1 } },
    ]);
    return this.transform(results);
  }

  async getSinglePublicEventDetail(identifier) {
    const filter = { status: "approved", $or: [{ name: identifier }] };
    if (mongoose.isValidObjectId(identifier)) {
      filter.$or.push({ _id: new mongoose.Types.ObjectId(identifier) });
    }
    const arr = await this.getEventsWithStats(filter);
    return arr && arr.length > 0 ? arr[0] : null;
  }

  async getApprovedEventsFiltered({ category, date }) {
    return await this.getEventsWithStats({
      status: "approved",
      category,
      date,
    });
  }

  async getEventsByManager(managerId) {
    return await this.find({ createdBy: managerId }, null, {
      sort: { date: 1 },
    });
  }

  async updateStatus(id, status) {
    return await this.findByIdAndUpdate(id, { status });
  }

  async rejectEvent(id, reason) {
    return await this.findByIdAndUpdate(id, {
      status: "rejected",
      rejectionReason: reason || "Không có lý do cụ thể",
    });
  }

  async getAdminDashboardStats() {
    const [pending, approved, rejected, completed] = await Promise.all([
      this.countDocuments({ status: "pending" }),
      this.countDocuments({ status: "approved" }),
      this.countDocuments({ status: "rejected" }),
      this.countDocuments({ status: "completed" }),
    ]);
    return {
      pendingEventsCount: pending,
      approvedEventsCount: approved,
      rejectedEventsCount: rejected,
      completedEventsCount: completed,
      totalEvents: pending + approved + rejected + completed,
    };
  }

  /**
   * ✅ OPTIMIZED: Lấy trending events dùng Aggregation thay vì N+1 queries
   */
  async getTrendingEvents(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results = await this.model.aggregate([
      { $match: { status: "approved" } },

      // Join với registrations để đếm đăng ký gần đây
      {
        $lookup: {
          from: "registrations",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$event", "$$eventId"] },
                    { $gte: ["$createdAt", cutoffDate] },
                  ],
                },
              },
            },
            { $count: "total" },
          ],
          as: "recentRegsArr",
        },
      },

      // Join với eventactions để đếm likes gần đây
      {
        $lookup: {
          from: "eventactions",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$event", "$$eventId"] },
                    { $eq: ["$type", "LIKE"] },
                    { $gte: ["$createdAt", cutoffDate] },
                  ],
                },
              },
            },
            { $count: "total" },
          ],
          as: "recentLikesArr",
        },
      },

      // Join với eventactions để đếm shares gần đây
      {
        $lookup: {
          from: "eventactions",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$event", "$$eventId"] },
                    { $eq: ["$type", "SHARE"] },
                    { $gte: ["$createdAt", cutoffDate] },
                  ],
                },
              },
            },
            { $count: "total" },
          ],
          as: "recentSharesArr",
        },
      },

      // Join với registrations để đếm currentParticipants
      {
        $lookup: {
          from: "registrations",
          localField: "_id",
          foreignField: "event",
          as: "registrations",
        },
      },

      // Join với users để lấy thông tin creator
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },

      // Tính toán các metrics
      {
        $addFields: {
          recentRegistrations: {
            $ifNull: [{ $arrayElemAt: ["$recentRegsArr.total", 0] }, 0],
          },
          recentLikes: {
            $ifNull: [{ $arrayElemAt: ["$recentLikesArr.total", 0] }, 0],
          },
          recentShares: {
            $ifNull: [{ $arrayElemAt: ["$recentSharesArr.total", 0] }, 0],
          },
          currentParticipants: {
            $size: {
              $filter: {
                input: "$registrations",
                as: "reg",
                cond: { $eq: ["$$reg.status", "approved"] },
              },
            },
          },
          createdBy: { $arrayElemAt: ["$creator", 0] },
        },
      },

      // Tính trending score
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: ["$recentRegistrations", 3] },
              { $multiply: ["$recentLikes", 2] },
              { $multiply: ["$recentShares", 5] },
            ],
          },
        },
      },

      // Sắp xếp và giới hạn
      { $sort: { trendingScore: -1 } },
      { $limit: 10 },

      // Cleanup
      {
        $project: {
          recentRegsArr: 0,
          recentLikesArr: 0,
          recentSharesArr: 0,
          registrations: 0,
          creator: 0,
        },
      },
    ]);

    return this.transform(results);
  }

  async getStatsBatch(eventIds) {
    const objectIds = eventIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const events = await this.model
      .find({ _id: { $in: objectIds } }, "likesCount sharesCount viewsCount")
      .lean();
    return events.reduce((acc, ev) => {
      acc[String(ev._id)] = {
        likesCount: ev.likesCount || 0,
        sharesCount: ev.sharesCount || 0,
        viewsCount: ev.viewsCount || 0,
      };
      return acc;
    }, {});
  }

  async updateLikeCount(eventId, inc = 1) {
    if (inc < 0) {
      return await this.model.findOneAndUpdate(
        { _id: eventId, likesCount: { $gt: 0 } },
        { $inc: { likesCount: inc } },
        { new: true }
      );
    }
    return await this.findByIdAndUpdate(eventId, { $inc: { likesCount: inc } });
  }

  async incrementShareCount(eventId) {
    return await this.findByIdAndUpdate(eventId, { $inc: { sharesCount: 1 } });
  }

  async incrementViewCount(eventId) {
    return await this.findByIdAndUpdate(eventId, { $inc: { viewsCount: 1 } });
  }

  /**
   * Reserve a participant slot atomically using MongoDB findOneAndUpdate with $expr.
   * Returns the updated event when reserved, or null when no slot available.
   */
  async reserveParticipantSlot(eventId) {
    try {
      const filter = {
        _id: eventId,
        status: "approved",
        $expr: {
          $lt: [
            { $ifNull: ["$approvedParticipantsCount", 0] },
            "$maxParticipants",
          ],
        },
      };
      const update = { $inc: { approvedParticipantsCount: 1 } };
      const doc = await this.model.findOneAndUpdate(filter, update, { new: true }).lean();
      return this.transform(doc);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Release a previously reserved participant slot (decrement counter if > 0).
   */
  async releaseParticipantSlot(eventId) {
    const doc = await this.model.findOneAndUpdate(
      { _id: eventId, approvedParticipantsCount: { $gt: 0 } },
      { $inc: { approvedParticipantsCount: -1 } },
      { new: true }
    ).lean();
    return this.transform(doc);
  }
}

export default new EventRepository();
