const { By } = require("selenium-webdriver");
const {
    buildDriver,
    closeDriver,
    waitForVisible,
    waitForSwal,
    clickSwalConfirm,
    dismissSwalIfPresent,
    createAndLogin,
    injectSession,
    loginApi,
    apiGet,
    createEventApi,
    approveEventApi,
    registerForEventApi,
    getParticipantsApi,
} = require("./helpers");

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.E2E_API_BASE || "http://localhost:5000";

jest.setTimeout(120000);

let driver;

describe("Volunteer flows", () => {
    beforeEach(async () => { driver = buildDriver(); });
    afterEach(async () => { await closeDriver(driver); });

    // ── VOL-01 : volunteer dang ky su kien da approved ───────────────────────
    test("VOL-01 volunteer registers for approved event and status is pending", async () => {
        // Setup: tao manager, tao event, duyet event
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, { name: `VOL01_${Date.now()}` });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;

        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await approveEventApi(API_BASE, adminLogin.token, eventId);

        // Tao volunteer va login qua localStorage
        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        await injectSession(driver, BASE_URL, vol.user, vol.token);
        await waitForVisible(driver, By.css("header"));
        await dismissSwalIfPresent(driver);

        // Vao trang chi tiet su kien
        await driver.get(`${BASE_URL}/su-kien/${eventId}`);
        await waitForVisible(driver, By.css("h1"));

        // Bam nut dang ky
        const registerBtn = await waitForVisible(
            driver,
            By.xpath("//button[contains(.,'Đăng ký tham gia') or contains(.,'Đăng ký')]"),
            10000
        );
        await registerBtn.click();

        // Xac nhan qua Swal hoac trang thai nut thay doi
        const swal = await driver.findElements(By.css(".swal2-popup"));
        if (swal.length > 0) await clickSwalConfirm(driver);

        // Kiem tra qua API: volunteer phai xuat hien trong danh sach pending
        const participants = await getParticipantsApi(API_BASE, mgr.token, eventId);
        const reg = (Array.isArray(participants) ? participants : []).find(
            (p) => (p.volunteer?.id || p.volunteer?._id || p.volunteer) === vol.user.id
        );
        expect(reg).toBeDefined();
        expect(reg.status).toBe("pending");
    });

    // ── VOL-02 : dang ky 2 lan cung su kien → bao loi trung lap ─────────────
    test("VOL-02 duplicate registration shows error", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, { name: `VOL02_${Date.now()}` });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;
        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await approveEventApi(API_BASE, adminLogin.token, eventId);

        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        // Lan 1: dang ky qua API
        await registerForEventApi(API_BASE, vol.token, eventId);

        // Lan 2: thu dang ky lai qua UI
        await injectSession(driver, BASE_URL, vol.user, vol.token);
        await driver.get(`${BASE_URL}/su-kien/${eventId}`);
        await waitForVisible(driver, By.css("h1"));

        // Nut phai hien thi trang thai "Da dang ky" hoac khong the bam lai
        // Đợi H1 hiện ra
        await waitForVisible(driver, By.css("h1"));

        // ÉP TRÌNH DUYỆT ĐỢI CHO ĐẾN KHI NHÃN TRẠNG THÁI XUẤT HIỆN
        const duplicateMsg = await waitForVisible(
            driver,
            By.xpath("//*[contains(.,'đã đăng ký') or contains(.,'Đã đăng ký') or contains(.,'Đang chờ duyệt')]"),
            8000 // Chờ tối đa 8 giây
        );

        // Nếu tìm thấy (không bị timeout), test tự động Pass
        expect(duplicateMsg).not.toBeNull();
    });

    // ── VOL-03 : huy dang ky truoc 2 ngay → khong tru diem ──────────────────
    test("VOL-03 cancel registration before 2 days incurs no penalty", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, {
            name: `VOL03_${Date.now()}`,
            // Su kien 10 ngay sau
            date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000).toISOString(),
        });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;
        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await approveEventApi(API_BASE, adminLogin.token, eventId);

        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        await registerForEventApi(API_BASE, vol.token, eventId);

        // Lay diem truoc khi huy
        const beforeProfile = await apiGet(`${API_BASE}/api/auth/me`, vol.token);
        const pointsBefore = beforeProfile.points ?? 0;

        // Huy qua UI
        await injectSession(driver, BASE_URL, vol.user, vol.token);
        await driver.get(`${BASE_URL}/su-kien/${eventId}`);
        await waitForVisible(driver, By.css("h1"));

        const cancelBtn = await waitForVisible(
            driver,
            By.xpath("//button[contains(.,'Hủy đăng ký') or contains(.,'Hủy')]"),
            10000
        );
        await cancelBtn.click();

        const swal = await driver.findElements(By.css(".swal2-popup"));
        if (swal.length > 0) await clickSwalConfirm(driver);
        await driver.sleep(1000);

        // Diem khong duoc thay doi
        const afterProfile = await apiGet(`${API_BASE}/api/auth/me`, vol.token);
        expect(afterProfile.points ?? 0).toBe(pointsBefore);
    });

    // ── VOL-04 : huy trong 2 ngay → bi tru 10 diem ───────────────────────────
    test("VOL-04 cancel within 2 days deducts 10 points via API", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, {
            name: `VOL04_${Date.now()}`,
            // Su kien 1 ngay sau (trong vong 2 ngay)
            date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;
        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await approveEventApi(API_BASE, adminLogin.token, eventId);

        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        await registerForEventApi(API_BASE, vol.token, eventId);

        const beforeProfile = await apiGet(`${API_BASE}/api/auth/me`, vol.token);
        const pointsBefore = beforeProfile.points ?? 0;

        // Huy qua API (test logic backend, khong phu thuoc UI date)
        const { apiDelete } = require("./helpers");
        await apiDelete(`${API_BASE}/api/registrations/${eventId}`, vol.token);

        const afterProfile = await apiGet(`${API_BASE}/api/auth/me`, vol.token);
        expect(afterProfile.points ?? 0).toBe(pointsBefore - 10);
    });

    // ── VOL-05 : dang ky su kien chua duoc duyet → bi tu choi ────────────────
    test("VOL-05 registering for unapproved event is rejected by API", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, { name: `VOL05_${Date.now()}` });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;
        // Khong duyet event

        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        const res = await registerForEventApi(API_BASE, vol.token, eventId);

        expect(res.message).toMatch(/chưa được duyệt|không tồn tại|not found/i);
    });

    // ── VOL-06 : dang ky su kien het cho → bao het cho ───────────────────────
    test("VOL-06 registering for full event is rejected", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, {
            name: `VOL06_${Date.now()}`,
            maxParticipants: "1",
        });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;
        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await approveEventApi(API_BASE, adminLogin.token, eventId);

        // Volunteer thu nhat dang ky va duoc duyet
        const vol1 = await createAndLogin(API_BASE, "VOLUNTEER");
        const reg1 = await registerForEventApi(API_BASE, vol1.token, eventId);
        const reg1Id = reg1.registration?.id || reg1.registration?._id;
        if (reg1Id) {
            const { approveRegistrationApi } = require("./helpers");
            await approveRegistrationApi(API_BASE, mgr.token, reg1Id);
        }

        // Volunteer thu hai dang ky → het cho
        const vol2 = await createAndLogin(API_BASE, "VOLUNTEER");
        const res = await registerForEventApi(API_BASE, vol2.token, eventId);
        expect(res.message).toMatch(/đủ số lượng|đã đủ|hết chỗ|full/i);
    });

    // ── VOL-07 : volunteer xem lich su dang ky ───────────────────────────────
    test("VOL-07 volunteer views registration history", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, { name: `VOL07_${Date.now()}` });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;
        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await approveEventApi(API_BASE, adminLogin.token, eventId);

        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        await registerForEventApi(API_BASE, vol.token, eventId);

        // Kiem tra qua API
        const history = await apiGet(`${API_BASE}/api/registrations/history/my`, vol.token);
        expect(Array.isArray(history)).toBe(true);
        expect(history.length).toBeGreaterThan(0);
    });

    // ── VOL-08 : khong cho phep dang ky tham gia su kien khi chua dang nhap─────────────
    test("VOL-08 unauthenticated user clicking register shows unauthenticated swal", async () => {
        // Tao event that su dung
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, { name: `VOL08_${Date.now()}` });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;
        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await approveEventApi(API_BASE, adminLogin.token, eventId);
        await driver.get(`${BASE_URL}/su-kien/${eventId}`);
        await waitForVisible(driver, By.css("h1"));

        const registerBtn = await waitForVisible(
            driver,
            By.xpath("//button[contains(.,'Đăng ký tham gia') or contains(.,'Đăng ký')]"),
            10000
        );

        await driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", registerBtn);
        await driver.executeScript("arguments[0].click();", registerBtn);

        await waitForSwal(driver);

        const swalText = await driver.findElement(By.css(".swal2-popup")).getText();
        expect(swalText).toMatch(/Chưa đăng nhập/i);

        await clickSwalConfirm(driver);
    });
});
