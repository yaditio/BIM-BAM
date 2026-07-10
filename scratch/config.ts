import "dotenv/config";
import arkenv from "arkenv";
import { env } from "process";

export const envs = arkenv({
  // Remote location of xeokit data engine service
  XDES_API_URL: "string.url",
  // Received credentials for xeokit data engine service
  XDES_API_CLIENT_ID: "string",
  XDES_API_CLIENT_SECRET: "string",
  // Token from https://webhook.site/
  XDES_EXTERNAL_WEBHOOK_SITE_TOKEN: "string",
});

const computed = {
  authHeader:
    "Basic " +
    btoa(`${envs.XDES_API_CLIENT_ID}:${envs.XDES_API_CLIENT_SECRET}`),
  webhookSitePostUrl: `https://webhook.site/${env.XDES_EXTERNAL_WEBHOOK_SITE_TOKEN}`,
  webhookSiteApiUrl: `https://webhook.site/token/${env.XDES_EXTERNAL_WEBHOOK_SITE_TOKEN}/requests`,
};

const fixed = {
  sampleOutputFolder: ".sample-outputs",
};

export const config = {
  envs,
  computed,
  fixed,
};
