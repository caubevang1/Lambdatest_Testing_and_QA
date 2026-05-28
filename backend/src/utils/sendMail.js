import nodemailer from "nodemailer";

const toSafeNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export async function sendOtpEmail(
  to,
  otp,
  subject = "Mã xác thực OTP"
) {
  const isTestMode =
    String(process.env.OTP_TEST_MODE || "").toLowerCase() === "true";
  if (isTestMode) {
    console.log(`[OTP][TEST] to=${to} otp=${otp} subject=${subject}`);
    return;
  }

  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASS) {
    throw new Error("SMTP chưa được cấu hình (thiếu SMTP_EMAIL/SMTP_PASS)");
  }

  const smtpHost = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const smtpPort = toSafeNumber(process.env.SMTP_PORT, 587);
  const smtpSecure =
    String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const smtpRequireTls =
    String(process.env.SMTP_REQUIRE_TLS || "true").toLowerCase() === "true";

  const connectionTimeout = toSafeNumber(
    process.env.SMTP_CONNECTION_TIMEOUT,
    30000
  );
  const greetingTimeout = toSafeNumber(process.env.SMTP_GREETING_TIMEOUT, 30000);
  const socketTimeout = toSafeNumber(process.env.SMTP_SOCKET_TIMEOUT, 45000);

  const html = `
          <h2>📌 Mã OTP của bạn là: <b>${otp}</b></h2>
          <p>OTP có hiệu lực trong 5 phút. Không chia sẻ mã này cho bất kỳ ai.</p>
        `;

  // Ưu tiên gửi qua API (HTTPS:443) để tránh timeout cổng SMTP trên các nền tảng free-tier
  if (process.env.BREVO_API_KEY) {
    try {
      console.log(`[OTP][MAIL][BREVO_API] Trying HTTPS API for ${to}`);
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: {
            email: process.env.SMTP_EMAIL,
            name: "VolunteerHub",
          },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Brevo API failed ${response.status}: ${details}`);
      }

      console.log(`[OTP][MAIL][BREVO_API] Sent successfully to ${to}`);
      return;
    } catch (apiErr) {
      console.error(
        `[OTP][MAIL][BREVO_API] Failed:`,
        apiErr?.message || apiErr
      );
      // fallback xuống SMTP nếu API lỗi
    }
  }

  const attempts = [];

  // Ưu tiên cấu hình từ env
  attempts.push({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: smtpRequireTls,
    label: `env(${smtpHost}:${smtpPort}, secure=${smtpSecure})`,
  });

  // Fallback cho Gmail khi môi trường deploy bị timeout/chặn mode cụ thể
  if (smtpHost.includes("gmail")) {
    attempts.push({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      label: "gmail-starttls(587)",
    });
    attempts.push({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      requireTLS: false,
      label: "gmail-ssl(465)",
    });
  }

  const uniqueAttempts = attempts.filter(
    (cfg, i, arr) =>
      i ===
      arr.findIndex(
        (x) =>
          x.host === cfg.host &&
          x.port === cfg.port &&
          x.secure === cfg.secure &&
          x.requireTLS === cfg.requireTLS
      )
  );

  const errors = [];

  console.log(
    `[OTP][MAIL] Start send to=${to}, host=${smtpHost}, port=${smtpPort}, secure=${smtpSecure}, attempts=${uniqueAttempts.length}`
  );

  for (const cfg of uniqueAttempts) {
    try {
      console.log(
        `[OTP][MAIL] Trying ${cfg.label} -> ${cfg.host}:${cfg.port} secure=${cfg.secure} requireTLS=${cfg.requireTLS}`
      );

      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        requireTLS: cfg.requireTLS,
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
        auth: {
          user: process.env.SMTP_EMAIL,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"VolunteerHub" <${process.env.SMTP_EMAIL}>`,
        to,
        subject,
        html,
      });

      console.log(`[OTP][MAIL] Sent successfully via ${cfg.label} to ${to}`);

      return;
    } catch (err) {
      console.error(
        `[OTP][MAIL] Failed via ${cfg.label}:`,
        err?.code,
        err?.message
      );
      errors.push(`${cfg.label}: ${err?.code || "NO_CODE"} - ${err?.message || "Unknown error"}`);
    }
  }

  throw new Error(`Gửi OTP thất bại qua tất cả SMTP configs. ${errors.join(" | ")}`);
}
