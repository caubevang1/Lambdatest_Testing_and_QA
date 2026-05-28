const { By } = require("selenium-webdriver");
const {
    buildDriver,
    closeDriver,
    waitForVisible,
    createAndLogin,
    injectSession,
    loginApi,
    apiGet,
} = require("./helpers");

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.E2E_API_BASE || "http://localhost:5000";

jest.setTimeout(120000);

let driver;

async function expectRedirectToHome(disallowedPath, timeout = 8000) {
    await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        const pathname = new URL(url).pathname;
        return !pathname.startsWith(disallowedPath);
    }, timeout);

    const url = await driver.getCurrentUrl();
    expect(new URL(url).pathname).toBe("/");
    await waitForVisible(driver, By.css("header"));
}

describe("RBAC checks", () => {
    beforeEach(async () => { driver = buildDriver(); });
    afterEach(async () => { await closeDriver(driver); });

    // ── RBAC-01 : volunteer khong thay link Trang admin ───────────────────────
    test("RBAC-01 volunteer cannot see Admin link in header", async () => {
        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        await injectSession(driver, BASE_URL, vol.user, vol.token);
        await waitForVisible(driver, By.css("header"));

        const adminLinks = await driver.findElements(
            By.xpath("//a[contains(.,'Trang admin') or contains(.,'Admin')]")
        );
        expect(adminLinks.length).toBe(0);
    });

    // ── RBAC-02 : volunteer truy cap URL admin bi chan ────────────────────────
    test("RBAC-02 volunteer accessing admin URL is blocked or redirected", async () => {
        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        await injectSession(driver, BASE_URL, vol.user, vol.token);

        await driver.get(`${BASE_URL}/admin/su-kien/cho-duyet`);

        await expectRedirectToHome("/admin/");
    });

    // ── RBAC-03 : volunteer khong the truy cap trang quan ly su kien ──────────
    test("RBAC-03 volunteer cannot access event manager dashboard", async () => {
        const vol = await createAndLogin(API_BASE, "VOLUNTEER");
        await injectSession(driver, BASE_URL, vol.user, vol.token);

        await driver.get(`${BASE_URL}/quanlisukien/su-kien`);

        await expectRedirectToHome("/quanlisukien");
    });

    // ── RBAC-04 : manager khong thay link Trang admin ─────────────────────────
    test("RBAC-04 event manager cannot see Admin navigation link", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        await injectSession(driver, BASE_URL, mgr.user, mgr.token);
        await waitForVisible(driver, By.css("header"));

        const adminLinks = await driver.findElements(
            By.xpath("//a[contains(.,'Trang admin')]")
        );
        expect(adminLinks.length).toBe(0);
    });

    // ── RBAC-05 : manager truy cap URL admin bi chan ───────────────────────────
    test("RBAC-05 event manager accessing admin URL is blocked", async () => {
        const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
        await injectSession(driver, BASE_URL, mgr.user, mgr.token);

        await driver.get(`${BASE_URL}/admin/nguoi-dung`);

        await expectRedirectToHome("/admin/");
    });

    // ── RBAC-06 : chua dang nhap truy cap trang can auth → redirect ───────────
    test("RBAC-06 unauthenticated access to protected page is redirected", async () => {
        // Truy cap trang dashboard (can auth) khi chua dang nhap
        await driver.get(`${BASE_URL}/trang-chu`);
        await waitForVisible(driver, By.css("header"));

        // Thu truy cap trang yeu cau auth
        await driver.get(`${BASE_URL}/quanlisukien/su-kien`);
        await driver.sleep(2000);

        const url = await driver.getCurrentUrl();
        const hasSwal = (await driver.findElements(By.css(".swal2-popup"))).length > 0;
        const hasLoginModal = (await driver.findElements(
            By.xpath("//h2[contains(.,'Đăng Nhập')]")
        )).length > 0;
        const wasRedirected = !url.includes("quanlisukien");

        expect(hasSwal || hasLoginModal || wasRedirected).toBe(true);
    });
});
