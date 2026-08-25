import { PLATFORM_CONNECTIONS } from "./platform_connection_catalog";

const OFFICIAL_HOSTS = new Set([
  "developers.facebook.com",
  "www.facebook.com",
  "developers.tiktok.com",
]);

describe("platform connection catalog", () => {
  test("provides an official HTTPS acquisition link beside every credential field", () => {
    PLATFORM_CONNECTIONS.forEach((platform) => {
      const links = [platform.tokenHelp, platform.portal, platform.docs];
      if (platform.targetKey) links.push(platform.targetHelp);

      links.forEach((link) => {
        expect(link.label).toBeTruthy();
        const url = new URL(link.href);
        expect(url.protocol).toBe("https:");
        expect(OFFICIAL_HOSTS.has(url.hostname)).toBe(true);
        expect(url.search).toBe("");
      });
    });
  });

  test("does not suggest placing app secrets in the TikTok access token field", () => {
    const tiktok = PLATFORM_CONNECTIONS.find(
      (platform) => platform.id === "tiktok"
    );
    expect(tiktok.steps.join(" ")).toMatch(
      /không dán Client key, Client secret hoặc refresh_token/i
    );
    expect(tiktok.tokenLabel).toBe("User Access Token");
  });

  test("documents paired discovery queries for Facebook and Instagram IDs", () => {
    const facebook = PLATFORM_CONNECTIONS.find(
      (platform) => platform.id === "facebook"
    );
    const instagram = PLATFORM_CONNECTIONS.find(
      (platform) => platform.id === "instagram"
    );
    expect(facebook.query).toContain("access_token");
    expect(instagram.query).toContain("instagram_business_account");
  });
});
