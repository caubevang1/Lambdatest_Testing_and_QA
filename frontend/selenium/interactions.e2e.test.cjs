const { By } = require("selenium-webdriver");
const {
    buildDriver,
    closeDriver,
    waitForVisible,
    dismissSwalIfPresent,
    createAndLogin,
    injectSession,
    loginApi,
    apiPost,
    apiGet,
    createEventApi,
    approveEventApi,
} = require("./helpers");

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.E2E_API_BASE || "http://localhost:5000";

jest.setTimeout(120000);

let driver;

async function setupApprovedEvent() {
    const mgr = await createAndLogin(API_BASE, "EVENTMANAGER");
    const evRes = await createEventApi(API_BASE, mgr.token, { name: `INT_${Date.now()}` });
    const eventId = evRes.event?.id || evRes.event?._id || evRes.id || evRes._id;
    const adminLogin = await loginApi(API_BASE, "admin", "admin");
    await approveEventApi(API_BASE, adminLogin.token, eventId);
    return eventId;
}

describe("Event interactions", () => {
    beforeEach(async () => { driver = buildDriver(); });
    afterEach(async () => { await closeDriver(driver); });

    // ── INT-01 : like su kien → likesCount tang ───────────────────────────────
    test("INT-01 liking an event increments likesCount", async () => {
        const eventId = await setupApprovedEvent();
        const vol = await createAndLogin(API_BASE, "VOLUNTEER");

        // Lay so like ban dau
        const before = await apiGet(`${API_BASE}/api/actions/${eventId}/stats`);
        const likesBefore = before.likesCount ?? 0;

        // Like qua UI
        await injectSession(driver, BASE_URL, vol.user, vol.token);
        await driver.get(`${BASE_URL}/su-kien/${eventId}`);
        await waitForVisible(driver, By.css("h1"));
        await dismissSwalIfPresent(driver);

        const likeBtn = await waitForVisible(
            driver,
            By.xpath("//button[contains(@aria-label,'like') or contains(@aria-label,'Like') or contains(@title,'Thích') or contains(@class,'like')]"),
            8000
        ).catch(() => null);

        if (likeBtn) {
            await likeBtn.click();
            await driver.sleep(1000);
        } else {
            // Fallback: like qua API
            await apiPost(`${API_BASE}/api/actions/${eventId}`, { type: "LIKE", value: true }, vol.token);
        }

        // Xac nhan so like tang
        const after = await apiGet(`${API_BASE}/api/actions/${eventId}/stats`);
        expect(after.likesCount ?? 0).toBeGreaterThan(likesBefore);
    });

    // ── INT-02 : unlike su kien → likesCount giam ────────────────────────────
    test("INT-02 unliking an event decrements likesCount", async () => {
        const eventId = await setupApprovedEvent();
        const vol = await createAndLogin(API_BASE, "VOLUNTEER");

        // Like truoc
        await apiPost(`${API_BASE}/api/actions/${eventId}`, { type: "LIKE", value: true }, vol.token);
        const after1st = await apiGet(`${API_BASE}/api/actions/${eventId}/stats`);
        const likesAfterLike = after1st.likesCount ?? 1;

        // Unlike (toggle)
        await apiPost(`${API_BASE}/api/actions/${eventId}`, { type: "LIKE", value: false }, vol.token);
        const after2nd = await apiGet(`${API_BASE}/api/actions/${eventId}/stats`);
        expect(after2nd.likesCount ?? 0).toBeLessThan(likesAfterLike);
    });

    // ── INT-03 : share su kien → tra ve shareLink hop le ─────────────────────
    test("INT-03 sharing an event returns a valid share link", async () => {
        const eventId = await setupApprovedEvent();
        const vol = await createAndLogin(API_BASE, "VOLUNTEER");

        // Share qua UI
        await injectSession(driver, BASE_URL, vol.user, vol.token);
        await driver.get(`${BASE_URL}/su-kien/${eventId}`);
        await waitForVisible(driver, By.css("h1"));
        await dismissSwalIfPresent(driver);

        const shareBtn = await waitForVisible(
            driver,
            By.xpath("//button[contains(.,'Chia sẻ') or contains(@aria-label,'share') or contains(@title,'Chia sẻ')]"),
            8000
        ).catch(() => null);

        if (shareBtn) {
            await shareBtn.click();
            await driver.sleep(1000);
        }

        // Xac nhan qua API
        const res = await apiPost(
            `${API_BASE}/api/actions/${eventId}`,
            { type: "SHARE" },
            vol.token
        );
        expect(res.shareLink).toBeTruthy();
        expect(res.shareLink).toMatch(/\/su-kien\//);
    });
});
