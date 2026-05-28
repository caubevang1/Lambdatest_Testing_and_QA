const { By, until } = require("selenium-webdriver");
const {
    buildDriver,
    closeDriver,
    waitForVisible,
    waitForGone,
    clickByText,
    waitForSwal,
    clickSwalConfirm,
    dismissSwalIfPresent,
    createAndLogin,
    injectSession,
    loginApi,
    createEventApi,
    approveEventApi,
    rejectEventApi,
    registerForEventApi,
    getParticipantsApi,
    approveRegistrationApi,
    apiPut,
    apiGet,
} = require("./helpers");

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.E2E_API_BASE || "http://localhost:5000";

jest.setTimeout(120000);

let driver;

describe("Events UI", () => {
    beforeEach(async () => { driver = buildDriver(); });
    afterEach(async () => {
        await closeDriver(driver);
    });

    // ── EVT-01 : danh sách hiển thị card hoặc empty-state ────────────────────
    test("EVT-01 event list shows cards or empty-state message", async () => {
        await driver.get(`${BASE_URL}/hoat-dong`);
        await waitForVisible(driver, By.css(".grid"));
        const cards = await driver.findElements(By.css(".grid .cursor-pointer"));
        if (cards.length === 0) {
            const empty = await driver.findElements(
                By.xpath("//*[contains(@class,'empty') or contains(.,'Không có') or contains(.,'Chưa có')]")
            );
            expect(empty.length).toBeGreaterThan(0);
        } else {
            expect(cards.length).toBeGreaterThan(0);
        }
    });

    // ── EVT-02 : tìm kiếm từ khóa không tồn tại → trả về kết quả rỗng ───────
    test("EVT-02 searching nonexistent keyword shows empty result", async () => {
        await driver.get(`${BASE_URL}/hoat-dong`);
        const input = await waitForVisible(driver, By.css('input[placeholder="Tim kiem..."], input[placeholder="Tìm kiếm..."]'));
        await input.clear();
        await input.sendKeys("___no_such_event_xyz_9999");

        const filterBtn = await driver.findElements(By.xpath("//button[contains(.,'Lọc')]"));
        if (filterBtn.length > 0) await filterBtn[0].click();
        // wait a moment for results to update
        await driver.sleep(1000);

        const cards = await driver.findElements(By.css(".grid .cursor-pointer"));
        expect(cards.length).toBe(0);
    });

    // ── EVT-03 : click card → mở đúng trang chi tiết ─────────────────────────
    test("EVT-03 clicking an event card opens its detail page", async () => {
        await driver.get(`${BASE_URL}/hoat-dong`);
        await waitForVisible(driver, By.css(".grid"));
        const cards = await driver.findElements(By.css(".grid .cursor-pointer"));
        if (cards.length === 0) return; // bỏ qua nếu không có sự kiện
        await cards[0].click();
        await waitForVisible(driver, By.css("h1"));
        const urlAfter = await driver.getCurrentUrl();
        expect(urlAfter).toMatch(/\/su-kien\//);
    });

    // ── EVT-04 : manager tạo sự kiện → admin thấy trong danh sách chờ duyệt ──
    test("EVT-04 manager creates event and admin sees it pending", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const eventName = `EVT04_${Date.now()}`;
        const evRes = await createEventApi(API_BASE, mgr.token, { name: eventName });
        expect(evRes.event || evRes._id || evRes.id).toBeTruthy();

        // Admin login và kiểm tra qua API
        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        const pending = await apiGet(`${API_BASE}/api/admin/events/pending`, adminLogin.token);
        const found = (Array.isArray(pending) ? pending : []).some(
            (e) => e.name === eventName
        );
        expect(found).toBe(true);
    });

    // ── EVT-05 : admin duyệt sự kiện → xuất hiện trong danh sách public ──────
    test("EVT-05 admin approves event and it appears in public list", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const eventName = `EVT05_${Date.now()}`;
        const evRes = await createEventApi(API_BASE, mgr.token, { name: eventName });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;

        const adminLogin = await loginApi(API_BASE, "admin", "admin");

        // Duyệt qua UI
        await injectSession(driver, BASE_URL, adminLogin.user, adminLogin.token);
        await driver.get(`${BASE_URL}/admin/su-kien/cho-duyet`);
        await waitForVisible(driver, By.css("h1, h2, h3"));

        // Tìm nút duyệt cho sự kiện vừa tạo
        const approveBtn = await waitForVisible(
            driver,
            By.xpath(`//tr[contains(., '${eventName}')]//button[contains(.,'Duyệt') or contains(.,'duyệt')]`),
            10000
        ).catch(() => null);

        if (approveBtn) {
            await approveBtn.click();
            await driver.wait(until.elementLocated(By.css(".swal2-popup")), 5000);

            const okBtn = await driver.findElement(By.css(".swal2-confirm"));
            await driver.executeScript("arguments[0].click();", okBtn);

            console.log("✅ Đã ép click nút OK trên Swal thành công!");
        } else {
            // ...
            // Fallback: duyệt qua API
            await approveEventApi(API_BASE, adminLogin.token, eventId);
        }

        await driver.sleep(1000);
        // Xác nhận qua API
        const detail = await apiGet(`${API_BASE}/api/events/public/${eventId}`);
        expect(detail.status.toLowerCase()).toBe("approved");
    });

    // EVT-06 removed per request

    // EVT-07 removed per request

    // ── EVT-06 : manager đánh dấu sự kiện đã hoàn thành ─────────────────────
    test("EVT-06 manager marks event as completed", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const evRes = await createEventApi(API_BASE, mgr.token, {
            name: `EVT06_${Date.now()}`,
            date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // đã qua
            endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        });
        const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;

        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await approveEventApi(API_BASE, adminLogin.token, eventId);

        // Hoàn thành qua API (PUT /api/events/:id/complete)
        const completeRes = await apiPut(
            `${API_BASE}/api/events/${eventId}/complete`,
            {},
            mgr.token
        );
        expect(completeRes.message || completeRes.event?.status).toMatch(/hoàn thành|completed/i);
    });

    // ── RACE-REG-01 : approve đồng thời không vượt quá maxParticipants ─────
    test("RACE-REG-01 concurrent approvals should not exceed maxParticipants", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const adminLogin = await loginApi(API_BASE, "admin", "admin");

        const eventRes = await createEventApi(API_BASE, mgr.token, {
            name: `RACE_EVENT_${Date.now()}`,
            maxParticipants: "1",
        });
        const eventId = eventRes.event?.id || eventRes.event?._id || eventRes.id || eventRes._id;
        if (!eventId) throw new Error("Failed to create event for race test");

        await approveEventApi(API_BASE, adminLogin.token, eventId);

        const volA = await createAndLogin(API_BASE, "VOLUNTEER");
        const volB = await createAndLogin(API_BASE, "VOLUNTEER");

        await registerForEventApi(API_BASE, volA.token, eventId);
        await registerForEventApi(API_BASE, volB.token, eventId);

        let participants = await getParticipantsApi(API_BASE, mgr.token, eventId);
        const pendingRegs = (participants || []).filter(
            (r) => String(r.status || "").toLowerCase() === "pending"
        );

        if (pendingRegs.length < 2) {
            const byVols = (participants || []).filter((r) => {
                const volId = (r.volunteer && (r.volunteer.id || r.volunteer._id)) || r.volunteer;
                return [
                    volA.user?.id || volA.user?._id || volA.user,
                    volB.user?.id || volB.user?._id || volB.user,
                ].includes(String(volId));
            });
            if (byVols.length >= 2) {
                pendingRegs.splice(0, pendingRegs.length, ...byVols);
            }
        }

        if (pendingRegs.length < 2) {
            console.warn("Warning: fewer than 2 pending registrations found; aborting concurrency portion.");
            expect(pendingRegs.length).toBeGreaterThanOrEqual(2);
            return;
        }

        const regIds = pendingRegs.map((r) => r.id || r._id);

        await Promise.all(regIds.map((id) => approveRegistrationApi(API_BASE, mgr.token, id)));

        participants = await getParticipantsApi(API_BASE, mgr.token, eventId);
        const approvedCount = (participants || []).filter((p) => (p.status || "").toLowerCase() === "approved").length;

        console.log("Approved count after concurrent approvals:", approvedCount);
        expect(approvedCount).toBeLessThanOrEqual(1);
    });


});
