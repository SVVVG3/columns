import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { fetchPublicProfileByUsername } from "@/lib/fetchPublicProfile";
import { loadTop8Slots } from "@/lib/profileTop8";
import { getAppUrl } from "@/lib/appUrl";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 800;

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.replace(/^@/, "").trim();
  if (!username) {
    return new Response("username required", { status: 400 });
  }

  const profile = await fetchPublicProfileByUsername(username);
  if (!profile) {
    return new Response("not found", { status: 404 });
  }

  const top8 = await loadTop8Slots(profile.fid);
  const appUrl = getAppUrl();
  const logoUrl = `${appUrl}/columns-logo.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(145deg, #12121a 0%, #0c0c0f 55%, #1a1030 100%)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          padding: 48,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {profile.pfpUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.pfpUrl}
              alt=""
              width={140}
              height={140}
              style={{
                borderRadius: 24,
                objectFit: "cover",
                border: "4px solid rgba(139,92,246,0.5)",
              }}
            />
          ) : (
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 24,
                background: "#2a2a35",
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 52, fontWeight: 700 }}>{profile.displayName}</div>
            <div style={{ fontSize: 32, color: "#a1a1aa" }}>@{profile.username}</div>
            {profile.bio ? (
              <div
                style={{
                  fontSize: 22,
                  color: "#d4d4d8",
                  maxWidth: 720,
                  lineHeight: 1.35,
                  marginTop: 4,
                }}
              >
                {profile.bio.slice(0, 120)}
                {profile.bio.length > 120 ? "…" : ""}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 36, fontSize: 20, color: "#a78bfa", fontWeight: 600 }}>
          Top 8
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            marginTop: 16,
            maxWidth: 1100,
          }}
        >
          {top8.length === 0 ? (
            <div style={{ fontSize: 24, color: "#71717a" }}>No Top 8 yet</div>
          ) : (
            top8.slice(0, 8).map((slot) => (
              <div
                key={slot.fid}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 110,
                }}
              >
                {slot.pfpUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slot.pfpUrl}
                    alt=""
                    width={72}
                    height={72}
                    style={{ borderRadius: 36, objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      background: "#3f3f46",
                    }}
                  />
                )}
                <div
                  style={{
                    fontSize: 14,
                    color: "#e4e4e7",
                    marginTop: 8,
                    textAlign: "center",
                    maxWidth: 110,
                    overflow: "hidden",
                  }}
                >
                  @{slot.username}
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            position: "absolute",
            right: 40,
            bottom: 36,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            width={44}
            height={44}
            style={{ borderRadius: 10, objectFit: "cover" }}
          />
          <div style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa" }}>Columns</div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
