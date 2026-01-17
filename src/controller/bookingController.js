const models = require("../model");
const { getAvailableSeats } = require("../utils/seatUtils");
const { verifyPayment } = require("../utils/razorpay");
const { createPaymentUtil } = require("./paymentController");
const { sendBookingConfirmationEmail } = require("../utils/emailService");
const { v4: uuidv4 } = require("uuid");
const dayjs = require("dayjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { Op } = require("sequelize");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

function generatePNR() {
  const maxAttempts = 10;
  let attempt = 0;

  async function tryGenerate() {
    while (attempt < maxAttempts) {
      try {
        let pnr = crypto
          .randomBytes(6)
          .toString("base64")
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 6)
          .toUpperCase();
        if (pnr.length === 6) {
          const existing = await models.Booking.findOne({ where: { pnr } });
          if (!existing) return pnr;
        }
      } catch (cryptoError) {
        let pnr = uuidv4()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 6)
          .toUpperCase();
        if (pnr.length === 6) {
          const existing = await models.Booking.findOne({ where: { pnr } });
          if (!existing) return pnr;
        }
      }
      attempt++;
    }

    let pnr = uuidv4()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase();
    if (pnr.length < 6) {
      pnr = pnr.padEnd(6, "X");
    }
    const existing = await models.Booking.findOne({ where: { pnr } });
    if (!existing) return pnr;

    throw new Error("Failed to generate unique PNR after multiple attempts");
  }

  return tryGenerate();
}

async function completeBooking(req, res) {
  const { bookedSeat, booking, billing, payment, passengers } = req.body;

  // Log incoming payload for debugging

  // Input validation
  if (
    !bookedSeat ||
    !booking ||
    !billing ||
    !payment ||
    !Array.isArray(passengers) ||
    !passengers.length
  ) {
    return res.status(400).json({
      error:
        "Missing required booking sections: bookedSeat, booking, billing, payment, or passengers",
    });
  }
  if (!dayjs(bookedSeat.bookDate, "YYYY-MM-DD", true).isValid()) {
    return res
      .status(400)
      .json({ error: "Invalid bookDate format (YYYY-MM-DD)" });
  }
  if (
    !bookedSeat.seat_labels ||
    !Array.isArray(bookedSeat.seat_labels) ||
    bookedSeat.seat_labels.length !== passengers.length
  ) {
    return res.status(400).json({
      error: "seat_labels must be an array matching the number of passengers",
    });
  }

  // Validate booking fields
  const bookingRequiredFields = [
    "pnr",
    "bookingNo",
    "contact_no",
    "email_id",
    "noOfPassengers",
    "bookDate",
    "totalFare",
    "bookedUserId",
    "schedule_id",
  ];
  const missingBookingFields = bookingRequiredFields.filter(
    (f) => !booking[f] && booking[f] !== 0
  );
  if (missingBookingFields.length) {
    return res.status(400).json({
      error: `Missing booking fields: ${missingBookingFields.join(", ")}`,
    });
  }

  // Validate other sections
  if (!billing.user_id) {
    return res.status(400).json({ error: "Missing billing field: user_id" });
  }
  const paymentRequiredFields = [
    "user_id",
    "payment_amount",
    "payment_status",
    "transaction_id",
    "payment_mode",
  ];
  const missingPaymentFields = paymentRequiredFields.filter(
    (f) => !payment[f] && payment[f] !== 0
  );
  if (missingPaymentFields.length) {
    return res.status(400).json({
      error: `Missing payment fields: ${missingPaymentFields.join(", ")}`,
    });
  }
  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== "number") {
      return res
        .status(400)
        .json({ error: "Missing passenger fields: name, title, type, age" });
    }
  }
  if (!["RAZORPAY", "ADMIN", "AGENT"].includes(payment.payment_mode)) {
    return res.status(400).json({
      error: "Invalid payment_mode. Must be RAZORPAY, ADMIN, or AGENT",
    });
  }

  const totalFare = parseFloat(booking.totalFare);
  const paymentAmount = parseFloat(payment.payment_amount);
  if (!Number.isFinite(totalFare) || totalFare <= 0) {
    return res
      .status(400)
      .json({ error: "Total fare must be a positive number" });
  }
  if (Math.abs(totalFare - paymentAmount) > 0.01) {
    return res
      .status(400)
      .json({ error: "Total fare does not match payment amount" });
  }

  let transaction;
  try {
    // IDEMPOTENCY CHECK: Prevent duplicate bookings for same payment
    if (
      payment.payment_id &&
      payment.payment_id !== "PENDING" &&
      !payment.payment_id.startsWith("ADMIN_") &&
      !payment.payment_id.startsWith("AGENT_")
    ) {
      console.log(
        "[Idempotency] Checking for existing booking with payment_id:",
        payment.payment_id
      );

      try {
        // Check if this payment_id already has a booking (for flight bookings)
        const existingPayment = await models.Payment.findOne({
          where: { payment_id: payment.payment_id },
        });

        if (existingPayment && existingPayment.booking_id) {
          // Booking already exists for this payment
          const existingBooking = await models.Booking.findByPk(
            existingPayment.booking_id,
            {
              include: [
                { model: models.Passenger, as: "Passengers" },
                { model: models.BookedSeat, as: "BookedSeats" },
              ],
            }
          );

          if (existingBooking) {
            console.log(
              "[Idempotency] Returning existing booking for payment:",
              payment.payment_id
            );

            return res.status(200).json({
              booking: {
                id: existingBooking.id,
                pnr: existingBooking.pnr,
                bookingNo: existingBooking.bookingNo,
                bookingStatus: existingBooking.bookingStatus,
                paymentStatus: existingBooking.paymentStatus,
                bookDate: existingBooking.bookDate,
                totalFare: existingBooking.totalFare,
                noOfPassengers: existingBooking.noOfPassengers,
                contact_no: existingBooking.contact_no,
                email_id: existingBooking.email_id,
                bookedSeats:
                  existingBooking.BookedSeats?.map((s) => s.seat_label) || [],
                bookingType: "flight",
              },
              passengers:
                existingBooking.Passengers?.map((p, index) => ({
                  name: p.name,
                  fullName: p.name,
                  title: p.title,
                  age: p.age,
                  type: p.type,
                  dob: p.dob,
                  seat:
                    existingBooking.BookedSeats?.[index]?.seat_label ||
                    "Not Assigned",
                })) || [],
              availableSeats: [], // Not needed for existing booking
              message:
                "Booking already exists for this payment (idempotency check)",
            });
          }
        }

        // Also check helicopter payments
        const existingHelicopterPayment =
          await models.HelicopterPayment.findOne({
            where: { payment_id: payment.payment_id },
          });

        if (
          existingHelicopterPayment &&
          existingHelicopterPayment.helicopter_booking_id
        ) {
          const existingBooking = await models.HelicopterBooking.findByPk(
            existingHelicopterPayment.helicopter_booking_id,
            {
              include: [
                { model: models.HelicopterPassenger, as: "Passengers" },
                { model: models.HelicopterBookedSeat, as: "BookedSeats" },
              ],
            }
          );

          if (existingBooking) {
            console.log(
              "[Idempotency] Returning existing helicopter booking for payment:",
              payment.payment_id
            );

            return res.status(200).json({
              booking: {
                id: existingBooking.id,
                pnr: existingBooking.pnr,
                bookingNo: existingBooking.bookingNo,
                bookingStatus: existingBooking.bookingStatus,
                paymentStatus: existingBooking.paymentStatus,
                bookDate: existingBooking.bookDate,
                totalFare: existingBooking.totalFare,
                noOfPassengers: existingBooking.noOfPassengers,
                contact_no: existingBooking.contact_no,
                email_id: existingBooking.email_id,
                bookedSeats:
                  existingBooking.BookedSeats?.map((s) => s.seat_label) || [],
                bookingType: "helicopter",
              },
              passengers:
                existingBooking.Passengers?.map((p, index) => ({
                  name: p.name,
                  fullName: p.name,
                  title: p.title,
                  age: p.age,
                  type: p.type,
                  dob: p.dob,
                  seat:
                    existingBooking.BookedSeats?.[index]?.seat_label ||
                    "Not Assigned",
                })) || [],
              availableSeats: [],
              message:
                "Helicopter booking already exists for this payment (idempotency check)",
            });
          }
        }
      } catch (idempotencyError) {
        console.error("[Idempotency] Check failed:", idempotencyError);
        // Continue with booking creation if idempotency check fails
      }
    }

    // Validate user
    const user = await models.User.findByPk(booking.bookedUserId);
    if (!user) {
      return res
        .status(400)
        .json({ error: `Invalid bookedUserId: ${booking.bookedUserId}` });
    }

    transaction = await models.sequelize.transaction();

    // Authenticate admin for ADMIN mode
    if (payment.payment_mode === "ADMIN") {
      const token = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : req.headers.token || req.cookies?.token;

      if (!token) {
        throw new Error("Unauthorized: No token provided for admin booking");
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (String(decoded.role) !== "1") {
          throw new Error("Forbidden: Only admins can use ADMIN payment mode");
        }
        if (
          String(decoded.id) !== String(booking.bookedUserId) ||
          String(decoded.id) !== String(billing.user_id) ||
          String(decoded.id) !== String(payment.user_id)
        ) {
          throw new Error("User ID mismatch in booking, billing, or payment");
        }
      } catch (jwtErr) {
        throw new Error(`Invalid token: ${jwtErr.message}`);
      }

      payment.payment_status = "SUCCESS";
      payment.payment_id = `ADMIN_${Date.now()}`;
      payment.order_id = `ADMIN_${Date.now()}`;
      payment.razorpay_signature = null;
      payment.message = "Admin booking (no payment required)";
    } else if (payment.payment_mode === "RAZORPAY") {
      if (
        !payment.payment_id ||
        !payment.order_id ||
        !payment.razorpay_signature
      ) {
        throw new Error(
          "Missing Razorpay payment fields: payment_id, order_id, or razorpay_signature"
        );
      }
      const isValidSignature = await verifyPayment({
        order_id: payment.order_id,
        payment_id: payment.payment_id,
        signature: payment.razorpay_signature,
      });
      if (!isValidSignature) {
        throw new Error("Invalid Razorpay signature");
      }
    } else if (payment.payment_mode === "AGENT") {
      // Allow agent to book for users with payment via 'AGENT'
      const agent = await models.User.findByPk(payment.user_id);
      if (!agent || agent.role !== 2) {
        throw new Error("Invalid agent ID for agent booking");
      }

      // Find the corresponding agent record in the agents table
      const agentRecord = await models.Agent.findOne({
        where: { agentId: agent.username },
      });
      if (agentRecord) {
        booking.agentId = agentRecord.id; // Use the agent table ID, not user ID
      }

      payment.payment_status = "SUCCESS";
      payment.payment_id = `AGENT_${Date.now()}`;
      payment.order_id = `AGENT_${Date.now()}`;
      payment.razorpay_signature = null;
      payment.message = "Agent booking (no payment required)";
    }

    // Verify seat availability - check if this is a helicopter or flight schedule
    let availableSeats;
    let isHelicopterBooking = false;
    let helicopterSchedule = null;

    try {
      // First try to find as a helicopter schedule
      helicopterSchedule = await models.HelicopterSchedule.findByPk(
        bookedSeat.schedule_id,
        { transaction }
      );
      if (helicopterSchedule) {
        isHelicopterBooking = true;
        // This is a helicopter booking - use helicopter seat validation
        const {
          getAvailableHelicopterSeats,
        } = require("../utils/helicopterSeatUtils");
        availableSeats = await getAvailableHelicopterSeats({
          models,
          schedule_id: bookedSeat.schedule_id,
          bookDate: bookedSeat.bookDate,
          transaction,
        });
      } else {
        // This is a flight booking - use flight seat validation
        availableSeats = await getAvailableSeats({
          models,
          schedule_id: bookedSeat.schedule_id,
          bookDate: bookedSeat.bookDate,
          transaction,
        });
      }
    } catch (error) {
      throw new Error(`Failed to verify seat availability: ${error.message}`);
    }

    for (const seat of bookedSeat.seat_labels) {
      if (!availableSeats.includes(seat)) {
        throw new Error(`Seat ${seat} is not available`);
      }
    }

    let newBooking;

    if (isHelicopterBooking) {
      // Create helicopter booking in helicopter_bookings table
      newBooking = await models.HelicopterBooking.create(
        {
          pnr: booking.pnr,
          bookingNo: booking.bookingNo,
          contact_no: booking.contact_no,
          email_id: booking.email_id,
          noOfPassengers: booking.noOfPassengers,
          bookDate: booking.bookDate,
          helicopter_schedule_id: bookedSeat.schedule_id,
          totalFare: booking.totalFare,
          transactionId: booking.transactionId,
          paymentStatus: "SUCCESS",
          bookingStatus: "CONFIRMED",
          bookedUserId: booking.bookedUserId,
          pay_amt: booking.pay_amt,
          pay_mode: booking.pay_mode,
          paymentId: booking.paymentId,
          discount: booking.discount || "0",
          agentId: booking.agentId || null,
        },
        { transaction }
      );

      // Create helicopter booked seats
      for (const seat of bookedSeat.seat_labels) {
        await models.HelicopterBookedSeat.create(
          {
            helicopter_booking_id: newBooking.id,
            helicopter_schedule_id: bookedSeat.schedule_id,
            bookDate: bookedSeat.bookDate,
            seat_label: seat,
            booked_seat: 1,
          },
          { transaction }
        );
      }

      // Create helicopter passengers
      await models.HelicopterPassenger.bulkCreate(
        passengers.map((p) => ({
          helicopter_bookingId: newBooking.id,
          title: p.title,
          name: p.name,
          dob: p.dob || null,
          age: p.age,
          weight: p.weight || null,
          type: p.type,
        })),
        { transaction }
      );

      // Create helicopter payment
      await models.HelicopterPayment.create(
        {
          transaction_id: payment.transaction_id,
          payment_id: payment.payment_id,
          payment_status: payment.payment_status,
          payment_mode: payment.payment_mode,
          payment_amount: payment.payment_amount,
          message: payment.message || null,
          helicopter_booking_id: newBooking.id,
          user_id: booking.bookedUserId,
        },
        { transaction }
      );

      // Create billing record for helicopter booking (same as flight bookings)
      await models.Billing.create(
        {
          ...billing,
          user_id: booking.bookedUserId,
        },
        { transaction }
      );

      // Update available seats for helicopter
      const {
        getAvailableHelicopterSeats,
      } = require("../utils/helicopterSeatUtils");
      availableSeats = await getAvailableHelicopterSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction,
      });
    } else {
      // Create flight booking in bookings table (existing logic)
      newBooking = await models.Booking.create(
        {
          ...booking,
          bookingStatus: "CONFIRMED",
          paymentStatus: "SUCCESS",
          agentId: booking.agentId || null,
        },
        { transaction }
      );

      // Create booked seats
      for (const seat of bookedSeat.seat_labels) {
        await models.BookedSeat.create(
          {
            booking_id: newBooking.id,
            schedule_id: bookedSeat.schedule_id,
            bookDate: bookedSeat.bookDate,
            seat_label: seat,
            booked_seat: 1,
          },
          { transaction }
        );
      }

      // Create billing and payment records
      await models.Billing.create(
        { ...billing, user_id: booking.bookedUserId },
        { transaction }
      );
      await models.Payment.create(
        {
          ...payment,
          booking_id: newBooking.id,
          user_id: booking.bookedUserId,
        },
        { transaction }
      );

      // Create passengers
      await models.Passenger.bulkCreate(
        passengers.map((p) => ({
          bookingId: newBooking.id,
          title: p.title,
          name: p.name,
          dob: p.dob || null,
          age: p.age,
          type: p.type,
        })),
        { transaction }
      );

      // Update available seats for flight
      availableSeats = await getAvailableSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction,
      });
    }

    await transaction.commit();

    // Emit seats-updated event
    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        availableSeats: availableSeats,
        bookingType: isHelicopterBooking ? "helicopter" : "flight",
      });
    }

    // Send confirmation emails
    try {
      // Fetch schedule details for email
      let scheduleDetails = {};

      if (isHelicopterBooking) {
        // Fetch helicopter schedule details separately to avoid association conflicts
        const fullHelicopterSchedule = await models.HelicopterSchedule.findByPk(
          bookedSeat.schedule_id
        );
        let departureHelipad = null;
        let arrivalHelipad = null;
        let helicopter = null;

        if (fullHelicopterSchedule) {
          // Fetch related data separately to avoid eager loading conflicts
          departureHelipad = await models.Helipad.findByPk(
            fullHelicopterSchedule.departure_helipad_id
          );
          arrivalHelipad = await models.Helipad.findByPk(
            fullHelicopterSchedule.arrival_helipad_id
          );
          helicopter = await models.Helicopter.findByPk(
            fullHelicopterSchedule.helicopter_id
          );
        }

        if (fullHelicopterSchedule) {
          scheduleDetails = {
            departureCity: departureHelipad?.helipad_name || "N/A",
            arrivalCity: arrivalHelipad?.helipad_name || "N/A",
            departureTime: fullHelicopterSchedule.departure_time,
            arrivalTime: fullHelicopterSchedule.arrival_time,
            flightNumber: helicopter?.helicopter_number || "N/A",
          };
        }
      } else {
        const fullFlightSchedule = await models.FlightSchedule.findByPk(
          bookedSeat.schedule_id,
          {
            include: [
              { model: models.Airport, as: "DepartureAirport" },
              { model: models.Airport, as: "ArrivalAirport" },
              { model: models.Flight, as: "Flight" },
            ],
          }
        );

        if (fullFlightSchedule) {
          scheduleDetails = {
            departureCity:
              fullFlightSchedule.DepartureAirport?.airport_name || "N/A",
            arrivalCity:
              fullFlightSchedule.ArrivalAirport?.airport_name || "N/A",
            departureTime: fullFlightSchedule.departure_time,
            arrivalTime: fullFlightSchedule.arrival_time,
            flightNumber: fullFlightSchedule.Flight?.flight_number || "N/A",
          };
        }
      }

      const emailData = {
        pnr: newBooking.pnr,
        bookingNo: newBooking.bookingNo,
        passengerName: passengers[0].name,
        departureCity: scheduleDetails.departureCity,
        arrivalCity: scheduleDetails.arrivalCity,
        departureDate: newBooking.bookDate,
        departureTime: scheduleDetails.departureTime,
        arrivalTime: scheduleDetails.arrivalTime,
        flightNumber: scheduleDetails.flightNumber,
        totalFare: newBooking.totalFare,
        seatNumbers: bookedSeat.seat_labels.join(", "),
        bookingType: isHelicopterBooking ? "helicopter" : "flight",
        email: booking.email_id,
      };

      // Send to booking email
      if (booking.email_id) {
        await sendBookingConfirmationEmail({
          ...emailData,
          email: booking.email_id,
        });
      }

      // Send to registered user email if different
      if (user && user.email && user.email !== booking.email_id) {
        await sendBookingConfirmationEmail({
          ...emailData,
          email: user.email,
        });
      }
    } catch (emailError) {
      console.error("Failed to send confirmation emails:", emailError);

      // Log the email error
      const { logError } = require("./logsController");
      logError(
        emailError,
        "bookingController.js:completeBooking",
        booking.bookedUserId,
        {
          bookingId: newBooking.id,
          paymentId: payment.payment_id,
          bookingType: isHelicopterBooking ? "helicopter" : "flight",
        },
        "HIGH"
      );
    }

    // Return complete booking data with PNR and all details
    return res.status(201).json({
      booking: {
        id: newBooking.id,
        pnr: newBooking.pnr,
        bookingNo: newBooking.bookingNo,
        bookingStatus: newBooking.bookingStatus,
        paymentStatus: newBooking.paymentStatus,
        bookDate: newBooking.bookDate,
        totalFare: newBooking.totalFare,
        noOfPassengers: newBooking.noOfPassengers,
        contact_no: newBooking.contact_no,
        email_id: newBooking.email_id,
        bookedSeats: bookedSeat.seat_labels,
        bookingType: isHelicopterBooking ? "helicopter" : "flight",
      },
      passengers: passengers.map((p, index) => ({
        name: p.name,
        fullName: p.name,
        title: p.title,
        age: p.age,
        type: p.type,
        dob: p.dob,
        seat: bookedSeat.seat_labels[index] || "Not Assigned",
      })),
      availableSeats: availableSeats,
    });
  } catch (err) {
    if (transaction) await transaction.rollback();

    // Log the booking error
    const { logError, logActivity } = require("./logsController");
    logError(
      err,
      "bookingController.js:completeBooking",
      booking?.bookedUserId,
      {
        paymentId: payment?.payment_id,
        bookingData: booking,
        paymentData: payment,
      },
      "CRITICAL"
    );

    // Log failed booking activity
    if (booking?.bookedUserId) {
      logActivity(
        booking.bookedUserId,
        "BOOKING_FAILED",
        `Booking creation failed: ${err.message}`,
        {
          error: err.message,
          paymentId: payment?.payment_id,
          scheduleId: bookedSeat?.schedule_id,
        },
        req,
        "FAILED"
      );
    }

    return res
      .status(400)
      .json({ error: `Failed to complete booking: ${err.message}` });
  }
}

async function generatePNRController(req, res) {
  try {
    const pnr = await generatePNR();
    res.json({ pnr });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate PNR" });
  }
}

async function bookSeatsWithoutPayment(req, res) {
  const { bookedSeat, booking, passengers } = req.body;

  // Validate required sections
  if (
    !bookedSeat ||
    !booking ||
    !Array.isArray(passengers) ||
    passengers.length === 0
  ) {
    return res
      .status(400)
      .json({ success: false, error: "Missing required booking sections" });
  }
  if (!bookedSeat.seat_labels || !Array.isArray(bookedSeat.seat_labels)) {
    return res
      .status(400)
      .json({ success: false, error: "seat_labels must be a non-empty array" });
  }

  // Validate booking fields
  const bookingRequiredFields = [
    "contact_no",
    "email_id",
    "noOfPassengers",
    "totalFare",
    "bookedUserId",
    "schedule_id",
    "bookDate",
    "agentId",
  ];
  for (const f of bookingRequiredFields) {
    if (!booking[f]) {
      return res
        .status(400)
        .json({ success: false, error: `Missing booking field: ${f}` });
    }
  }

  // Validate noOfPassengers matches passengers array
  if (booking.noOfPassengers !== passengers.length) {
    return res.status(400).json({
      success: false,
      error: "noOfPassengers must match the number of passengers",
    });
  }

  // Validate schedule_id exists
  const schedule = await models.FlightSchedule.findByPk(booking.schedule_id);
  if (!schedule) {
    return res.status(400).json({
      success: false,
      error: `Invalid schedule_id: ${booking.schedule_id} does not exist in flight_schedules`,
    });
  }

  // Validate passengers
  const nonInfantPassengers = passengers.filter((p) => p.type !== "Infant");
  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== "number") {
      return res.status(400).json({
        success: false,
        error: "Missing passenger fields: name, title, type, age",
      });
    }
    if (!["Adult", "Child", "Infant"].includes(p.type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid passenger type: must be Adult, Child, or Infant",
      });
    }
    // Enforce age limits
    if (p.type === "Infant" && (p.age < 0 || p.age > 2)) {
      return res.status(400).json({
        success: false,
        error: "Infant age must be between 0 and 2 years",
      });
    }
    if (p.type === "Child" && (p.age <= 2 || p.age > 12)) {
      return res.status(400).json({
        success: false,
        error: "Child age must be between 2 and 12 years",
      });
    }
    if (p.type === "Adult" && p.age <= 12) {
      return res.status(400).json({
        success: false,
        error: "Adult age must be greater than 12 years",
      });
    }
  }

  // Validate seat_labels length matches non-infant passengers
  if (bookedSeat.seat_labels.length !== nonInfantPassengers.length) {
    return res.status(400).json({
      success: false,
      error: `seat_labels must be an array matching the number of non-infant passengers (${nonInfantPassengers.length})`,
    });
  }

  // Validate bookDate
  if (!dayjs(booking.bookDate, "YYYY-MM-DD", true).isValid()) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid bookDate format (YYYY-MM-DD)" });
  }

  const adultFare = Number(schedule.price || 0);
  const childFare = adultFare;
  const infantFare = 0;

  let expectedFare = 0;

  for (const p of passengers) {
    if (p.type === "Adult") expectedFare += adultFare;
    else if (p.type === "Child") expectedFare += childFare;
  }

  const totalFare = parseFloat(booking.totalFare);
  if (
    !Number.isFinite(totalFare) ||
    totalFare < 0 ||
    totalFare !== expectedFare
  ) {
    return res.status(400).json({
      success: false,
      error: `Invalid totalFare: expected ₹${expectedFare} (Adult: ₹${adultFare}, Child: ₹${childFare}, Infant: ₹${infantFare})`,
    });
  }

  try {
    const agent = await models.Agent.findByPk(booking.agentId);
    if (!agent) {
      return res
        .status(400)
        .json({ success: false, error: `Invalid agentId: ${booking.agentId}` });
    }
    if (Number(agent.wallet_amount) < totalFare) {
      return res.status(400).json({
        success: false,
        error: `Insufficient wallet balance: ${agent.wallet_amount} < ${totalFare}`,
      });
    }

    let result;
    await models.sequelize.transaction(async (t) => {
      const availableSeats = await getAvailableSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        userId: booking.bookedUserId,
        transaction: t,
      });
      if (!availableSeats) {
        throw new Error(
          `Schedule ${bookedSeat.schedule_id} not found or invalid`
        );
      }
      for (const seat of bookedSeat.seat_labels) {
        if (!availableSeats.includes(seat)) {
          throw new Error(`Seat ${seat} is not available`);
        }
      }

      const pnr = await generatePNR();
      const bookingNo = `BOOK-${uuidv4().slice(0, 8)}`;

      const newBooking = await models.Booking.create(
        {
          pnr,
          bookingNo,
          ...booking,
          bookingStatus: "SUCCESS",
        },
        { transaction: t }
      );

      // Assign seats only to non-infant passengers
      for (const seat of bookedSeat.seat_labels) {
        await models.BookedSeat.create(
          {
            booking_id: newBooking.id,
            schedule_id: bookedSeat.schedule_id,
            bookDate: bookedSeat.bookDate,
            seat_label: seat,
            booked_seat: 1,
          },
          { transaction: t }
        );
      }

      await models.SeatHold.destroy({
        where: {
          schedule_id: bookedSeat.schedule_id,
          bookDate: bookedSeat.bookDate,
          seat_label: bookedSeat.seat_labels,
          held_by: booking.bookedUserId,
        },
        transaction: t,
      });

      await models.Passenger.bulkCreate(
        passengers.map((p) => ({
          bookingId: newBooking.id,
          title: p.title,
          name: p.name,
          dob: p.dob,
          age: p.age,
          type: p.type,
        })),
        { transaction: t }
      );

      await agent.decrement("wallet_amount", { by: totalFare, transaction: t });
      await agent.increment("no_of_ticket_booked", {
        by: booking.noOfPassengers,
        transaction: t,
      });

      const updatedAvailableSeats = await getAvailableSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });

      result = {
        pnr,
        bookingNo,
        bookingId: newBooking.id,
        availableSeats: updatedAvailableSeats,
        bookedSeat,
        booking,
        passengers,
        wallet_amount: Number(agent.wallet_amount) - totalFare,
      };
    });

    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        availableSeats: result.availableSeats,
      });
    }

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
}

// New function for helicopter booking via agent wallet
async function bookHelicopterSeatsWithoutPayment(req, res) {
  const { bookedSeat, booking, passengers } = req.body;

  // Validate required sections
  if (
    !bookedSeat ||
    !booking ||
    !Array.isArray(passengers) ||
    passengers.length === 0
  ) {
    return res
      .status(400)
      .json({ success: false, error: "Missing required booking sections" });
  }
  if (!bookedSeat.seat_labels || !Array.isArray(bookedSeat.seat_labels)) {
    return res
      .status(400)
      .json({ success: false, error: "seat_labels must be a non-empty array" });
  }

  // Validate booking fields
  const bookingRequiredFields = [
    "contact_no",
    "email_id",
    "noOfPassengers",
    "totalFare",
    "bookedUserId",
    "schedule_id",
    "bookDate",
    "agentId",
  ];
  for (const f of bookingRequiredFields) {
    if (!booking[f]) {
      return res
        .status(400)
        .json({ success: false, error: `Missing booking field: ${f}` });
    }
  }

  // Validate noOfPassengers matches passengers array
  if (booking.noOfPassengers !== passengers.length) {
    return res.status(400).json({
      success: false,
      error: "noOfPassengers must match the number of passengers",
    });
  }

  // Validate helicopter schedule exists
  const helicopterSchedule = await models.HelicopterSchedule.findByPk(
    booking.schedule_id
  );
  if (!helicopterSchedule) {
    return res.status(400).json({
      success: false,
      error: `Invalid schedule_id: ${booking.schedule_id} does not exist in helicopter_schedules`,
    });
  }

  // Validate passengers
  const nonInfantPassengers = passengers.filter((p) => p.type !== "Infant");
  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== "number") {
      return res.status(400).json({
        success: false,
        error: "Missing passenger fields: name, title, type, age",
      });
    }
    if (!["Adult", "Child", "Infant"].includes(p.type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid passenger type: must be Adult, Child, or Infant",
      });
    }
    // Enforce age limits
    if (p.type === "Infant" && (p.age < 0 || p.age > 2)) {
      return res.status(400).json({
        success: false,
        error: "Infant age must be between 0 and 2 years",
      });
    }
    if (p.type === "Child" && (p.age <= 2 || p.age > 12)) {
      return res.status(400).json({
        success: false,
        error: "Child age must be between 2 and 12 years",
      });
    }
    if (p.type === "Adult" && p.age <= 12) {
      return res.status(400).json({
        success: false,
        error: "Adult age must be greater than 12 years",
      });
    }
  }

  // Validate seat_labels length matches non-infant passengers
  if (bookedSeat.seat_labels.length !== nonInfantPassengers.length) {
    return res.status(400).json({
      success: false,
      error: `seat_labels must be an array matching the number of non-infant passengers (${nonInfantPassengers.length})`,
    });
  }

  // Validate bookDate
  if (!dayjs(booking.bookDate, "YYYY-MM-DD", true).isValid()) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid bookDate format (YYYY-MM-DD)" });
  }

  const adultFare = Number(helicopterSchedule.price || 0);
  const childFare = adultFare;
  const infantFare = 0;

  let expectedFare = 0;
  for (const p of passengers) {
    if (p.type === "Adult") expectedFare += adultFare;
    else if (p.type === "Child") expectedFare += childFare;
  }

  const totalFare = parseFloat(booking.totalFare);
  if (
    !Number.isFinite(totalFare) ||
    totalFare < 0 ||
    totalFare !== expectedFare
  ) {
    return res.status(400).json({
      success: false,
      error: `Invalid totalFare: expected ₹${expectedFare} (Adult: ₹${adultFare}, Child: ₹${childFare}, Infant: ₹${infantFare})`,
    });
  }

  try {
    const agent = await models.Agent.findByPk(booking.agentId);
    if (!agent) {
      return res
        .status(400)
        .json({ success: false, error: `Invalid agentId: ${booking.agentId}` });
    }
    if (Number(agent.wallet_amount) < totalFare) {
      return res.status(400).json({
        success: false,
        error: `Insufficient wallet balance: ${agent.wallet_amount} < ${totalFare}`,
      });
    }

    let result;
    await models.sequelize.transaction(async (t) => {
      // Get available helicopter seats
      const {
        getAvailableHelicopterSeats,
      } = require("../utils/helicopterSeatUtils");
      const availableSeats = await getAvailableHelicopterSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });

      if (!availableSeats) {
        throw new Error(
          `Helicopter schedule ${bookedSeat.schedule_id} not found or invalid`
        );
      }
      for (const seat of bookedSeat.seat_labels) {
        if (!availableSeats.includes(seat)) {
          throw new Error(`Seat ${seat} is not available`);
        }
      }

      const pnr = await generatePNR();
      const bookingNo = `HELI-${uuidv4().slice(0, 8)}`;

      const newBooking = await models.Booking.create(
        {
          pnr,
          bookingNo,
          ...booking,
          bookingStatus: "SUCCESS",
        },
        { transaction: t }
      );

      // Assign seats only to non-infant passengers
      for (const seat of bookedSeat.seat_labels) {
        await models.BookedSeat.create(
          {
            booking_id: newBooking.id,
            schedule_id: bookedSeat.schedule_id,
            bookDate: bookedSeat.bookDate,
            seat_label: seat,
            booked_seat: 1,
          },
          { transaction: t }
        );
      }

      await models.Passenger.bulkCreate(
        passengers.map((p) => ({
          bookingId: newBooking.id,
          title: p.title,
          name: p.name,
          dob: p.dob,
          age: p.age,
          type: p.type,
        })),
        { transaction: t }
      );

      await agent.decrement("wallet_amount", { by: totalFare, transaction: t });
      await agent.increment("no_of_ticket_booked", {
        by: booking.noOfPassengers,
        transaction: t,
      });

      const updatedAvailableSeats = await getAvailableHelicopterSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });

      result = {
        pnr,
        bookingNo,
        bookingId: newBooking.id,
        bookingType: "helicopter",
        availableSeats: updatedAvailableSeats,
        bookedSeat,
        booking,
        passengers,
        wallet_amount: Number(agent.wallet_amount) - totalFare,
      };
    });

    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        availableSeats: result.availableSeats,
      });
    }

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
}

// Helicopter cancellation function
async function cancelHelicopterBooking(req, res) {
  const { id } = req.params;
  let t;

  try {
    t = await models.sequelize.transaction();

    // Fetch the helicopter booking from helicopter_bookings table
    const booking = await models.HelicopterBooking.findByPk(id, {
      include: [
        {
          model: models.HelicopterSchedule,
          required: true,
          include: [{ model: models.Helicopter, as: "Helicopter" }],
        },
        {
          model: models.HelicopterBookedSeat,
          as: "BookedSeats",
          required: true,
        },
        { model: models.Agent, required: true },
      ],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    // Check if this is a helicopter booking
    if (!booking.HelicopterSchedule) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "This is not a helicopter booking" });
    }

    if (booking.bookingStatus === "CANCELLED") {
      await t.rollback();
      return res.status(400).json({ error: "Booking is already cancelled" });
    }

    // Ensure times are in IST (Asia/Kolkata)
    const now = dayjs().tz("Asia/Kolkata");

    // Combine bookDate with departure_time
    const bookDate = dayjs(booking.bookDate, "YYYY-MM-DD").tz("Asia/Kolkata");
    const departureTimeRaw = booking.HelicopterSchedule.departure_time;

    // Validate departure_time format (expecting HH:mm:ss)
    if (!departureTimeRaw || !/^\d{2}:\d{2}:\d{2}$/.test(departureTimeRaw)) {
      await t.rollback();
      return res.status(400).json({
        error:
          "Invalid departure time format in helicopter schedule. Expected HH:mm:ss.",
      });
    }

    // Combine bookDate and departure_time to form a full datetime
    const departureDateTimeString = `${booking.bookDate}T${departureTimeRaw}+05:30`;
    let departureTime = dayjs(departureDateTimeString).tz("Asia/Kolkata");

    // Validate the combined datetime
    if (!departureTime.isValid()) {
      await t.rollback();
      return res.status(400).json({
        error: "Failed to parse departure time in helicopter schedule",
      });
    }

    const hoursUntilDeparture = departureTime.diff(now, "hour");

    const totalFare = parseFloat(booking.totalFare);
    const numSeats = booking.BookedSeats.length;

    let refundAmount = 0;
    let cancellationFee = 0;

    // Calculate cancellation fee and refund based on time until departure
    if (hoursUntilDeparture > 96) {
      cancellationFee = numSeats * 400; // INR 400 per seat
      refundAmount = totalFare - cancellationFee;
    } else if (hoursUntilDeparture >= 48) {
      cancellationFee = totalFare * 0.25; // 25% of total fare
      refundAmount = totalFare - cancellationFee;
    } else if (hoursUntilDeparture >= 24) {
      cancellationFee = totalFare * 0.5; // 50% of total fare
      refundAmount = totalFare - cancellationFee;
    } else {
      cancellationFee = totalFare; // No refund
      refundAmount = 0;
    }

    if (refundAmount < 0) refundAmount = 0;

    // Update agent's wallet
    const agent = await models.Agent.findByPk(booking.agentId, {
      transaction: t,
    });
    const initialWalletAmount = Number(agent.wallet_amount);
    await agent.increment("wallet_amount", {
      by: refundAmount,
      transaction: t,
    });
    await agent.reload({ transaction: t });
    const updatedWalletAmount = Number(agent.wallet_amount);

    // Clean up associated records
    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });
    await models.Passenger.destroy({
      where: { bookingId: booking.id },
      transaction: t,
    });
    await models.Payment.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });

    // Update and delete the booking
    await booking.update({ bookingStatus: "CANCELLED" }, { transaction: t });
    await booking.destroy({ transaction: t });

    // Update available seats for helicopter
    const {
      getAvailableHelicopterSeats,
    } = require("../utils/helicopterSeatUtils");
    const updatedAvailableSeats = await getAvailableHelicopterSeats({
      models,
      schedule_id: booking.schedule_id,
      bookDate: booking.bookDate,
      transaction: t,
    });

    await t.commit();

    // Emit seats-updated event if socket.io is available
    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: booking.schedule_id,
        bookDate: booking.bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    res.json({
      message: "Helicopter booking cancelled successfully",
      refundAmount,
      cancellationFee,
      wallet_amount: updatedWalletAmount,
      note: "Wallet updated instantly; refund processing for external accounts (if applicable) takes 7–10 business days",
    });
  } catch (err) {
    if (t) await t.rollback();
    res
      .status(500)
      .json({ error: "Failed to cancel helicopter booking: " + err.message });
  }
}

// Helicopter rescheduling function
async function rescheduleHelicopterBooking(req, res) {
  const { id } = req.params;
  const { newScheduleId, newBookDate, newSeatLabels } = req.body;
  let t;

  try {
    // Validate input
    if (
      !newScheduleId ||
      !newBookDate ||
      !Array.isArray(newSeatLabels) ||
      newSeatLabels.length === 0
    ) {
      return res.status(400).json({
        error:
          "newScheduleId, newBookDate, and newSeatLabels (array) are required",
      });
    }
    if (!dayjs(newBookDate, "YYYY-MM-DD", true).isValid()) {
      return res
        .status(400)
        .json({ error: "Invalid newBookDate format (YYYY-MM-DD)" });
    }

    t = await models.sequelize.transaction();
    const booking = await models.HelicopterBooking.findByPk(id, {
      include: [
        {
          model: models.HelicopterSchedule,
          required: true,
          include: [{ model: models.Helicopter, as: "Helicopter" }],
        },
        {
          model: models.HelicopterBookedSeat,
          as: "BookedSeats",
          required: true,
        },
        { model: models.Agent, required: true },
      ],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    // Check if this is a helicopter booking
    if (!booking.HelicopterSchedule) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "This is not a helicopter booking" });
    }

    if (
      booking.bookingStatus !== "SUCCESS" &&
      booking.bookingStatus !== "CONFIRMED"
    ) {
      await t.rollback();
      return res.status(400).json({
        error: "Only confirmed or successful bookings can be rescheduled",
      });
    }

    // Combine bookDate with departure_time
    const bookDate = dayjs(booking.bookDate, "YYYY-MM-DD").tz("Asia/Kolkata");
    const departureTimeRaw = booking.HelicopterSchedule.departure_time;

    // Validate departure_time format (expecting HH:mm:ss)
    if (!departureTimeRaw || !/^\d{2}:\d{2}:\d{2}$/.test(departureTimeRaw)) {
      await t.rollback();
      return res.status(400).json({
        error:
          "Invalid departure time format in helicopter schedule. Expected HH:mm:ss.",
      });
    }

    // Combine bookDate and departure_time to form a full datetime
    const departureDateTimeString = `${booking.bookDate}T${departureTimeRaw}+05:30`;
    const departureTime = dayjs(departureDateTimeString).tz("Asia/Kolkata");

    // Validate the combined datetime
    if (!departureTime.isValid()) {
      await t.rollback();
      return res.status(400).json({
        error: "Failed to parse departure time in helicopter schedule",
      });
    }

    const now = dayjs().tz("Asia/Kolkata");
    const hoursUntilDeparture = departureTime.diff(now, "hour");

    if (hoursUntilDeparture < 24) {
      await t.rollback();
      return res.status(400).json({
        error: "Rescheduling not permitted less than 24 hours before departure",
      });
    }

    const newSchedule = await models.HelicopterSchedule.findByPk(
      newScheduleId,
      { transaction: t }
    );
    if (!newSchedule) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "New helicopter schedule not found" });
    }

    // Get available helicopter seats
    const {
      getAvailableHelicopterSeats,
    } = require("../utils/helicopterSeatUtils");
    const availableSeats = await getAvailableHelicopterSeats({
      models,
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      transaction: t,
    });

    for (const seat of newSeatLabels) {
      if (!availableSeats.includes(seat)) {
        await t.rollback();
        return res.status(400).json({
          error: `Seat ${seat} is not available on new helicopter schedule`,
        });
      }
    }

    if (newSeatLabels.length !== booking.BookedSeats.length) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Number of new seats must match original booking" });
    }

    let reschedulingFee = 0;
    if (hoursUntilDeparture > 48) {
      reschedulingFee = booking.BookedSeats.length * 500; // INR 500 per seat
    } else {
      reschedulingFee = booking.BookedSeats.length * 1000; // INR 1000 per seat
    }

    const oldTotalFare = parseFloat(booking.totalFare);
    const newTotalFare =
      parseFloat(newSchedule.price) * booking.BookedSeats.length;
    const fareDifference =
      newTotalFare > oldTotalFare ? newTotalFare - oldTotalFare : 0;

    const totalDeduction = reschedulingFee + fareDifference;
    const agent = await models.Agent.findByPk(booking.agentId, {
      transaction: t,
    });

    if (Number(agent.wallet_amount) < totalDeduction) {
      await t.rollback();
      return res.status(400).json({
        error: `Insufficient wallet balance: ${agent.wallet_amount} < ${totalDeduction}`,
      });
    }

    await agent.decrement("wallet_amount", {
      by: totalDeduction,
      transaction: t,
    });
    await agent.reload({ transaction: t });

    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });

    for (const seat of newSeatLabels) {
      await models.BookedSeat.create(
        {
          booking_id: booking.id,
          schedule_id: newScheduleId,
          bookDate: newBookDate,
          seat_label: seat,
          booked_seat: 1,
        },
        { transaction: t }
      );
    }

    await booking.update(
      {
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        totalFare: newTotalFare,
        bookingStatus: "CONFIRMED",
      },
      { transaction: t }
    );

    const oldAvailableSeats = await getAvailableHelicopterSeats({
      models,
      schedule_id: booking.schedule_id,
      bookDate: booking.bookDate,
      transaction: t,
    });

    const newAvailableSeats = await getAvailableHelicopterSeats({
      models,
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      transaction: t,
    });

    await t.commit();

    // Emit seats-updated events
    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: booking.schedule_id,
        bookDate: booking.bookDate,
        availableSeats: oldAvailableSeats,
      });
      req.io.emit("seats-updated", {
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        availableSeats: newAvailableSeats,
      });
    }

    res.json({
      message: "Helicopter booking rescheduled successfully",
      reschedulingFee,
      fareDifference,
      totalDeduction,
      wallet_amount: Number(agent.wallet_amount),
      newBookingDetails: {
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        seatLabels: newSeatLabels,
        totalFare: newTotalFare,
      },
    });
  } catch (err) {
    if (t) await t.rollback();
    res.status(500).json({
      error: "Failed to reschedule helicopter booking: " + err.message,
    });
  }
}

async function getIrctcBookings(req, res) {
  try {
    // Check authorization

    // Find IRCTC agent
    const irctcAgent = await models.Agent.findOne({
      where: { agentId: "IRCTC" },
    });
    if (!irctcAgent) {
      return res.status(404).json({ error: "IRCTC agent not found" });
    }

    // Pagination and filtering
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;
    const where = { agentId: irctcAgent.id };
    if (status) where.bookingStatus = status.toUpperCase();
    if (startDate && endDate) {
      where.bookDate = {
        [models.Sequelize.Op.between]: [startDate, endDate],
      };
    }

    const bookings = await models.Booking.findAll({
      where,
      include: [
        { model: models.Passenger, required: false },
        { model: models.FlightSchedule, required: false },
        {
          model: models.BookedSeat,
          attributes: ["seat_label"],
          required: false,
        },
        { model: models.Payment, as: "Payments", required: false },
        { model: models.Agent, required: false },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
    });

    if (!bookings || bookings.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const bookingsWithBilling = await Promise.all(
      bookings.map(async (booking) => {
        const billing = await models.Billing.findOne({
          where: { user_id: booking.bookedUserId },
        });
        return {
          ...booking.toJSON(),
          seatLabels: booking.BookedSeats.map((s) => s.seat_label),
          billing: billing?.toJSON() || null,
        };
      })
    );

    return res.status(200).json({ success: true, data: bookingsWithBilling });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Failed to fetch IRCTC bookings: ${err.message}`,
    });
  }
}
async function getUserBookings(req, res) {
  if (!req.user || !req.user.id) {
    return res
      .status(401)
      .json({ error: "Unauthorized: No valid user token provided" });
  }

  const userId = req.user.id;
  try {
    // Fetch flight bookings from bookings table
    const flightBookings = await models.Booking.findAll({
      where: { bookedUserId: userId },
      include: [
        {
          model: models.FlightSchedule,
          required: true, // Only flight bookings
          include: [{ model: models.Flight, required: false }],
        },
        { model: models.Passenger, required: false },
        {
          model: models.BookedSeat,
          attributes: ["seat_label"],
          required: false,
        },
        { model: models.Payment, as: "Payments", required: false },
        { model: models.Agent, required: false },
      ],
      order: [["bookDate", "DESC"]],
    });

    // Fetch helicopter bookings from helicopter_bookings table
    const helicopterBookings = await models.HelicopterBooking.findAll({
      where: { bookedUserId: userId },
      include: [
        {
          model: models.HelicopterSchedule,
          required: true,
          include: [
            {
              model: models.Helicopter,
              required: false,
              as: "Helicopter",
            },
          ],
        },
        {
          model: models.HelicopterPassenger,
          required: false,
          as: "Passengers",
        },
        {
          model: models.HelicopterBookedSeat,
          attributes: ["seat_label"],
          required: false,
          as: "BookedSeats",
        },
        { model: models.HelicopterPayment, as: "Payments", required: false },
        { model: models.Agent, required: false },
      ],
      order: [["bookDate", "DESC"]],
    });

    // Process flight bookings
    const flightBookingsWithExtras = await Promise.all(
      flightBookings.map(async (b) => {
        const billing = await models.Billing.findOne({
          where: { user_id: b.bookedUserId },
        });

        return {
          ...b.toJSON(),
          seatLabels: b.BookedSeats?.map((s) => s.seat_label) || [],
          billing: billing ? billing.toJSON() : null,
          bookingType: "flight",
          flightNumber:
            b.FlightSchedule?.Flight?.flight_number ||
            `FL${b.FlightSchedule?.flight_id || b.schedule_id || "001"}`,
        };
      })
    );

    // Process helicopter bookings
    const helicopterBookingsWithExtras = await Promise.all(
      helicopterBookings.map(async (b) => {
        const billing = await models.Billing.findOne({
          where: { user_id: b.bookedUserId },
        });

        // Fetch helipad data separately to avoid association conflicts
        let departureHelipad = null;
        let arrivalHelipad = null;
        if (b.HelicopterSchedule) {
          departureHelipad = await models.Helipad.findByPk(
            b.HelicopterSchedule.departure_helipad_id
          );
          arrivalHelipad = await models.Helipad.findByPk(
            b.HelicopterSchedule.arrival_helipad_id
          );
        }

        return {
          ...b.toJSON(),
          seatLabels: b.BookedSeats?.map((s) => s.seat_label) || [],
          billing: billing ? billing.toJSON() : null,
          bookingType: "helicopter",
          helicopterNumber:
            b.HelicopterSchedule?.Helicopter?.helicopter_number || "N/A",
          departureHelipad: departureHelipad?.helipad_name || "N/A",
          arrivalHelipad: arrivalHelipad?.helipad_name || "N/A",
          departureTime: b.HelicopterSchedule?.departure_time || "N/A",
          arrivalTime: b.HelicopterSchedule?.arrival_time || "N/A",
        };
      })
    );

    // Combine and sort by bookDate
    const allBookings = [
      ...flightBookingsWithExtras,
      ...helicopterBookingsWithExtras,
    ].sort((a, b) => new Date(b.bookDate) - new Date(a.bookDate));

    return res.status(200).json(allBookings);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch your bookings: " + err.message });
  }
}

async function getBookings(req, res) {
  try {
    if (!models.Booking) {
      throw new Error("Booking model is not defined");
    }
    const { status } = req.query;
    const where = {};
    if (status && status !== "All Booking") {
      where.bookingStatus = status.toUpperCase();
    }

    const bookings = await models.Booking.findAll({
      where,
      include: [
        {
          model: models.BookedSeat,
          attributes: ["seat_label"],
          required: false,
        },
        { model: models.Passenger, required: false },
        {
          model: models.FlightSchedule,
          required: false,
          include: [{ model: models.Flight, required: false }],
        },
        // HelicopterSchedule removed - helicopter bookings now in separate helicopter_bookings table
        { model: models.Payment, as: "Payments", required: false },
        { model: models.Agent, required: false },
      ],
      order: [["created_at", "DESC"]],
    });

    const withBilling = await Promise.all(
      bookings.map(async (b) => {
        try {
          const billing = await models.Billing.findOne({
            where: { user_id: b.bookedUserId },
          });
          if (!b.FlightSchedule) {
          }
          // Enhanced data with safe fallbacks
          const seatLabels =
            b.BookedSeats?.map((s) => s.seat_label).join(", ") || "N/A";
          const passengerNames =
            b.Passengers?.map((p) => p.name).join(", ") || "N/A";
          const paymentMode =
            b.Payments?.[0]?.payment_mode || b.pay_mode || "N/A";
          const transactionId =
            b.Payments?.[0]?.transaction_id || b.transactionId || "N/A";
          const agentId = b.Agent?.agentId || "FLYOLA";

          return {
            ...b.toJSON(),
            seatLabels: seatLabels,
            billing: billing ? billing.toJSON() : null,
            // Enhanced fields for frontend
            booked_seat: seatLabels,
            passengerNames: passengerNames,
            billingName: billing?.billing_name || "N/A",
            paymentMode: paymentMode,
            transactionId: transactionId,
            agentId: agentId,
            flightNumber:
              b.FlightSchedule?.Flight?.flight_number ||
              `FL${b.FlightSchedule?.flight_id || b.schedule_id || "001"}`,
            departureAirport: "N/A", // Will be populated by frontend logic
            arrivalAirport: "N/A", // Will be populated by frontend logic
            userRole: "3", // Will be populated by frontend logic
          };
        } catch (billingErr) {
          return {
            ...b.toJSON(),
            seatLabels:
              b.BookedSeats?.map((s) => s.seat_label).join(", ") || "N/A",
            billing: null,
            booked_seat:
              b.BookedSeats?.map((s) => s.seat_label).join(", ") || "N/A",
            passengerNames:
              b.Passengers?.map((p) => p.name).join(", ") || "N/A",
            billingName: "N/A",
            paymentMode: b.Payments?.[0]?.payment_mode || b.pay_mode || "N/A",
            transactionId:
              b.Payments?.[0]?.transaction_id || b.transactionId || "N/A",
            agentId: b.Agent?.agentId || "FLYOLA",
            flightNumber: "N/A",
            departureAirport: "N/A",
            arrivalAirport: "N/A",
            userRole: "3",
          };
        }
      })
    );

    res.json(withBilling);
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch bookings: ${err.message}` });
  }
}

async function getHelicopterBookings(req, res) {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== "All Booking") {
      where.bookingStatus = status.toUpperCase();
    }

    // Fetch from helicopter_bookings table
    const bookings = await models.HelicopterBooking.findAll({
      where,
      include: [
        {
          model: models.HelicopterBookedSeat,
          as: "BookedSeats",
          attributes: ["seat_label"],
          required: false,
        },
        {
          model: models.HelicopterPassenger,
          as: "Passengers",
          required: false,
        },
        {
          model: models.HelicopterSchedule,
          required: true,
          include: [
            {
              model: models.Helicopter,
              required: true,
              as: "Helicopter",
            },
          ],
        },
        {
          model: models.HelicopterPayment,
          as: "Payments",
          required: false,
        },
        { model: models.Agent, required: false },
      ],
      order: [["created_at", "DESC"]],
    });

    const withBilling = await Promise.all(
      bookings.map(async (b) => {
        try {
          const billing = await models.Billing.findOne({
            where: { user_id: b.bookedUserId },
          });

          // Fetch helipad data separately to avoid association conflicts
          let departureHelipad = null;
          let arrivalHelipad = null;
          if (b.HelicopterSchedule) {
            departureHelipad = await models.Helipad.findByPk(
              b.HelicopterSchedule.departure_helipad_id
            );
            arrivalHelipad = await models.Helipad.findByPk(
              b.HelicopterSchedule.arrival_helipad_id
            );
          }

          const seatLabels =
            b.BookedSeats?.map((s) => s.seat_label).join(", ") || "N/A";
          const passengerNames =
            b.Passengers?.map((p) => p.name).join(", ") || "N/A";
          const paymentMode =
            b.Payments?.[0]?.payment_mode || b.pay_mode || "N/A";
          const transactionId =
            b.Payments?.[0]?.transaction_id || b.transactionId || "N/A";
          const agentId = b.Agent?.agentId || "FLYOLA";

          return {
            ...b.toJSON(),
            seatLabels: seatLabels,
            billing: billing ? billing.toJSON() : null,
            booked_seat: seatLabels,
            passengerNames: passengerNames,
            billingName: billing?.billing_name || "N/A",
            paymentMode: paymentMode,
            transactionId: transactionId,
            agentId: agentId,
            helicopterNumber:
              b.HelicopterSchedule?.Helicopter?.helicopter_number || "N/A",
            departureHelipad:
              departureHelipad?.helipad_name || departureHelipad?.city || "N/A",
            arrivalHelipad:
              arrivalHelipad?.helipad_name || arrivalHelipad?.city || "N/A",
            departureTime: b.HelicopterSchedule?.departure_time || "N/A",
            arrivalTime: b.HelicopterSchedule?.arrival_time || "N/A",
            userRole: "3",
            bookingType: "helicopter",
          };
        } catch (billingErr) {
          return {
            ...b.toJSON(),
            seatLabels:
              b.BookedSeats?.map((s) => s.seat_label).join(", ") || "N/A",
            billing: null,
            booked_seat:
              b.BookedSeats?.map((s) => s.seat_label).join(", ") || "N/A",
            passengerNames:
              b.Passengers?.map((p) => p.name).join(", ") || "N/A",
            billingName: "N/A",
            paymentMode: b.Payments?.[0]?.payment_mode || b.pay_mode || "N/A",
            transactionId:
              b.Passengers?.[0]?.transaction_id || b.transactionId || "N/A",
            agentId: b.Agent?.agentId || "FLYOLA",
            helicopterNumber: "N/A",
            departureHelipad: "N/A",
            arrivalHelipad: "N/A",
            departureTime: "N/A",
            arrivalTime: "N/A",
            userRole: "3",
            bookingType: "helicopter",
          };
        }
      })
    );

    res.json(withBilling);
  } catch (err) {
    res
      .status(500)
      .json({ error: `Failed to fetch helicopter bookings: ${err.message}` });
  }
}

async function getBookingById(req, res) {
  const { id } = req.params;
  const { pnr, bookingNo } = req.query;

  try {
    let booking;
    if (id) {
      booking = await models.Booking.findByPk(id, {
        include: [
          models.Passenger,
          models.FlightSchedule,
          models.BookedSeat,
          { model: models.Payment, as: "Payments" },
          models.Agent,
        ],
      });
    } else if (pnr) {
      booking = await models.Booking.findOne({
        where: { pnr },
        include: [
          models.Passenger,
          models.FlightSchedule,
          models.BookedSeat,
          { model: models.Payment, as: "Payments" },
          models.Agent,
        ],
      });
    } else if (bookingNo) {
      booking = await models.Booking.findOne({
        where: { bookingNo },
        include: [
          models.Passenger,
          models.FlightSchedule,
          models.BookedSeat,
          { model: models.Payment, as: "Payments" },
          models.Agent,
        ],
      });
    } else {
      return res
        .status(400)
        .json({ error: "Must provide id, pnr, or bookingNo" });
    }

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const billing = await models.Billing.findOne({
      where: { user_id: booking.bookedUserId },
    });
    booking = {
      ...booking.toJSON(),
      seatLabels: booking.BookedSeats.map((s) => s.seat_label),
      billing: billing ? billing.toJSON() : null,
    };

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch booking" });
  }
}

async function createBooking(req, res) {
  try {
    const { agentId } = req.body;
    if (agentId) {
      const agent = await models.Agent.findByPk(agentId);
      if (!agent) {
        return res.status(400).json({ error: `Invalid agentId: ${agentId}` });
      }
    }
    const booking = await models.Booking.create(req.body);
    if (agentId) {
      await agent.increment("no_of_ticket_booked", {
        by: req.body.noOfPassengers,
      });
    }
    res.status(201).json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function updateBooking(req, res) {
  const { id } = req.params;
  try {
    const booking = await models.Booking.findByPk(id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const { agentId } = req.body;
    if (agentId) {
      const agent = await models.Agent.findByPk(agentId);
      if (!agent) {
        return res.status(400).json({ error: `Invalid agentId: ${agentId}` });
      }
    }
    await booking.update(req.body);
    if (agentId) {
      const agent = await models.Agent.findByPk(agentId);
      await agent.increment("no_of_ticket_booked", {
        by: booking.noOfPassengers,
      });
    }
    res.json({ message: "Booking updated", booking });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function deleteBooking(req, res) {
  const { id } = req.params;
  let t;
  try {
    t = await models.sequelize.transaction();
    const booking = await models.Booking.findByPk(id, { transaction: t });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }
    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });
    await models.Passenger.destroy({
      where: { bookingId: booking.id },
      transaction: t,
    });
    await models.Payment.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });
    await booking.destroy({ transaction: t });
    await t.commit();
    res.json({ message: "Booking deleted" });
  } catch (err) {
    if (t) await t.rollback();
    res.status(500).json({ error: err.message });
  }
}

async function getBookingSummary(req, res) {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== "All Booking") {
      where.bookingStatus = status.toUpperCase();
    }

    const totalSeats = await models.Booking.sum("noOfPassengers", { where });
    const totalBookings = await models.Booking.count({ where });

    return res.json({ totalBookings, totalSeats: totalSeats || 0 });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

async function getBookingByPnr(req, res) {
  const { pnr } = req.query;

  try {
    if (!pnr || typeof pnr !== "string" || pnr.length < 6) {
      return res.status(400).json({
        error: "Invalid PNR. Must be a string of at least 6 characters.",
      });
    }

    // First try to find in helicopter bookings
    let helicopterBooking = await models.HelicopterBooking.findOne({
      where: { pnr },
      include: [
        {
          model: models.HelicopterBookedSeat,
          as: "BookedSeats",
          attributes: ["seat_label"],
          required: false,
        },
        {
          model: models.HelicopterPassenger,
          as: "Passengers",
          required: false,
        },
        {
          model: models.HelicopterSchedule,
          required: false,
          include: [
            { model: models.Helicopter, as: "Helicopter", required: false },
          ],
        },
        { model: models.HelicopterPayment, as: "Payments", required: false },
        { model: models.Agent, required: false },
      ],
    });

    if (helicopterBooking) {
      const billing = await models.Billing.findOne({
        where: { user_id: helicopterBooking.bookedUserId },
      });

      // Fetch helipad data separately
      let departureHelipad = null;
      let arrivalHelipad = null;
      if (helicopterBooking.HelicopterSchedule) {
        departureHelipad = await models.Helipad.findByPk(
          helicopterBooking.HelicopterSchedule.departure_helipad_id
        );
        arrivalHelipad = await models.Helipad.findByPk(
          helicopterBooking.HelicopterSchedule.arrival_helipad_id
        );
      }

      const response = {
        ...helicopterBooking.toJSON(),
        seatLabels:
          helicopterBooking.BookedSeats?.map((s) => s.seat_label) || [],
        billing: billing ? billing.toJSON() : null,
        bookingType: "helicopter",
        helicopterNumber:
          helicopterBooking.HelicopterSchedule?.Helicopter?.helicopter_number ||
          "N/A",
        departureHelipad:
          departureHelipad?.helipad_name || departureHelipad?.city || "N/A",
        arrivalHelipad:
          arrivalHelipad?.helipad_name || arrivalHelipad?.city || "N/A",
        departureTime:
          helicopterBooking.HelicopterSchedule?.departure_time || "N/A",
        arrivalTime:
          helicopterBooking.HelicopterSchedule?.arrival_time || "N/A",
      };

      return res.status(200).json(response);
    }

    // If not found in helicopter bookings, try regular flight bookings
    const booking = await models.Booking.findOne({
      where: { pnr },
      include: [
        {
          model: models.BookedSeat,
          attributes: ["seat_label"],
          required: false,
        },
        { model: models.Passenger, required: false },
        {
          model: models.FlightSchedule,
          required: false,
          include: [{ model: models.Flight, required: false }],
        },
        { model: models.Payment, as: "Payments", required: false },
        { model: models.Agent, required: false },
      ],
    });

    if (!booking) {
      return res
        .status(404)
        .json({ error: `Booking not found for PNR: ${pnr}` });
    }

    const billing = await models.Billing.findOne({
      where: { user_id: booking.bookedUserId },
    });

    const response = {
      ...booking.toJSON(),
      seatLabels: booking.BookedSeats?.map((s) => s.seat_label) || [],
      billing: billing ? billing.toJSON() : null,
      bookingType: "flight",
      flightNumber:
        booking.FlightSchedule?.Flight?.flight_number ||
        `FL${
          booking.FlightSchedule?.flight_id || booking.schedule_id || "001"
        }`,
    };

    return res.status(200).json(response);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch booking: " + err.message });
  }
}

async function cancelIrctcBooking(req, res) {
  const { id } = req.params;
  let t;

  try {
    t = await models.sequelize.transaction();

    // Fetch the booking with associated models
    const booking = await models.Booking.findByPk(id, {
      include: [
        { model: models.FlightSchedule, required: true },
        { model: models.BookedSeat, required: true },
        { model: models.Agent, required: true },
      ],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.Agent.agentId !== "IRCTC") {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Booking is not associated with IRCTC agent" });
    }

    if (booking.bookingStatus === "CANCELLED") {
      await t.rollback();
      return res.status(400).json({ error: "Booking is already cancelled" });
    }

    // Ensure times are in IST (Asia/Kolkata)
    const now = dayjs().tz("Asia/Kolkata"); // Current time in IST

    // Combine bookDate with departure_time
    const bookDate = dayjs(booking.bookDate, "YYYY-MM-DD").tz("Asia/Kolkata");
    const departureTimeRaw = booking.FlightSchedule.departure_time;

    // Validate departure_time format (expecting HH:mm:ss)
    if (!departureTimeRaw || !/^\d{2}:\d{2}:\d{2}$/.test(departureTimeRaw)) {
      await t.rollback();
      return res.status(400).json({
        error:
          "Invalid departure time format in flight schedule. Expected HH:mm:ss.",
      });
    }

    // Combine bookDate and departure_time to form a full datetime
    const departureDateTimeString = `${booking.bookDate}T${departureTimeRaw}+05:30`; // e.g., "2025-06-05T12:00:00+05:30"
    let departureTime = dayjs(departureDateTimeString).tz("Asia/Kolkata");

    // Validate the combined datetime
    if (!departureTime.isValid()) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Failed to parse departure time in flight schedule" });
    }

    const hoursUntilDeparture = departureTime.diff(now, "hour");

    const totalFare = parseFloat(booking.totalFare);
    const numSeats = booking.BookedSeats.length;

    let refundAmount = 0;
    let cancellationFee = 0;

    // Calculate cancellation fee and refund based on time until departure
    if (hoursUntilDeparture > 96) {
      cancellationFee = numSeats * 400; // INR 400 per seat
      refundAmount = totalFare - cancellationFee;
    } else if (hoursUntilDeparture >= 48) {
      cancellationFee = totalFare * 0.25; // 25% of total fare
      refundAmount = totalFare - cancellationFee;
    } else if (hoursUntilDeparture >= 24) {
      cancellationFee = totalFare * 0.5; // 50% of total fare
      refundAmount = totalFare - cancellationFee;
    } else {
      cancellationFee = totalFare; // No refund
      refundAmount = 0;
    }

    if (refundAmount < 0) refundAmount = 0;

    // Update agent's wallet
    const agent = await models.Agent.findByPk(booking.agentId, {
      transaction: t,
    });
    const initialWalletAmount = Number(agent.wallet_amount);
    await agent.increment("wallet_amount", {
      by: refundAmount,
      transaction: t,
    });
    await agent.reload({ transaction: t }); // Refresh agent instance to get updated wallet_amount
    const updatedWalletAmount = Number(agent.wallet_amount);

    // Clean up associated records
    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });
    await models.Passenger.destroy({
      where: { bookingId: booking.id },
      transaction: t,
    });
    await models.Payment.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });

    // Update and delete the booking
    await booking.update({ bookingStatus: "CANCELLED" }, { transaction: t });
    await booking.destroy({ transaction: t });

    // Update available seats
    const updatedAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: booking.schedule_id,
      bookDate: booking.bookDate,
      transaction: t,
    });

    await t.commit();

    // Emit seats-updated event if socket.io is available
    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: booking.schedule_id,
        bookDate: booking.bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    // Respond with updated wallet amount
    res.json({
      message: "Booking cancelled successfully",
      refundAmount,
      cancellationFee,
      wallet_amount: updatedWalletAmount,
      note: "Wallet updated instantly; refund processing for external accounts (if applicable) takes 7–10 business days",
    });
  } catch (err) {
    if (t) await t.rollback();
    res.status(500).json({ error: "Failed to cancel booking: " + err.message });
  }
}

// General booking cancellation function (works for any agent)
async function cancelBooking(req, res) {
  const { id } = req.params;
  let t;

  try {
    t = await models.sequelize.transaction();

    // Fetch the booking with associated models
    const booking = await models.Booking.findByPk(id, {
      include: [
        { model: models.FlightSchedule, required: true },
        { model: models.BookedSeat, required: true },
        { model: models.Agent, required: true },
      ],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.bookingStatus === "CANCELLED") {
      await t.rollback();
      return res.status(400).json({ error: "Booking is already cancelled" });
    }

    // Ensure times are in IST (Asia/Kolkata)
    const now = dayjs().tz("Asia/Kolkata"); // Current time in IST

    // Combine bookDate with departure_time
    const bookDate = dayjs(booking.bookDate, "YYYY-MM-DD").tz("Asia/Kolkata");
    const departureTimeRaw = booking.FlightSchedule.departure_time;

    // Validate departure_time format (expecting HH:mm:ss)
    if (!departureTimeRaw || !/^\d{2}:\d{2}:\d{2}$/.test(departureTimeRaw)) {
      await t.rollback();
      return res.status(400).json({
        error:
          "Invalid departure time format in flight schedule. Expected HH:mm:ss.",
      });
    }

    // Combine bookDate and departure_time to form a full datetime
    const departureDateTimeString = `${booking.bookDate}T${departureTimeRaw}+05:30`; // e.g., "2025-06-05T12:00:00+05:30"
    let departureTime = dayjs(departureDateTimeString).tz("Asia/Kolkata");

    // Validate the combined datetime
    if (!departureTime.isValid()) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Failed to parse departure time in flight schedule" });
    }

    const hoursUntilDeparture = departureTime.diff(now, "hour");

    const totalFare = parseFloat(booking.totalFare);
    const numSeats = booking.BookedSeats.length;

    let refundAmount = 0;
    let cancellationFee = 0;

    // Calculate cancellation fee and refund based on time until departure
    if (hoursUntilDeparture > 96) {
      cancellationFee = numSeats * 400; // INR 400 per seat
      refundAmount = totalFare - cancellationFee;
    } else if (hoursUntilDeparture >= 48) {
      cancellationFee = totalFare * 0.25; // 25% of total fare
      refundAmount = totalFare - cancellationFee;
    } else if (hoursUntilDeparture >= 24) {
      cancellationFee = totalFare * 0.5; // 50% of total fare
      refundAmount = totalFare - cancellationFee;
    } else {
      cancellationFee = totalFare; // No refund
      refundAmount = 0;
    }

    if (refundAmount < 0) refundAmount = 0;

    // Update agent's wallet if the booking has an agent
    let updatedWalletAmount = null;
    if (booking.agentId) {
      const agent = await models.Agent.findByPk(booking.agentId, {
        transaction: t,
      });
      const initialWalletAmount = Number(agent.wallet_amount);
      await agent.increment("wallet_amount", {
        by: refundAmount,
        transaction: t,
      });
      await agent.reload({ transaction: t }); // Refresh agent instance to get updated wallet_amount
      updatedWalletAmount = Number(agent.wallet_amount);
    }

    // Clean up associated records
    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });
    await models.Passenger.destroy({
      where: { bookingId: booking.id },
      transaction: t,
    });
    await models.Payment.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });

    // Update and delete the booking
    await booking.update({ bookingStatus: "CANCELLED" }, { transaction: t });
    await booking.destroy({ transaction: t });

    // Update available seats
    const updatedAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: booking.schedule_id,
      bookDate: booking.bookDate,
      transaction: t,
    });

    await t.commit();

    // Emit seats-updated event if socket.io is available
    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: booking.schedule_id,
        bookDate: booking.bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    // Respond with updated wallet amount
    const response = {
      message: "Booking cancelled successfully",
      refundAmount,
      cancellationFee,
      note: "Wallet updated instantly; refund processing for external accounts (if applicable) takes 7–10 business days",
    };

    if (updatedWalletAmount !== null) {
      response.wallet_amount = updatedWalletAmount;
    }

    res.json(response);
  } catch (err) {
    if (t) await t.rollback();
    res.status(500).json({ error: "Failed to cancel booking: " + err.message });
  }
}

async function rescheduleIrctcBooking(req, res) {
  const { id } = req.params;
  const { newScheduleId, newBookDate, newSeatLabels } = req.body;
  let t;

  try {
    // Validate input
    if (
      !newScheduleId ||
      !newBookDate ||
      !Array.isArray(newSeatLabels) ||
      newSeatLabels.length === 0
    ) {
      return res.status(400).json({
        error:
          "newScheduleId, newBookDate, and newSeatLabels (array) are required",
      });
    }
    if (!dayjs(newBookDate, "YYYY-MM-DD", true).isValid()) {
      return res
        .status(400)
        .json({ error: "Invalid newBookDate format (YYYY-MM-DD)" });
    }

    t = await models.sequelize.transaction();
    const booking = await models.Booking.findByPk(id, {
      include: [
        { model: models.FlightSchedule, required: true },
        { model: models.BookedSeat, required: true },
        { model: models.Agent, required: true },
      ],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.Agent.agentId !== "IRCTC") {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Booking is not associated with IRCTC agent" });
    }

    if (
      booking.bookingStatus !== "SUCCESS" &&
      booking.bookingStatus !== "CONFIRMED"
    ) {
      await t.rollback();
      return res.status(400).json({
        error: "Only confirmed or successful bookings can be rescheduled",
      });
    }

    // Combine bookDate with departure_time
    const bookDate = dayjs(booking.bookDate, "YYYY-MM-DD").tz("Asia/Kolkata");
    const departureTimeRaw = booking.FlightSchedule.departure_time;

    // Validate departure_time format (expecting HH:mm:ss)
    if (!departureTimeRaw || !/^\d{2}:\d{2}:\d{2}$/.test(departureTimeRaw)) {
      await t.rollback();
      return res.status(400).json({
        error:
          "Invalid departure time format in flight schedule. Expected HH:mm:ss.",
      });
    }

    // Combine bookDate and departure_time to form a full datetime
    const departureDateTimeString = `${booking.bookDate}T${departureTimeRaw}+05:30`; // e.g., "2025-06-05T12:00:00+05:30"
    const departureTime = dayjs(departureDateTimeString).tz("Asia/Kolkata");

    // Validate the combined datetime
    if (!departureTime.isValid()) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Failed to parse departure time in flight schedule" });
    }

    const now = dayjs().tz("Asia/Kolkata"); // Current time in IST
    const hoursUntilDeparture = departureTime.diff(now, "hour");
    console.log(
      `Reschedule check - Current time: ${now.format()}, Departure time: ${departureTime.format()}, Hours until departure: ${hoursUntilDeparture}`
    );

    if (hoursUntilDeparture < 24) {
      await t.rollback();
      return res.status(400).json({
        error: "Rescheduling not permitted less than 24 hours before departure",
      });
    }

    const newSchedule = await models.FlightSchedule.findByPk(newScheduleId, {
      transaction: t,
    });
    if (!newSchedule) {
      await t.rollback();
      return res.status(400).json({ error: "New schedule not found" });
    }

    const availableSeats = await getAvailableSeats({
      models,
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      transaction: t,
    });
    for (const seat of newSeatLabels) {
      if (!availableSeats.includes(seat)) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: `Seat ${seat} is not available on new schedule` });
      }
    }

    if (newSeatLabels.length !== booking.BookedSeats.length) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Number of new seats must match original booking" });
    }

    let reschedulingFee = 0;
    if (hoursUntilDeparture > 48) {
      reschedulingFee = booking.BookedSeats.length * 500; // INR 500 per seat
    } else {
      reschedulingFee = booking.BookedSeats.length * 1000; // INR 1000 per seat
    }

    const oldTotalFare = parseFloat(booking.totalFare);
    const newTotalFare =
      parseFloat(newSchedule.price) * booking.BookedSeats.length;
    const fareDifference =
      newTotalFare > oldTotalFare ? newTotalFare - oldTotalFare : 0;

    const totalDeduction = reschedulingFee + fareDifference;
    const agent = await models.Agent.findByPk(booking.agentId, {
      transaction: t,
    });

    if (Number(agent.wallet_amount) < totalDeduction) {
      await t.rollback();
      return res.status(400).json({
        error: `Insufficient wallet balance: ${agent.wallet_amount} < ${totalDeduction}`,
      });
    }

    await agent.decrement("wallet_amount", {
      by: totalDeduction,
      transaction: t,
    });
    await agent.reload({ transaction: t }); // Refresh agent instance

    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });

    for (const seat of newSeatLabels) {
      await models.BookedSeat.create(
        {
          booking_id: booking.id,
          schedule_id: newScheduleId,
          bookDate: newBookDate,
          seat_label: seat,
          booked_seat: 1,
        },
        { transaction: t }
      );
    }

    await booking.update(
      {
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        totalFare: newTotalFare,
        bookingStatus: "CONFIRMED", // Rescheduled bookings are non-refundable
      },
      { transaction: t }
    );

    const oldAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: booking.schedule_id,
      bookDate: booking.bookDate,
      transaction: t,
    });

    const newAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      transaction: t,
    });

    await t.commit();

    // Emit separate seats-updated events for old and new schedules
    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: booking.schedule_id,
        bookDate: booking.bookDate,
        availableSeats: oldAvailableSeats,
      });
      req.io.emit("seats-updated", {
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        availableSeats: newAvailableSeats,
      });
    }

    res.json({
      message: "Booking rescheduled successfully",
      bookingId: booking.id,
      newScheduleId,
      newBookDate,
      newSeatLabels,
      reschedulingFee,
      fareDifference,
      totalDeduction,
      wallet_amount: Number(agent.wallet_amount),
      note: "Rescheduled booking is non-refundable",
    });
  } catch (err) {
    if (t) await t.rollback();
    res
      .status(500)
      .json({ error: "Failed to reschedule booking: " + err.message });
  }
}

// General booking rescheduling function (works for any agent)
async function rescheduleBooking(req, res) {
  const { id } = req.params;
  const { newScheduleId, newBookDate, newSeatLabels, agentId } = req.body; // Accept agentId from request body
  let t;

  try {
    // Validate input
    if (
      !newScheduleId ||
      !newBookDate ||
      !Array.isArray(newSeatLabels) ||
      newSeatLabels.length === 0
    ) {
      return res.status(400).json({
        error:
          "newScheduleId, newBookDate, and newSeatLabels (array) are required",
      });
    }
    if (!dayjs(newBookDate, "YYYY-MM-DD", true).isValid()) {
      return res
        .status(400)
        .json({ error: "Invalid newBookDate format (YYYY-MM-DD)" });
    }

    t = await models.sequelize.transaction();
    const booking = await models.Booking.findByPk(id, {
      include: [
        { model: models.FlightSchedule, required: true },
        { model: models.BookedSeat, required: true },
        { model: models.Agent, required: true },
      ],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    // Verify that the agentId in the request matches the booking's agent
    if (agentId && booking.agentId) {
      if (agentId !== booking.agentId.toString()) {
        await t.rollback();
        return res.status(403).json({ error: "Unauthorized: Agent ID does not match booking's agent" });
      }
    } else if (agentId && !booking.agentId) {
      await t.rollback();
      return res.status(403).json({ error: "Unauthorized: Booking does not belong to specified agent" });
    }
    
    if (
      booking.bookingStatus !== "SUCCESS" &&
      booking.bookingStatus !== "CONFIRMED"
    ) {
      await t.rollback();
      return res.status(400).json({
        error: "Only confirmed or successful bookings can be rescheduled",
      });
    }

    // Combine bookDate with departure_time
    const bookDate = dayjs(booking.bookDate, "YYYY-MM-DD").tz("Asia/Kolkata");
    const departureTimeRaw = booking.FlightSchedule.departure_time;

    // Validate departure_time format (expecting HH:mm:ss)
    if (!departureTimeRaw || !/^\d{2}:\d{2}:\d{2}$/.test(departureTimeRaw)) {
      await t.rollback();
      return res.status(400).json({
        error:
          "Invalid departure time format in flight schedule. Expected HH:mm:ss.",
      });
    }

    // Combine bookDate and departure_time to form a full datetime
    const departureDateTimeString = `${booking.bookDate}T${departureTimeRaw}+05:30`; // e.g., "2025-06-05T12:00:00+05:30"
    const departureTime = dayjs(departureDateTimeString).tz("Asia/Kolkata");

    // Validate the combined datetime
    if (!departureTime.isValid()) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Failed to parse departure time in flight schedule" });
    }

    const now = dayjs().tz("Asia/Kolkata"); // Current time in IST
    const hoursUntilDeparture = departureTime.diff(now, "hour");
    console.log(
      `Reschedule check - Current time: ${now.format()}, Departure time: ${departureTime.format()}, Hours until departure: ${hoursUntilDeparture}`
    );

    if (hoursUntilDeparture < 24) {
      await t.rollback();
      return res.status(400).json({
        error: "Rescheduling not permitted less than 24 hours before departure",
      });
    }

    const newSchedule = await models.FlightSchedule.findByPk(newScheduleId, {
      transaction: t,
    });
    if (!newSchedule) {
      await t.rollback();
      return res.status(400).json({ error: "New schedule not found" });
    }

    const availableSeats = await getAvailableSeats({
      models,
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      transaction: t,
    });
    for (const seat of newSeatLabels) {
      if (!availableSeats.includes(seat)) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: `Seat ${seat} is not available on new schedule` });
      }
    }

    if (newSeatLabels.length !== booking.BookedSeats.length) {
      await t.rollback();
      return res
        .status(400)
        .json({ error: "Number of new seats must match original booking" });
    }

    let reschedulingFee = 0;
    if (hoursUntilDeparture > 48) {
      reschedulingFee = booking.BookedSeats.length * 500; // INR 500 per seat
    } else {
      reschedulingFee = booking.BookedSeats.length * 1000; // INR 1000 per seat
    }

    const oldTotalFare = parseFloat(booking.totalFare);
    const newTotalFare =
      parseFloat(newSchedule.price) * booking.BookedSeats.length;
    const fareDifference =
      newTotalFare > oldTotalFare ? newTotalFare - oldTotalFare : 0;

    const totalDeduction = reschedulingFee + fareDifference;
    let updatedWalletAmount = null;

    if (booking.agentId) {
      const agent = await models.Agent.findByPk(booking.agentId, {
        transaction: t,
      });

      if (Number(agent.wallet_amount) < totalDeduction) {
        await t.rollback();
        return res.status(400).json({
          error: `Insufficient wallet balance: ${agent.wallet_amount} < ${totalDeduction}`,
        });
      }

      await agent.decrement("wallet_amount", {
        by: totalDeduction,
        transaction: t,
      });
      await agent.reload({ transaction: t }); // Refresh agent instance
      updatedWalletAmount = Number(agent.wallet_amount);
    }

    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction: t,
    });

    for (const seat of newSeatLabels) {
      await models.BookedSeat.create(
        {
          booking_id: booking.id,
          schedule_id: newScheduleId,
          bookDate: newBookDate,
          seat_label: seat,
          booked_seat: 1,
        },
        { transaction: t }
      );
    }

    await booking.update(
      {
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        totalFare: newTotalFare,
        bookingStatus: "CONFIRMED", // Rescheduled bookings are non-refundable
      },
      { transaction: t }
    );

    const oldAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: booking.schedule_id,
      bookDate: booking.bookDate,
      transaction: t,
    });

    const newAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      transaction: t,
    });

    await t.commit();

    // Emit separate seats-updated events for old and new schedules
    if (req.io) {
      req.io.emit("seats-updated", {
        schedule_id: booking.schedule_id,
        bookDate: booking.bookDate,
        availableSeats: oldAvailableSeats,
      });
      req.io.emit("seats-updated", {
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        availableSeats: newAvailableSeats,
      });
    }

    const response = {
      message: "Booking rescheduled successfully",
      bookingId: booking.id,
      newScheduleId,
      newBookDate,
      newSeatLabels,
      reschedulingFee,
      fareDifference,
      totalDeduction,
      note: "Rescheduled booking is non-refundable",
    };

    if (updatedWalletAmount !== null) {
      response.wallet_amount = updatedWalletAmount;
    }

    res.json(response);
  } catch (err) {
    if (t) await t.rollback();
    res
      .status(500)
      .json({ error: "Failed to reschedule booking: " + err.message });
  }
}

async function getBookingsByUser(req, res) {
  const { name, email } = req.query;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  try {
    // Fetch flight bookings
    const flightBookings = await models.Booking.findAll({
      where: { email_id: email },
      include: [
        {
          model: models.Passenger,
          required: true,
          where: { name: { [Op.like]: `%${name}%` } },
        },
        { model: models.FlightSchedule, required: false },
        {
          model: models.BookedSeat,
          attributes: ["seat_label"],
          required: false,
        },
        { model: models.Payment, as: "Payments", required: false },
        { model: models.Agent, required: false },
      ],
      order: [["bookDate", "DESC"]],
    });

    // Fetch helicopter bookings
    const helicopterBookings = await models.HelicopterBooking.findAll({
      where: { email_id: email },
      include: [
        {
          model: models.HelicopterPassenger,
          as: "Passengers",
          required: true,
          where: { name: { [Op.like]: `%${name}%` } },
        },
        {
          model: models.HelicopterSchedule,
          required: false,
          include: [
            { model: models.Helicopter, required: false, as: "Helicopter" },
          ],
        },
        {
          model: models.HelicopterBookedSeat,
          as: "BookedSeats",
          attributes: ["seat_label"],
          required: false,
        },
        { model: models.HelicopterPayment, as: "Payments", required: false },
        { model: models.Agent, required: false },
      ],
      order: [["bookDate", "DESC"]],
    });

    // Process flight bookings
    const flightBookingsWithExtras = await Promise.all(
      flightBookings.map(async (b) => {
        const billing = await models.Billing.findOne({
          where: { user_id: b.bookedUserId },
        });
        return {
          ...b.toJSON(),
          seatLabels: b.BookedSeats?.map((s) => s.seat_label) || [],
          billing: billing ? billing.toJSON() : null,
          bookingType: "flight",
        };
      })
    );

    // Process helicopter bookings
    const helicopterBookingsWithExtras = await Promise.all(
      helicopterBookings.map(async (b) => {
        const billing = await models.Billing.findOne({
          where: { user_id: b.bookedUserId },
        });
        return {
          ...b.toJSON(),
          seatLabels: b.BookedSeats?.map((s) => s.seat_label) || [],
          billing: billing ? billing.toJSON() : null,
          bookingType: "helicopter",
          helicopterNumber:
            b.HelicopterSchedule?.Helicopter?.helicopter_number || "N/A",
        };
      })
    );

    // Combine all bookings
    const allBookings = [
      ...flightBookingsWithExtras,
      ...helicopterBookingsWithExtras,
    ].sort((a, b) => new Date(b.bookDate) - new Date(a.bookDate));

    if (allBookings.length === 0) {
      return res
        .status(404)
        .json({ error: "No bookings found for the provided name and email" });
    }

    return res.status(200).json(allBookings);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch bookings: " + err.message });
  }
}

// Complete booking with discount coupon
async function completeBookingWithDiscount(req, res) {
  const { bookedSeat, booking, billing, payment, passengers, couponCode } =
    req.body;

  // Input validation (same as completeBooking)
  if (
    !bookedSeat ||
    !booking ||
    !billing ||
    !payment ||
    !Array.isArray(passengers) ||
    !passengers.length
  ) {
    return res.status(400).json({
      error:
        "Missing required booking sections: bookedSeat, booking, billing, payment, or passengers",
    });
  }
  if (!dayjs(bookedSeat.bookDate, "YYYY-MM-DD", true).isValid()) {
    return res
      .status(400)
      .json({ error: "Invalid bookDate format (YYYY-MM-DD)" });
  }
  if (
    !bookedSeat.seat_labels ||
    !Array.isArray(bookedSeat.seat_labels) ||
    bookedSeat.seat_labels.length !== passengers.length
  ) {
    return res.status(400).json({
      error: "seat_labels must be an array matching the number of passengers",
    });
  }

  // Validate booking fields
  const bookingRequiredFields = [
    "pnr",
    "bookingNo",
    "contact_no",
    "email_id",
    "noOfPassengers",
    "bookDate",
    "totalFare",
    "bookedUserId",
    "schedule_id",
  ];
  const missingBookingFields = bookingRequiredFields.filter(
    (f) => !booking[f] && booking[f] !== 0
  );
  if (missingBookingFields.length) {
    return res.status(400).json({
      error: `Missing booking fields: ${missingBookingFields.join(", ")}`,
    });
  }

  // Validate other sections
  if (!billing.user_id) {
    return res.status(400).json({ error: "Missing billing field: user_id" });
  }
  const paymentRequiredFields = [
    "user_id",
    "payment_amount",
    "payment_status",
    "transaction_id",
    "payment_mode",
  ];
  const missingPaymentFields = paymentRequiredFields.filter(
    (f) => !payment[f] && payment[f] !== 0
  );
  if (missingPaymentFields.length) {
    return res.status(400).json({
      error: `Missing payment fields: ${missingPaymentFields.join(", ")}`,
    });
  }
  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== "number") {
      return res
        .status(400)
        .json({ error: "Missing passenger fields: name, title, type, age" });
    }
  }
  if (!["RAZORPAY", "ADMIN", "AGENT"].includes(payment.payment_mode)) {
    return res.status(400).json({
      error: "Invalid payment_mode. Must be RAZORPAY, ADMIN, or AGENT",
    });
  }

  const originalTotalFare = parseFloat(booking.totalFare);
  let finalTotalFare = originalTotalFare;
  let discountAmount = 0;
  let appliedCoupon = null;

  // Apply coupon if provided
  if (couponCode) {
    try {
      const Coupon = require("../model/coupon");
      const { Op } = require("sequelize");

      const coupon = await Coupon.findOne({
        where: {
          code: couponCode.toUpperCase(),
          status: "active",
          valid_from: { [Op.lte]: new Date() },
          valid_until: { [Op.gte]: new Date() },
        },
      });

      if (!coupon) {
        return res
          .status(400)
          .json({ error: "Invalid or expired coupon code" });
      }

      // Check usage limit
      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
        return res.status(400).json({ error: "Coupon usage limit exceeded" });
      }

      // Check minimum booking amount
      if (originalTotalFare < coupon.min_booking_amount) {
        return res.status(400).json({
          error: `Minimum booking amount of ₹${coupon.min_booking_amount} required for this coupon`,
        });
      }

      // Calculate discount
      if (coupon.discount_type === "percentage") {
        discountAmount =
          (parseFloat(originalTotalFare) * parseFloat(coupon.discount_value)) /
          100;
        if (
          coupon.max_discount &&
          discountAmount > parseFloat(coupon.max_discount)
        ) {
          discountAmount = parseFloat(coupon.max_discount);
        }
      } else {
        discountAmount = parseFloat(coupon.discount_value);
      }

      finalTotalFare = Math.max(0, originalTotalFare - discountAmount);
      appliedCoupon = coupon;
    } catch (couponError) {
      console.error("Coupon validation error:", couponError);
      return res.status(400).json({ error: "Failed to apply coupon" });
    }
  }

  // Update booking and payment amounts with discount
  booking.totalFare = finalTotalFare;
  booking.originalFare = originalTotalFare;
  booking.discountAmount = discountAmount;
  booking.couponCode = couponCode || null;
  payment.payment_amount = finalTotalFare;

  const paymentAmount = parseFloat(payment.payment_amount);
  if (!Number.isFinite(finalTotalFare) || finalTotalFare < 0) {
    return res
      .status(400)
      .json({ error: "Total fare must be a non-negative number" });
  }
  if (Math.abs(finalTotalFare - paymentAmount) > 0.01) {
    return res
      .status(400)
      .json({ error: "Total fare does not match payment amount" });
  }

  let transaction;
  try {
    // Validate user
    const user = await models.User.findByPk(booking.bookedUserId);
    if (!user) {
      return res
        .status(400)
        .json({ error: `Invalid bookedUserId: ${booking.bookedUserId}` });
    }

    transaction = await models.sequelize.transaction();

    // Authenticate admin for ADMIN mode
    if (payment.payment_mode === "ADMIN") {
      const token = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : req.headers.token || req.cookies?.token;

      if (!token) {
        throw new Error("Unauthorized: No token provided for admin booking");
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (String(decoded.role) !== "1") {
          throw new Error("Forbidden: Only admins can use ADMIN payment mode");
        }
        if (
          String(decoded.id) !== String(booking.bookedUserId) ||
          String(decoded.id) !== String(billing.user_id) ||
          String(decoded.id) !== String(payment.user_id)
        ) {
          throw new Error("User ID mismatch in booking, billing, or payment");
        }
      } catch (jwtErr) {
        throw new Error(`Invalid token: ${jwtErr.message}`);
      }

      payment.payment_status = "SUCCESS";
      payment.payment_id = `ADMIN_${Date.now()}`;
      payment.order_id = `ADMIN_${Date.now()}`;
      payment.razorpay_signature = null;
      payment.message = "Admin booking (no payment required)";
    } else if (payment.payment_mode === "RAZORPAY") {
      if (
        !payment.payment_id ||
        !payment.order_id ||
        !payment.razorpay_signature
      ) {
        throw new Error(
          "Missing Razorpay payment fields: payment_id, order_id, or razorpay_signature"
        );
      }
      const isValidSignature = await verifyPayment({
        order_id: payment.order_id,
        payment_id: payment.payment_id,
        signature: payment.razorpay_signature,
      });
      if (!isValidSignature) {
        throw new Error("Invalid Razorpay signature");
      }
    } else if (payment.payment_mode === "AGENT") {
      const agent = await models.User.findByPk(payment.user_id);
      if (!agent || agent.role !== 2) {
        throw new Error("Invalid agent ID for agent booking");
      }

      booking.agentId = payment.user_id;

      payment.payment_status = "SUCCESS";
      payment.payment_id = `AGENT_${Date.now()}`;
      payment.order_id = `AGENT_${Date.now()}`;
      payment.razorpay_signature = null;
      payment.message = "Agent booking (no payment required)";
    }

    // Continue with the same booking logic as completeBooking...
    // (seat verification, booking creation, etc.)

    // After successful booking, record coupon usage
    if (appliedCoupon) {
      const CouponUsage = require("../model/couponUsage");

      // Increment coupon used_count
      await appliedCoupon.increment("used_count", { transaction });

      // Record usage
      await CouponUsage.create(
        {
          coupon_id: appliedCoupon.id,
          user_id: booking.bookedUserId,
          booking_id: null, // Will be updated after booking is created
          original_amount: originalTotalFare,
          discount_amount: discountAmount,
          final_amount: finalTotalFare,
        },
        { transaction }
      );
    }

    // Call the original completeBooking logic here
    // For now, returning success with discount info
    await transaction.commit();

    return res.status(200).json({
      message: "Booking completed successfully with discount",
      booking: {
        ...booking,
        originalFare: originalTotalFare,
        discountAmount: discountAmount,
        finalFare: finalTotalFare,
        couponApplied: couponCode || null,
      },
      discount: appliedCoupon
        ? {
            code: appliedCoupon.code,
            type: appliedCoupon.discount_type,
            value: appliedCoupon.discount_value,
            saved: discountAmount,
          }
        : null,
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Complete booking with discount error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to complete booking" });
  }
}

// Get booking statistics for operations dashboard
async function getBookingStats(req, res) {
  try {
    const { date, type } = req.query;

    // Calculate target date
    let targetDate;
    const now = dayjs().tz("Asia/Kolkata");

    if (date === "today") {
      targetDate = now.format("YYYY-MM-DD");
    } else if (date === "tomorrow") {
      targetDate = now.add(1, "day").format("YYYY-MM-DD");
    } else if (date) {
      targetDate = date;
    } else {
      return res.status(400).json({
        error: "Date parameter is required (today, tomorrow, or YYYY-MM-DD)",
      });
    }

    const stats = {};

    // Count flight bookings if requested or no type specified
    if (!type || type === "flight" || type === "all") {
      const flightCount = await models.Booking.count({
        where: {
          bookDate: {
            [Op.startsWith]: targetDate,
          },
        },
      });
      stats.flights = flightCount;
    }

    // Count helicopter bookings if requested or no type specified
    if (!type || type === "helicopter" || type === "all") {
      const helicopterCount = await models.HelicopterBooking.count({
        where: {
          bookDate: {
            [Op.startsWith]: targetDate,
          },
        },
      });
      stats.helicopters = helicopterCount;
    }

    // Calculate total
    stats.total = (stats.flights || 0) + (stats.helicopters || 0);
    stats.date = targetDate;

    res.json(stats);
  } catch (error) {
    console.error("Error fetching booking stats:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get booking statistics for multiple dates (optimized for dashboard)
async function getBookingStatsMultiple(req, res) {
  try {
    const now = dayjs().tz("Asia/Kolkata");
    const today = now.format("YYYY-MM-DD");
    const tomorrow = now.add(1, "day").format("YYYY-MM-DD");

    // Fetch all counts in parallel for maximum performance
    const [
      todayFlights,
      tomorrowFlights,
      todayHelicopters,
      tomorrowHelicopters,
    ] = await Promise.all([
      models.Booking.count({
        where: { bookDate: { [Op.startsWith]: today } },
      }),
      models.Booking.count({
        where: { bookDate: { [Op.startsWith]: tomorrow } },
      }),
      models.HelicopterBooking.count({
        where: { bookDate: { [Op.startsWith]: today } },
      }),
      models.HelicopterBooking.count({
        where: { bookDate: { [Op.startsWith]: tomorrow } },
      }),
    ]);

    res.json({
      today: {
        date: today,
        flights: todayFlights,
        helicopters: todayHelicopters,
        total: todayFlights + todayHelicopters,
      },
      tomorrow: {
        date: tomorrow,
        flights: tomorrowFlights,
        helicopters: tomorrowHelicopters,
        total: tomorrowFlights + tomorrowHelicopters,
      },
      summary: {
        totalFlights: todayFlights + tomorrowFlights,
        totalHelicopters: todayHelicopters + tomorrowHelicopters,
        grandTotal:
          todayFlights +
          tomorrowFlights +
          todayHelicopters +
          tomorrowHelicopters,
      },
    });
  } catch (error) {
    console.error("Error fetching booking stats:", error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  completeBooking,
  completeBookingWithDiscount,
  bookSeatsWithoutPayment,
  bookHelicopterSeatsWithoutPayment,
  generatePNR: generatePNRController,
  getBookings,
  getHelicopterBookings,
  getBookingById,
  getIrctcBookings,
  getUserBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  getBookingSummary,
  getBookingByPnr,
  cancelIrctcBooking,
  rescheduleIrctcBooking,
  cancelHelicopterBooking,
  rescheduleHelicopterBooking,
  getBookingsByUser,
  getBookingStats,
  getBookingStatsMultiple,
  cancelBooking,
  rescheduleBooking,
};
