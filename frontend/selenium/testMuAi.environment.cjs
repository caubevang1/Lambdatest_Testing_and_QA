const NodeEnvironment = require("jest-environment-node").TestEnvironment || require("jest-environment-node");

class TestMuAiEnvironment extends NodeEnvironment {
    async handleTestEvent(event) {
        if (event.name !== "test_done") {
            return;
        }

        const reporter = this.global.__TESTMUAI_REPORT_STATUS__;
        const driver = this.global.__TESTMUAI_DRIVER__;
        const status = event.test && event.test.errors && event.test.errors.length === 0 ? "passed" : "failed";

        if (typeof reporter === "function") {
            try {
                await reporter(status);
            } catch (error) {
                console.log(`Could not report TestMu AI status: ${error.message}`);
            }
        }

        if (driver && typeof driver.quit === "function") {
            try {
                await driver.quit();
            } catch (error) {
                console.log(`Could not quit remote driver: ${error.message}`);
            }
        }

        this.global.__TESTMUAI_DRIVER__ = null;
        this.global.__TESTMUAI_REPORT_STATUS__ = null;
    }
}

module.exports = TestMuAiEnvironment;