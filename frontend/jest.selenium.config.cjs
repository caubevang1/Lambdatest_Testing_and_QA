require("dotenv").config();

module.exports = {
    testEnvironment: String(process.env.E2E_REMOTE || "false").toLowerCase() === "true"
        ? "<rootDir>/selenium/testMuAi.environment.cjs"
        : "node",
    testMatch: ["**/selenium/**/*.test.cjs"],
    testTimeout: 120000,
    verbose: true,
    maxWorkers: String(process.env.E2E_REMOTE || "false").toLowerCase() === "true" ? 2 : 10,
};
