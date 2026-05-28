const { By, until } = require("selenium-webdriver");
const {
    buildDriver,
    closeDriver,
    waitForVisible,
    setInputValue,
    clickByText,
    waitForSwal,
    clickSwalConfirm,
    dismissSwalIfPresent,
    apiPost,
    apiPut,
    createUser,
    loginApi,
    makeUserData,
    createAndLogin,
    injectSession,
    uniquePhone,
} = require("./helpers");

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.E2E_API_BASE || "http://localhost:5000";
const FIXED_OTP = process.env.E2E_OTP || "123456";

const runId = Date.now();
const user = {
    username: `auto_${runId}`,
    password: "Test1234",
    name: "Test User",
    birthday: "2000-01-01",
    gender: "Nam",
    phone: `090${String(runId % 9000000 + 1000000)}`,
    email: `auto_${runId}@example.com`,
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let driver;
let userCreated = false;

jest.setTimeout(120000);

async function openHome() {
    await driver.get(`${BASE_URL}/trang-chu`);
    await waitForVisible(driver, By.css("header"));
}

async function openLoginModal() {
    await openHome();
    await clickByText(driver, "button", "Đăng Nhập");
    await waitForVisible(driver, By.xpath("//h2[contains(., 'Đăng Nhập Tài Khoản')]"));
}

async function openRegisterModal() {
    await clickByText(driver, "button", "Đăng ký ngay");
    await waitForVisible(driver, By.xpath("//h2[contains(., 'Đăng Ký Tài Khoản')]"));
}

async function openForgetPasswordModal() {
    await clickByText(driver, "button", "Quên mật khẩu?");
    await waitForVisible(driver, By.xpath("//h2[contains(., 'Quên Mật Khẩu')]"));
}

async function sendOtpFromForm() {
    const locator = By.xpath("//input[@name='otp']/ancestor::div[contains(@class,'relative')]//button");
    const button = await waitForVisible(driver, locator);
    await button.click();
    await waitForSwal(driver);
    await clickSwalConfirm(driver);
}

async function registerUser() {
    await openLoginModal();
    await openRegisterModal();

    await setInputValue(driver, By.css("input[name='username']"), user.username);
    await setInputValue(driver, By.css("input[name='phone']"), user.phone);
    await setInputValue(driver, By.css("input[name='password']"), user.password);
    await setInputValue(driver, By.css("input[name='confirmPassword']"), user.password);
    await setInputValue(driver, By.css("input[name='name']"), user.name);
    const bdayInput = await waitForVisible(driver, By.css("input[name='birthday']"));

    await driver.executeScript((element, dateValue) => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(element, dateValue);

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }, bdayInput, user.birthday);

    const genderSelect = await waitForVisible(driver, By.css("select[name='gender']"));
    await genderSelect.sendKeys(user.gender);


    await setInputValue(driver, By.css("input[name='email']"), user.email);
    await setInputValue(driver, By.css("input[name='otp']"), FIXED_OTP);


    const submitBtn = await waitForVisible(driver, By.css("form button[type='submit']"));
    await submitBtn.click();

    await waitForSwal(driver);
    await clickSwalConfirm(driver);
    await waitForVisible(driver, By.xpath("//h2[contains(., 'Đăng Nhập Tài Khoản')]"));

    userCreated = true;
}

async function ensureUserExists() {
    if (userCreated) return;
    await registerUser();
    await driver.navigate().refresh();
}

async function openAccountInfoFromAvatar() {
    const avatarBtn = await waitForVisible(driver, By.css("img[alt='User Avatar']"), 10000);
    await driver.actions().move({ origin: avatarBtn }).perform();

    const accountInfoItem = await waitForVisible(
        driver,
        By.xpath("//li[contains(@class,'ant-dropdown-menu-item')]//span[normalize-space()='Thông tin tài khoản']")
    );
    await accountInfoItem.click();

    await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return url.includes("/thong-tin-ca-nhan");
    }, 10000);

    await waitForVisible(
        driver,
        By.xpath("//*[contains(@class,'ant-tabs-tab-btn') and contains(., 'Thông tin tài khoản')]")
    );
}

describe("Auth E2E", () => {
    beforeEach(async () => {
        driver = buildDriver();
    });

    afterEach(async () => {
        await closeDriver(driver);
    });

    // ── Existing tests ────────────────────────────────────────────────────────

    test("AUTH-01 registers with fixed OTP", async () => {
        await registerUser();
    });

    test("AUTH-02 logs in with created user", async () => {
        await ensureUserExists();
        await openLoginModal();

        await setInputValue(driver, By.css("input[name='identifier']"), user.username);
        await setInputValue(driver, By.css("input[name='password']"), user.password);

        const submitBtn = await waitForVisible(driver, By.xpath("//button[@type='submit' and contains(., 'Đăng Nhập')]"));
        await submitBtn.click();

        await driver.wait(until.elementLocated(By.css("img[alt='User Avatar']")), 20000);
        await dismissSwalIfPresent(driver);
    });

    test("AUTH-03 resets password with fixed OTP", async () => {
        await ensureUserExists();
        await openLoginModal();
        await openForgetPasswordModal();

        await setInputValue(driver, By.css("input[name='email']"), user.email);
        await sendOtpFromForm();
        await setInputValue(driver, By.css("input[name='otp']"), FIXED_OTP);

        const newPassword = "Test12345";
        await setInputValue(driver, By.css("input[name='newPassword']"), newPassword);
        await setInputValue(driver, By.css("input[name='confirmPassword']"), newPassword);

        const submitBtn = await waitForVisible(driver, By.css("form button[type='submit']"));
        await submitBtn.click();

        await waitForSwal(driver);
        await clickSwalConfirm(driver);
        await waitForVisible(driver, By.xpath("//h2[contains(., 'Đăng Nhập Tài Khoản')]"));

        user.password = newPassword;
    });

    // ── New tests ─────────────────────────────────────────────────────────────

    test("AUTH-04 wrong password shows error message", async () => {
        await openLoginModal();

        await setInputValue(driver, By.css("input[name='identifier']"), "admin");
        await setInputValue(driver, By.css("input[name='password']"), "wrongpassword_xyz");

        const submitBtn = await waitForVisible(driver, By.xpath("//button[@type='submit' and contains(., 'Đăng Nhập')]"));
        await submitBtn.click();

        const error = await waitForVisible(
            driver,
            By.xpath("//*[contains(., 'Sai tài khoản') or contains(., 'sai mật khẩu') or contains(., 'không chính xác') or contains(., 'Sai')]"),
            8000
        );
        expect(error).not.toBeNull();
    });

    test("AUTH-05 send OTP to already-registered email returns error", async () => {
        // Create a user so the email exists
        const email = `exist_${Date.now()}@example.com`;
        await createUser(API_BASE, {
            username: `exist_${Date.now()}`,
            email,
            password: "Test1234!",
            name: "Exist User",
            birthday: "1995-01-01",
            gender: "Male",
            phone: uniquePhone(),
            role: "VOLUNTEER",
        });

        // Request OTP for the same email — should be rejected
        const res = await apiPost(`${API_BASE}/api/auth/send-otp`, { email });
        expect(res.message).toMatch(/đã tồn tại|đã được|already/i);
    });

    test("AUTH-06 locked account is blocked from logging in", async () => {
        // Create volunteer and lock it via admin API
        const data = makeUserData("VOLUNTEER");
        await createUser(API_BASE, data);
        const loginData = await loginApi(API_BASE, data.email, data.password);
        const adminLogin = await loginApi(API_BASE, "admin", "admin");
        await apiPut(
            `${API_BASE}/api/admin/users/${loginData.user.id}/status`,
            { status: "LOCKED" },
            adminLogin.token
        );

        // Attempt login via UI
        await openLoginModal();
        await setInputValue(driver, By.css("input[name='identifier']"), data.email);
        await setInputValue(driver, By.css("input[name='password']"), data.password);
        const submitBtn = await waitForVisible(driver, By.xpath("//button[@type='submit' and contains(., 'Đăng Nhập')]"));
        await submitBtn.click();

        const error = await waitForVisible(
            driver,
            By.xpath("//*[contains(., 'bị khóa') or contains(., 'khóa') or contains(., 'locked')]"),
            8000
        );
        expect(error).not.toBeNull();
    });

    test("AUTH-07 change password via UI", async () => {
        // Create user and login via localStorage
        const data = makeUserData("VOLUNTEER");
        await createUser(API_BASE, data);
        const loginData = await loginApi(API_BASE, data.email, data.password);

        await injectSession(driver, BASE_URL, loginData.user, loginData.token);
        await waitForVisible(driver, By.css("header"));
        await dismissSwalIfPresent(driver);

        // Đi đúng luồng UI: avatar -> dropdown -> thông tin tài khoản -> tab đổi mật khẩu
        await driver.get(`${BASE_URL}/trang-chu`);
        await openAccountInfoFromAvatar();

        const changePwdTab = await waitForVisible(
            driver,
            By.xpath("//div[contains(@class,'ant-tabs-tab')][.//span[normalize-space()='Đổi mật khẩu']]")
        );
        await changePwdTab.click();

        await waitForVisible(driver, By.css("input[placeholder='Nhập mật khẩu hiện tại']"));

        // Fill change password form
        await setInputValue(driver, By.css("input[placeholder='Nhập mật khẩu hiện tại']"), data.password);
        const newPwd = "NewPass1234!";
        await setInputValue(driver, By.css("input[placeholder='Nhập mật khẩu mới (tối thiểu 6 ký tự)']"), newPwd);
        await setInputValue(driver, By.css("input[placeholder='Nhập lại mật khẩu mới']"), newPwd);

        const submitBtn = await waitForVisible(driver, By.css("form button[type='submit']"));
        await submitBtn.click();

        await waitForSwal(driver);
        const swalText = await driver.findElement(By.css(".swal2-popup")).getText();
        expect(swalText).toMatch(/thành công|success/i);
        await clickSwalConfirm(driver);

        // Verify new password works via API
        const newLogin = await loginApi(API_BASE, data.email, newPwd);
        expect(newLogin.token).toBeTruthy();
    });

    test("AUTH-08 profile page displays user information", async () => {
        const data = makeUserData("VOLUNTEER");
        await createUser(API_BASE, data);
        const loginData = await loginApi(API_BASE, data.email, data.password);

        await injectSession(driver, BASE_URL, loginData.user, loginData.token);
        await waitForVisible(driver, By.css("header"));
        await dismissSwalIfPresent(driver);

        // Đi đúng luồng UI: hover avatar -> dropdown -> thông tin tài khoản
        await driver.get(`${BASE_URL}/trang-chu`);
        await openAccountInfoFromAvatar();

        await waitForVisible(driver, By.xpath("//*[contains(., 'Thông tin tài khoản')]"));
        await waitForVisible(driver, By.xpath(`//*[contains(., ${JSON.stringify(data.name)})]`));
        await waitForVisible(driver, By.xpath(`//*[contains(., ${JSON.stringify(data.email)})]`));
        await waitForVisible(driver, By.xpath(`//*[contains(., ${JSON.stringify(data.phone)})]`));
    });
});
