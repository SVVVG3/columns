import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { fetchPublicProfileByUsername } from "@/lib/fetchPublicProfile";
import { loadTop8Slots } from "@/lib/profileTop8";
import type { Top8Slot } from "@/types";
import { getAppUrl } from "@/lib/appUrl";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 800;
const AVATAR_SIZE = 100;
const CELL_WIDTH = 150;

function flex(
  extra: Record<string, string | number> = {}
): Record<string, string | number> {
  return { display: "flex", ...extra };
}

function Top8Cell({ slot }: { slot: Top8Slot | null }) {
  if (!slot) {
    return <div style={{ ...flex(), width: CELL_WIDTH, height: 140 }} />;
  }

  return (
    <div
      style={{
        ...flex({ flexDirection: "column", alignItems: "center" }),
        width: CELL_WIDTH,
      }}
    >
      <div style={flex()}>
        {slot.pfpUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slot.pfpUrl}
            alt=""
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            style={{
              borderRadius: AVATAR_SIZE / 2,
              objectFit: "cover",
              border: "3px solid rgba(139,92,246,0.45)",
            }}
          />
        ) : (
          <div
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              background: "#3f3f46",
            }}
          />
        )}
      </div>
      <div
        style={{
          ...flex(),
          fontSize: 18,
          fontWeight: 600,
          color: "#e4e4e7",
          marginTop: 12,
          maxWidth: CELL_WIDTH,
        }}
      >
        @{slot.username}
      </div>
    </div>
  );
}

function Top8Row({ slots, rowKey }: { slots: (Top8Slot | null)[]; rowKey: string }) {
  return (
    <div style={{ ...flex({ gap: 36, justifyContent: "center" }) }}>
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
  const title = `@${profile.username}'s Top 8:`;

  const top8Cells: (Top8Slot | null)[] = Array.from({ length: 8 }, (_, i) => top8[i] ?? null);
  const top8Row1 = top8Cells.slice(0, 4);
  const top8Row2 = top8Cells.slice(4, 8);
  const hasTop8 = top8.length > 0;

  return new ImageResponse(
    (
      <div
        style={{
          ...flex({ flexDirection: "column", alignItems: "center" }),
          width: WIDTH,
          height: HEIGHT,
          background: "linear-gradient(145deg, #12121a 0%, #0c0c0f 55%, #1a1030 100%)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          padding: "40px 48px 48px",
        }}
      >
        <div
          style={{
            ...flex({ flexDirection: "column", alignItems: "center", gap: 20 }),
            marginTop: 12,
          }}
        >
          <div style={flex()}>
            {profile.pfpUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.pfpUrl}
                alt=""
                width={120}
                height={120}
                style={{
                  borderRadius: 28,
                  objectFit: "cover",
                  border: "4px solid rgba(139,92,246,0.55)",
                }}
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 28,
                  background: "#2a2a35",
                }}
              />
            )}
          </div>
          <div
            style={{
              ...flex(),
              fontSize: 44,
              fontWeight: 700,
              color: "#a78bfa",
            }}
          >
            {title}
          </div>
        </div>

        {hasTop8 ? (
          <div
            style={{
              ...flex({
                flexDirection: "column",
                alignItems: "center",
                gap: 32,
                marginTop: 40,
              }),
            }}
          >
            <Top8Row slots={top8Row1} rowKey="r1" />
            <Top8Row slots={top8Row2} rowKey="r2" />
          </div>
        ) : (
          <div
            style={{
              ...flex(),
              marginTop: 48,
              fontSize: 28,
              color: "#71717a",
            }}
          >
            No Top 8 yet
          </div>
        )}

        <div
          style={{
            ...flex(),
            position: "absolute",
            right: 40,
            bottom: 36,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            width={88}
            height={88}
            style={{ borderRadius: 16, objectFit: "cover" }}
          />
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
