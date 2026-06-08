import { getAppUrl, profileOgImageUrl, profileShareUrl } from "@/lib/appUrl";

export interface MiniAppEmbedPayload {
  version: "1";
  imageUrl: string;
  button: {
    title: string;
    action: {
      type: "launch_miniapp";
      name: string;
      url: string;
      splashImageUrl: string;
      splashBackgroundColor: string;
    };
  };
}

/** 3:2 static embed image for homepage mini app share cards. */
export function homeMiniAppEmbedImageUrl(): string {
  return `${getAppUrl()}/og-embed.png`;
}

export function buildHomeMiniAppEmbed(): MiniAppEmbedPayload {
  const appUrl = getAppUrl();
  return {
    version: "1",
    imageUrl: homeMiniAppEmbedImageUrl(),
    button: {
      title: "Open Columns",
      action: {
        type: "launch_miniapp",
        name: "Columns",
        url: appUrl,
        splashImageUrl: `${appUrl}/columns-logo.png`,
        splashBackgroundColor: "#0c0c0f",
      },
    },
  };
}

export function buildHomeFrameEmbedJson(): string {
  const embed = buildHomeMiniAppEmbed();
  return JSON.stringify({
    ...embed,
    button: {
      ...embed.button,
      action: { ...embed.button.action, type: "launch_frame" },
    },
  });
}

export function buildProfileMiniAppEmbed(username: string): MiniAppEmbedPayload {
  const appUrl = getAppUrl();
  const profileUrl = profileShareUrl(username);
  return {
    version: "1",
    imageUrl: profileOgImageUrl(username),
    button: {
      title: "View Profile",
      action: {
        type: "launch_miniapp",
        name: "Columns",
        url: profileUrl,
        splashImageUrl: `${appUrl}/columns-logo.png`,
        splashBackgroundColor: "#0c0c0f",
      },
    },
  };
}

/** Legacy `fc:frame` embed JSON (older clients). */
export function buildProfileFrameEmbedJson(username: string): string {
  const embed = buildProfileMiniAppEmbed(username);
  const frame = {
    ...embed,
    button: {
      ...embed.button,
      action: { ...embed.button.action, type: "launch_frame" },
    },
  };
  return JSON.stringify(frame);
}
