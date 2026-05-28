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
    apiPut,
    makeUserData,
    createUser,
    createEventApi,
} = require("./helpers");

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.E2E_API_BASE || "http://localhost:5000";

jest.setTimeout(120000);

let driver;

async function loginAsAdmin() {
    return loginApi(API_BASE, "admin", "admin");
}

describe("Admin flows", () => {
    beforeEach(async () => { driver = buildDriver(); });
    afterEach(async () => { await closeDriver(driver); });

    // ── ADM-01 : admin thay danh sach su kien cho duyet ──────────────────────
    test("ADM-01 admin sees pending events list with real content", async () => {
        // Tao 1 su kien pending de chac chan co data
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        const eventName = `ADM01_${Date.now()}`;
        await createEventApi(API_BASE, mgr.token, { name: eventName });

        const adminLogin = await loginAsAdmin();
        await injectSession(driver, BASE_URL, adminLogin.user, adminLogin.token);
        await driver.get(`${BASE_URL}/admin/su-kien/cho-duyet`);
        await waitForVisible(driver, By.css("h1, h2, h3"));

        // Su kien vua tao phai xuat hien trong danh sach
        const row = await waitForVisible(
            driver,
            By.xpath(`//*[contains(., '${eventName}')]`),
            10000
        );
        expect(row).not.toBeNull();
    });

    // ── ADM-02 : admin xem danh sach nguoi dung ──────────────────────────────
    test("ADM-02 admin views user list", async () => {
        const adminLogin = await loginAsAdmin();
        await injectSession(driver, BASE_URL, adminLogin.user, adminLogin.token);
        await driver.get(`${BASE_URL}/admin/nguoi-dung`);
        await waitForVisible(driver, By.css("h1, h2, h3, table"));

        // Phai co it nhat 1 dong nguoi dung (chinh admin)
        const rows = await driver.findElements(By.css("table tbody tr, .user-row"));
        expect(rows.length).toBeGreaterThan(0);
    });

    // ── ADM-03 : admin khoa tai khoan → user khong the dang nhap ─────────────
    test("ADM-03 locking an account blocks the user from logging in", async () => {
        const data = makeUserData("VOLUNTEER");
        await createUser(API_BASE, data);
        const loginData = await loginApi(API_BASE, data.email, data.password);
        const userId = loginData.user?.id;

        const adminLogin = await loginAsAdmin();

        // Khoa tai khoan qua UI
        await injectSession(driver, BASE_URL, adminLogin.user, adminLogin.token);
        await driver.get(`${BASE_URL}/admin/nguoi-dung`);
        await waitForVisible(driver, By.css("h1, h2, h3, table"));

        const lockBtn = await waitForVisible(
            driver,
            By.xpath(`//tr[contains(., '${data.email}')]//button[contains(.,'Khóa') or contains(.,'Lock')]`),
            10000
        ).catch(() => null);

        if (lockBtn) {
            await lockBtn.click();
            const swal = await driver.findElements(By.css(".swal2-popup"));
            if (swal.length > 0) await clickSwalConfirm(driver);
            await driver.sleep(1000);
        } else {
            // Fallback: khoa qua API
            await apiPut(`${API_BASE}/api/admin/users/${userId}/status`, { status: "LOCKED" }, adminLogin.token);
        }

        // Thu dang nhap lai phai that bai
        const retryLogin = await loginApi(API_BASE, data.email, data.password);
        expect(retryLogin.message || retryLogin.error).toMatch(/khóa|bị khóa|locked/i);
    });

    // ── ADM-04 : admin mo khoa tai khoan → user dang nhap duoc ───────────────
    test("ADM-04 unlocking an account restores login access", async () => {
        const data = makeUserData("VOLUNTEER");
        await createUser(API_BASE, data);
        const loginData = await loginApi(API_BASE, data.email, data.password);
        const userId = loginData.user?.id;

        const adminLogin = await loginAsAdmin();

        // Khoa truoc qua API
        await apiPut(`${API_BASE}/api/admin/users/${userId}/status`, { status: "LOCKED" }, adminLogin.token);

        // Mo khoa qua UI
        await injectSession(driver, BASE_URL, adminLogin.user, adminLogin.token);
        await driver.get(`${BASE_URL}/admin/nguoi-dung`);
        await waitForVisible(driver, By.css("h1, h2, h3, table"));

        const unlockBtn = await waitForVisible(
            driver,
            By.xpath(`//tr[contains(., '${data.email}')]//button[contains(.,'Mở khóa') or contains(.,'Unlock') or contains(.,'Active')]`),
            10000
        ).catch(() => null);

        if (unlockBtn) {
            await unlockBtn.click();
            const swal = await driver.findElements(By.css(".swal2-popup"));
            if (swal.length > 0) await clickSwalConfirm(driver);
            await driver.sleep(1000);
        } else {
            await apiPut(`${API_BASE}/api/admin/users/${userId}/status`, { status: "ACTIVE" }, adminLogin.token);
        }

        // Dang nhap lai phai thanh cong
        const retryLogin = await loginApi(API_BASE, data.email, data.password);
        expect(retryLogin.token).toBeTruthy();
    });

    // ── ADM-05 : admin thay doi role nguoi dung ───────────────────────────────
    test("ADM-05 admin changes user role to EVENTMANAGER", async () => {
        const data = makeUserData("VOLUNTEER");
        await createUser(API_BASE, data);

        const adminLogin = await loginAsAdmin();
        const loginResult = await loginApi(API_BASE, data.email, data.password);
        const targetUserId = loginResult.user?.id;

        const res = await apiPut(
            `${API_BASE}/api/admin/users/${targetUserId}/role`,
            { role: "EVENTMANAGER" },
            adminLogin.token
        );

        expect(res.user?.role || res.role).toBe("EVENTMANAGER");

        const users = await apiGet(`${API_BASE}/api/admin/users`, adminLogin.token);
        const updatedUser = users.find((user) => user.email === data.email);
        expect(updatedUser?.role).toBe("EVENTMANAGER");

        await injectSession(driver, BASE_URL, adminLogin.user, adminLogin.token);
        await driver.get(`${BASE_URL}/admin/nguoi-dung`);
        await waitForVisible(driver, By.css("h1, h2, h3, table"));
        const rows = await driver.findElements(By.css("table tbody tr"));
        expect(rows.length).toBeGreaterThan(0);
    });

    // ── ADM-06 : admin khong the tu doi role chinh minh ──────────────────────
    test("ADM-06 admin cannot change their own role", async () => {
        const adminLogin = await loginAsAdmin();
        const adminId = adminLogin.user?.id;

        const res = await apiPut(
            `${API_BASE}/api/admin/users/${adminId}/role`,
            { role: "VOLUNTEER" },
            adminLogin.token
        );
        expect(res.message).toMatch(/không thể|khong the|cannot|self/i);

        // Xac nhan role van la ADMIN
        const me = await apiGet(`${API_BASE}/api/auth/me`, adminLogin.token);
        expect(me.role).toBe("ADMIN");
    });
});
