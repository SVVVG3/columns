import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { fetchPublicProfileByUsername } from "@/lib/fetchPublicProfile";
import { loadTop8Slots } from "@/lib/profileTop8";
import type { Top8Slot } from "@/types";
import { getAppUrl } from "@/lib/appUrl";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 800;

function flex(
  extra: Record<string, string | number> = {}
): Record<string, string | number> {
  return { display: "flex", ...extra };
}

function Top8Cell({ slot }: { slot: Top8Slot | null }) {
  if (!slot) {
    return <div style={{ ...flex(), width: 110, height: 100 }} />;
  }

  return (
    <div
      style={{
        ...flex({ flexDirection: "column", alignItems: "center" }),
        width: 110,
      }}
    >
      <div style={flex()}>
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
      </div>
      <div
        style={{
          ...flex(),
          fontSize: 14,
          color: "#e4e4e7",
          marginTop: 8,
          maxWidth: 110,
        }}
      >
        @{slot.username}
      </div>
    </div>
  );
}

function Top8Row({ slots, rowKey }: { slots: (Top8Slot | null)[]; rowKey: string }) {
  return (
    <div style={{ ...flex({ gap: 20 }) }}>
      {slots.map((slot, index) => (
        <Top8Cell key={`${rowKey}-${slot?.fid ?? index}`} slot={slot} />
      ))}
    </div>
  );
}

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
  const bioText = profile.bio
    ? `${profile.bio.slice(0, 120)}${profile.bio.length > 120 ? "…" : ""}`
    : "";

  const top8Cells: (Top8Slot | null)[] = Array.from({ length: 8 }, (_, i) => top8[i] ?? null);
  const top8Row1 = top8Cells.slice(0, 4);
  const top8Row2 = top8Cells.slice(4, 8);
  const hasTop8 = top8.length > 0;

  return new ImageResponse(
    (
      <div
        style={{
          ...flex({ flexDirection: "column" }),
          width: WIDTH,
          height: HEIGHT,
          background: "linear-gradient(145deg, #12121a 0%, #0c0c0f 55%, #1a1030 100%)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          padding: 48,
        }}
      >
        <div style={{ ...flex({ alignItems: "center", gap: 28 }) }}>
          <div style={flex()}>
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
          </div>
          <div style={{ ...flex({ flexDirection: "column", gap: 8 }) }}>
            <div style={{ ...flex(), fontSize: 52, fontWeight: 700 }}>
              {profile.displayName}
            </div>
            <div style={{ ...flex(), fontSize: 32, color: "#a1a1aa" }}>
              @{profile.username}
            </div>
            {bioText ? (
              <div
                style={{
                  ...flex(),
                  fontSize: 22,
                  color: "#d4d4d8",
                  maxWidth: 720,
                  lineHeight: 1.35,
                  marginTop: 4,
                }}
              >
                {bioText}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            ...flex(),
            marginTop: 36,
            fontSize: 20,
            color: "#a78bfa",
            fontWeight: 600,
          }}
        >
          Top 8
        </div>

        {hasTop8 ? (
          <div style={{ ...flex({ flexDirection: "column", gap: 20, marginTop: 16 }) }}>
            <Top8Row slots={top8Row1} rowKey="r1" />
            <Top8Row slots={top8Row2} rowKey="r2" />
          </div>
        ) : (
          <div style={{ ...flex(), marginTop: 16, fontSize: 24, color: "#71717a" }}>
            No Top 8 yet
          </div>
        )}

        <div
          style={{
            ...flex({ alignItems: "center", gap: 12 }),
            position: "absolute",
            right: 40,
            bottom: 36,
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
          <div style={{ ...flex(), fontSize: 22, fontWeight: 700, color: "#a78bfa" }}>
            Columns
          </div>
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
