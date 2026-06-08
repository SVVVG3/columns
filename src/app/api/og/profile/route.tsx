import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getColumnsUserBadges } from "@/lib/columnsRegistry";
import { fetchPublicProfileByUsername } from "@/lib/fetchPublicProfile";
import { formatProfileCount } from "@/lib/profilePreview";
import { loadTop8Slots } from "@/lib/profileTop8";
import { TOP8_RETRO } from "@/lib/top8RetroTheme";
import type { Top8Slot } from "@/types";
import { getAppUrl } from "@/lib/appUrl";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 800;

const PHOTO_SIZE = 136;
const CELL_WIDTH = 272;

function flex(
  extra: Record<string, string | number> = {}
): Record<string, string | number> {
  return { display: "flex", ...extra };
}

function ColumnsLogo({
  logoUrl,
  size = 14,
}: {
  logoUrl: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: 2, objectFit: "cover" }}
    />
  );
}

function FriendName({
  name,
  logoUrl,
  logoSide,
}: {
  name: string;
  logoUrl: string;
  logoSide?: "left" | "right";
}) {
  return (
    <div
      style={{
        ...flex({ alignItems: "center", gap: 6, justifyContent: "center" }),
        fontSize: 18,
        fontWeight: 700,
        color: TOP8_RETRO.link,
        maxWidth: CELL_WIDTH,
        marginBottom: 6,
      }}
    >
      {logoSide === "left" ? <ColumnsLogo logoUrl={logoUrl} size={16} /> : null}
      <div style={{ ...flex() }}>{name}</div>
      {logoSide === "right" ? <ColumnsLogo logoUrl={logoUrl} size={16} /> : null}
    </div>
  );
}

function OnlineNowBadge() {
  return (
    <div
      style={{
        ...flex({ alignItems: "center", gap: 4 }),
        marginTop: 6,
      }}
    >
      <div style={{ ...flex(), fontSize: 13, color: TOP8_RETRO.accentMuted }}>(</div>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          background: TOP8_RETRO.accent,
        }}
      />
      <div style={{ ...flex(), fontSize: 13, color: TOP8_RETRO.accentMuted }}>)</div>
      <div
        style={{
          ...flex(),
          fontSize: 13,
          fontWeight: 700,
          color: TOP8_RETRO.online,
        }}
      >
        Online Now!
      </div>
    </div>
  );
}

function Top8Cell({
  slot,
  showColumnsBadge,
  logoUrl,
}: {
  slot: Top8Slot | null;
  showColumnsBadge: boolean;
  logoUrl: string;
}) {
  if (!slot) {
    return <div style={{ ...flex(), width: CELL_WIDTH, height: 200 }} />;
  }

  const displayName = slot.displayName || slot.username;

  return (
    <div
      style={{
        ...flex({ flexDirection: "column", alignItems: "center" }),
        width: CELL_WIDTH,
      }}
    >
      <FriendName
        name={displayName}
        logoUrl={logoUrl}
        logoSide={showColumnsBadge ? "left" : undefined}
      />
      <div
        style={{
          ...flex(),
          padding: 3,
          background: TOP8_RETRO.panelBorder,
        }}
      >
        {slot.pfpUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slot.pfpUrl}
            alt=""
            width={PHOTO_SIZE}
            height={PHOTO_SIZE}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: PHOTO_SIZE,
              height: PHOTO_SIZE,
              background: TOP8_RETRO.photoPlaceholder,
            }}
          />
        )}
      </div>
      <OnlineNowBadge />
    </div>
  );
}

function Top8Row({
  slots,
  badgeMap,
  rowKey,
  logoUrl,
}: {
  slots: (Top8Slot | null)[];
  badgeMap: Map<number, boolean>;
  rowKey: string;
  logoUrl: string;
}) {
  return (
    <div style={{ ...flex({ gap: 10, justifyContent: "center" }) }}>
      {slots.map((slot, index) => (
        <Top8Cell
          key={`${rowKey}-${slot?.fid ?? index}`}
          slot={slot}
          showColumnsBadge={slot ? (badgeMap.get(slot.fid) ?? false) : false}
          logoUrl={logoUrl}
        />
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

  const badgeMap = await getColumnsUserBadges([profile.fid, ...top8.map((s) => s.fid)]);
  const followerLabel = formatProfileCount(profile.followerCount);

  const appUrl = getAppUrl();
  const logoUrl = `${appUrl}/columns-logo.png`;

  const top8Cells: (Top8Slot | null)[] = Array.from({ length: 8 }, (_, i) => top8[i] ?? null);
  const top8Row1 = top8Cells.slice(0, 4);
  const top8Row2 = top8Cells.slice(4, 8);
  const hasTop8 = top8.length > 0;
  const ownerHasBadge = badgeMap.get(profile.fid) ?? false;

  const headerTitle = `${profile.displayName}'s Friend Space`;

  return new ImageResponse(
    (
      <div
        style={{
          ...flex({ flexDirection: "column" }),
          width: WIDTH,
          height: HEIGHT,
          background: TOP8_RETRO.outerBg,
          color: TOP8_RETRO.text,
          fontFamily: "Arial, Helvetica, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            ...flex({ flexDirection: "column" }),
            border: `2px solid ${TOP8_RETRO.panelBorder}`,
            background: TOP8_RETRO.panel,
            flex: 1,
            width: "100%",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              ...flex({ alignItems: "center" }),
              background: TOP8_RETRO.accent,
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
              padding: "10px 16px",
            }}
          >
            {headerTitle}
          </div>

          <div
            style={{
              ...flex({ flexDirection: "column", flex: 1 }),
              padding: "14px 18px 10px",
            }}
          >
            <div style={{ ...flex({ alignItems: "center", gap: 16 }) }}>
              <div
                style={{
                  ...flex(),
                  padding: 2,
                  background: TOP8_RETRO.panelBorder,
                }}
              >
                {profile.pfpUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.pfpUrl}
                    alt=""
                    width={80}
                    height={80}
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      background: TOP8_RETRO.photoPlaceholder,
                    }}
                  />
                )}
              </div>
              <div style={{ ...flex({ flexDirection: "column", gap: 6 }) }}>
                <div
                  style={{
                    ...flex({ alignItems: "center", gap: 10 }),
                    fontSize: 26,
                    color: TOP8_RETRO.link,
                  }}
                >
                  <div style={{ ...flex() }}>@{profile.username}</div>
                  {ownerHasBadge ? <ColumnsLogo logoUrl={logoUrl} size={24} /> : null}
                </div>
                {followerLabel ? (
                  <div
                    style={{
                      ...flex({ alignItems: "center" }),
                      fontSize: 20,
                      color: TOP8_RETRO.textMuted,
                    }}
                  >
                    <span>{profile.displayName} has</span>
                    <span
                      style={{
                        color: TOP8_RETRO.accentMuted,
                        fontWeight: 700,
                        padding: "0 10px",
                      }}
                    >
                      {followerLabel}
                    </span>
                    <span>Friends.</span>
                  </div>
                ) : null}
              </div>
            </div>

            {hasTop8 ? (
              <div
                style={{
                  ...flex({
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 16,
                    marginTop: 18,
                  }),
                }}
              >
                <div
                  style={{
                    ...flex(),
                    fontSize: 20,
                    fontWeight: 700,
                    color: TOP8_RETRO.accentMuted,
                    width: "100%",
                    borderBottom: `2px solid ${TOP8_RETRO.accent}`,
                    paddingBottom: 6,
                  }}
                >
                  Top 8
                </div>
                <Top8Row slots={top8Row1} badgeMap={badgeMap} rowKey="r1" logoUrl={logoUrl} />
                <Top8Row slots={top8Row2} badgeMap={badgeMap} rowKey="r2" logoUrl={logoUrl} />
              </div>
            ) : (
              <div
                style={{
                  ...flex(),
                  marginTop: 24,
                  fontSize: 20,
                  color: TOP8_RETRO.textMuted,
                }}
              >
                No Top 8 yet — add friends on Columns!
              </div>
            )}

            <div
              style={{
                ...flex({ alignItems: "center", gap: 10, justifyContent: "flex-end" }),
                marginTop: "auto",
                paddingTop: 14,
                paddingRight: 8,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                width={64}
                height={64}
                style={{ borderRadius: 8, objectFit: "cover" }}
              />
            </div>
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
