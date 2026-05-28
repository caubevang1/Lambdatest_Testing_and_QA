const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const DEFAULT_TIMEOUT = 15000;

function isRemoteGridEnabled() {
    return String(process.env.E2E_REMOTE || "false").toLowerCase() === "true";
}

function getCurrentTestName() {
    try {
        const full = global.expect?.getState?.()?.currentTestName || "";
        if (!full) return process.env.E2E_TEST_NAME || "VolunteerHub E2E";
        // "Suite Name > test case name" → "Suite Name_test case name"
        return full.replace(/ > /g, "_");
    } catch {
        return process.env.E2E_TEST_NAME || "VolunteerHub E2E";
    }
}

function getRemoteConfig() {
    const username = process.env.LT_USERNAME || process.env.TESTMUAI_USERNAME;
    const accessKey = process.env.LT_ACCESS_KEY || process.env.TESTMUAI_ACCESS_KEY;
    const remoteUrl = process.env.TESTMUAI_REMOTE_URL || process.env.E2E_REMOTE_URL || "https://hub.lambdatest.com/wd/hub";

    if (!username || !accessKey) {
        throw new Error("Set LT_USERNAME and LT_ACCESS_KEY before running remote TestMu AI tests.");
    }

    const safeRemoteUrl = remoteUrl.includes("@")
        ? remoteUrl
        : remoteUrl.replace("https://", `https://${encodeURIComponent(username)}:${encodeURIComponent(accessKey)}@`);

    return {
        remoteUrl: safeRemoteUrl,
        browserName: process.env.E2E_BROWSER || "chrome",
        browserVersion: process.env.E2E_BROWSER_VERSION || "latest",
        platformName: process.env.E2E_PLATFORM || "Windows 10",
        build: process.env.E2E_BUILD || "VolunteerHub Jest Selenium",
        project: process.env.E2E_PROJECT || "VolunteerHub",
        tunnel: String(process.env.E2E_TUNNEL || "true").toLowerCase() !== "false",
        tunnelName: process.env.LT_TUNNEL_NAME || process.env.E2E_TUNNEL_NAME || "",
        username,
        accessKey,
    };
}

async function reportRemoteTestStatus(driver, status) {
    if (!isRemoteGridEnabled() || !driver) {
        return;
    }

    try {
        await driver.executeScript(`lambda-status=${status}`);
    } catch (error) {
        console.log(`Could not set lambda-status: ${error.message}`);
    }
}

async function closeDriver(driver) {
    if (!driver) {
        return;
    }

    if (isRemoteGridEnabled()) {
        return;
    }

    await driver.quit();
}

function buildDriver() {
    const options = new chrome.Options();
    const headless = String(process.env.E2E_HEADLESS || "true").toLowerCase() !== "false";
    if (isRemoteGridEnabled()) {
        const remoteConfig = getRemoteConfig();
        options.set("browserVersion", remoteConfig.browserVersion);
        options.set("platformName", remoteConfig.platformName);
        options.set("LT:Options", {
            username: remoteConfig.username,
            accessKey: remoteConfig.accessKey,
            build: remoteConfig.build,
            name: getCurrentTestName(),
            project: remoteConfig.project,
            console: true,
            terminal: true,
            devicelog: true,
            network: true,
            video: true,
            visual: true,
            tunnel: remoteConfig.tunnel,
            ...(remoteConfig.tunnelName ? { tunnelName: remoteConfig.tunnelName } : {}),
        });

        const driver = new Builder()
            .usingServer(remoteConfig.remoteUrl)
            .forBrowser(remoteConfig.browserName)
            .setChromeOptions(options)
            .build();

        global.__TESTMUAI_DRIVER__ = driver;
        global.__TESTMUAI_REPORT_STATUS__ = (status) => reportRemoteTestStatus(driver, status);
        return driver;
    }

    if (headless) options.addArguments("--headless=new");
    options.addArguments("--start-maximized");
    options.addArguments("--disable-notifications");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");

    let builder = new Builder().forBrowser("chrome").setChromeOptions(options);
    const driverPath = process.env.E2E_CHROME_DRIVER;
    if (driverPath) {
        const service = new chrome.ServiceBuilder(driverPath);
        builder = builder.setChromeService(service);
    }

    return builder.build();
}

async function waitForVisible(driver, locator, timeout = DEFAULT_TIMEOUT) {
    await driver.wait(until.elementLocated(locator), timeout);
    const el = await driver.findElement(locator);
    await driver.wait(until.elementIsVisible(el), timeout);
    return el;
}

async function waitForGone(driver, locator, timeout = DEFAULT_TIMEOUT) {
    await driver.wait(async () => {
        const els = await driver.findElements(locator);
        return els.length === 0;
    }, timeout);
}

async function setInputValue(driver, locator, value) {
    const el = await waitForVisible(driver, locator);
    const type = await el.getAttribute("type");
    if (type === "date") {
        await driver.executeScript("arguments[0].value = arguments[1]", el, value);
    } else {
        await el.clear();
        await el.sendKeys(value);
    }
}

async function clickByText(driver, tag, text, timeout = DEFAULT_TIMEOUT) {
    const locator = By.xpath(`//${tag}[contains(., "${text}")]`);
    const el = await waitForVisible(driver, locator, timeout);
    await el.click();
}

async function waitForSwal(driver, timeout = DEFAULT_TIMEOUT) {
    return waitForVisible(driver, By.css(".swal2-popup"), timeout);
}

async function clickSwalConfirm(driver, timeout = DEFAULT_TIMEOUT) {
    const locator = By.css(".swal2-confirm");
    const el = await waitForVisible(driver, locator, timeout);
    await el.click();
}

async function dismissSwalIfPresent(driver, timeout = 3000) {
    const locator = By.css(".swal2-confirm");
    const els = await driver.findElements(locator);
    if (els.length > 0) {
        await els[0].click();
        await waitForGone(driver, By.css(".swal2-popup"), timeout);
    }
}

// ─── API HELPERS ─────────────────────────────────────────────────────────────

async function apiGet(url, token = null) {
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    return res.json();
}

async function apiPost(url, body, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    return res.json();
}

async function apiPut(url, body, token) {
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
    };
    const res = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
    });
    return res.json();
}

async function apiDelete(url, token) {
    const res = await fetch(url, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
    });
    return res.json();
}

// ─── USER HELPERS ─────────────────────────────────────────────────────────────

async function createUser(apiBase, userData) {
    return apiPost(`${apiBase}/api/auth/register`, userData);
}

async function loginApi(apiBase, identifier, password) {
    return apiPost(`${apiBase}/api/auth/login`, { identifier, password });
}

function uniquePhone() {
    return `090${String(Date.now() % 9000000 + 1000000)}`;
}

function makeUserData(role, overrides = {}) {
    const ts = Date.now();
    return {
        username: `u_${role.toLowerCase()}_${ts}`,
        email: `${role.toLowerCase()}_${ts}@example.com`,
        password: "Test1234!",
        name: `Test ${role.charAt(0) + role.slice(1).toLowerCase()}`,
        birthday: "1995-06-15",
        gender: "Male",
        phone: uniquePhone(),
        role,
        ...overrides,
    };
}

async function createAndLogin(apiBase, role, overrides = {}) {
    const data = makeUserData(role, overrides);
    await createUser(apiBase, data);
    const loginData = await loginApi(apiBase, data.email, data.password);
    return { ...data, token: loginData.token, user: loginData.user };
}

async function injectSession(driver, baseUrl, user, token) {
    await driver.get(baseUrl);
    await driver.executeScript(
        `window.localStorage.setItem('user', arguments[0]);`,
        JSON.stringify({ ...user, token })
    );
    await driver.navigate().refresh();
}

// ─── EVENT HELPERS ────────────────────────────────────────────────────────────

async function createEventApi(apiBase, token, overrides = {}) {
    const fd = new FormData();
    const defaults = {
        name: `E2E Event ${Date.now()}`,
        location: "Ha Noi",
        category: "Community",
        maxParticipants: "10",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        description: "E2E automated test event",
    };
    Object.entries({ ...defaults, ...overrides }).forEach(([k, v]) =>
        fd.append(k, String(v))
    );
    const res = await fetch(`${apiBase}/api/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
    });
    return res.json();
}

async function approveEventApi(apiBase, adminToken, eventId) {
    return apiPut(`${apiBase}/api/admin/events/${eventId}/approve`, {}, adminToken);
}

async function rejectEventApi(apiBase, adminToken, eventId, reason = "Test rejection") {
    return apiPut(`${apiBase}/api/admin/events/${eventId}/reject`, { reason }, adminToken);
}

// ─── REGISTRATION HELPERS ────────────────────────────────────────────────────

async function registerForEventApi(apiBase, volunteerToken, eventId) {
    return apiPost(`${apiBase}/api/registrations/${eventId}`, {}, volunteerToken);
}

async function getParticipantsApi(apiBase, managerToken, eventId) {
    return apiGet(`${apiBase}/api/registrations/${eventId}/participants`, managerToken);
}

async function approveRegistrationApi(apiBase, managerToken, registrationId) {
    return apiPut(
        `${apiBase}/api/registrations/${registrationId}/status`,
        { status: "approved" },
        managerToken
    );
}

async function rejectRegistrationApi(apiBase, managerToken, registrationId, reason = "") {
    return apiPut(
        `${apiBase}/api/registrations/${registrationId}/status`,
        { status: "rejected", rejectionReason: reason },
        managerToken
    );
}

async function rateRegistrationApi(apiBase, managerToken, registrationId, performance) {
    return apiPut(
        `${apiBase}/api/registrations/${registrationId}/complete`,
        { performance },
        managerToken
    );
}

module.exports = {
    buildDriver,
    closeDriver,
    reportRemoteTestStatus,
    waitForVisible,
    waitForGone,
    setInputValue,
    clickByText,
    waitForSwal,
    clickSwalConfirm,
    dismissSwalIfPresent,
    // API helpers
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
    // User helpers
    createUser,
    loginApi,
    uniquePhone,
    makeUserData,
    createAndLogin,
    injectSession,
    // Event helpers
    createEventApi,
    approveEventApi,
    rejectEventApi,
    // Registration helpers
    registerForEventApi,
    getParticipantsApi,
    approveRegistrationApi,
    rejectRegistrationApi,
    rateRegistrationApi,
};
