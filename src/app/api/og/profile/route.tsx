import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getColumnsUserBadges } from "@/lib/columnsRegistry";
import { fetchPublicProfileByUsername } from "@/lib/fetchPublicProfile";
import { loadTop8Slots } from "@/lib/profileTop8";
import type { Top8Slot } from "@/types";
import { getAppUrl } from "@/lib/appUrl";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 800;

const MS_ORANGE = "#ff6600";
const MS_BLUE = "#003399";
const MS_GREEN = "#33cc00";
const MS_BORDER = "#6699cc";
const MS_BG = "#ffffff";
const MS_PANEL = "#f5f5f5";

const PHOTO_SIZE = 118;
const CELL_WIDTH = 250;

function flex(
  extra: Record<string, string | number> = {}
): Record<string, string | number> {
  return { display: "flex", ...extra };
}

function ColumnsUserBadge({ logoUrl }: { logoUrl: string }) {
  return (
    <div
      style={{
        ...flex({ alignItems: "center", gap: 4 }),
        marginTop: 6,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt=""
        width={14}
        height={14}
        style={{ borderRadius: 2, objectFit: "cover" }}
      />
      <div
        style={{
          ...flex(),
          fontSize: 13,
          fontWeight: 700,
          color: "#7c3aed",
        }}
      >
        Columns User
      </div>
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
      <div style={{ ...flex(), fontSize: 13, color: MS_ORANGE }}>(</div>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          background: MS_ORANGE,
        }}
      />
      <div style={{ ...flex(), fontSize: 13, color: MS_ORANGE }}>)</div>
      <div
        style={{
          ...flex(),
          fontSize: 13,
          fontWeight: 700,
          color: MS_GREEN,
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
      <div
        style={{
          ...flex(),
          fontSize: 18,
          fontWeight: 700,
          color: MS_BLUE,
          maxWidth: CELL_WIDTH,
          marginBottom: 6,
        }}
      >
        {displayName}
      </div>
      <div
        style={{
          ...flex(),
          padding: 3,
          background: MS_BORDER,
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
              background: "#d4d4d8",
            }}
          />
        )}
      </div>
      {showColumnsBadge ? (
        <ColumnsUserBadge logoUrl={logoUrl} />
      ) : (
        <OnlineNowBadge />
      )}
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
    <div style={{ ...flex({ gap: 16, justifyContent: "center" }) }}>
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
  const appUrl = getAppUrl();
  const logoUrl = `${appUrl}/columns-logo.png`;

  const top8Cells: (Top8Slot | null)[] = Array.from({ length: 8 }, (_, i) => top8[i] ?? null);
  const top8Row1 = top8Cells.slice(0, 4);
  const top8Row2 = top8Cells.slice(4, 8);
  const hasTop8 = top8.length > 0;
  const friendCount = top8.length;

  const badgeFids = [
    profile.fid,
    ...top8.map((s) => s.fid),
  ];
  const badgeMap = await getColumnsUserBadges(badgeFids);
  const ownerHasBadge = badgeMap.get(profile.fid) ?? false;

  const headerTitle = `${profile.displayName}'s Friend Space`;

  return new ImageResponse(
    (
      <div
        style={{
          ...flex({ flexDirection: "column" }),
          width: WIDTH,
          height: HEIGHT,
          background: MS_BG,
          color: "#111",
          fontFamily: "Arial, Helvetica, sans-serif",
          position: "relative",
          padding: 24,
        }}
      >
        <div
          style={{
            ...flex({ flexDirection: "column" }),
            border: `2px solid ${MS_BORDER}`,
            background: MS_PANEL,
            padding: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              ...flex({ alignItems: "center" }),
              background: MS_ORANGE,
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
              padding: "10px 16px",
            }}
          >
            {headerTitle}
          </div>

          <div style={{ ...flex({ flexDirection: "column" }), padding: "16px 20px 20px" }}>
            <div style={{ ...flex({ alignItems: "center", gap: 14 }) }}>
              <div
                style={{
                  ...flex(),
                  padding: 2,
                  background: MS_BORDER,
                }}
              >
                {profile.pfpUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.pfpUrl}
                    alt=""
                    width={64}
                    height={64}
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: 64, height: 64, background: "#d4d4d8" }} />
                )}
              </div>
              <div style={{ ...flex({ flexDirection: "column", gap: 4 }) }}>
                <div style={{ ...flex(), fontSize: 22, fontWeight: 700, color: "#111" }}>
                  {profile.displayName}
                </div>
                <div style={{ ...flex(), fontSize: 18, color: MS_BLUE }}>
                  @{profile.username}
                </div>
                <div style={{ ...flex(), fontSize: 16, color: "#333" }}>
                  <span>{profile.displayName} has </span>
                  <span style={{ color: MS_ORANGE, fontWeight: 700 }}>{friendCount}</span>
                  <span> Friends.</span>
                </div>
                {ownerHasBadge ? <ColumnsUserBadge logoUrl={logoUrl} /> : null}
              </div>
            </div>

            {hasTop8 ? (
              <div
                style={{
                  ...flex({
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 18,
                    marginTop: 22,
                  }),
                }}
              >
                <div
                  style={{
                    ...flex(),
                    fontSize: 20,
                    fontWeight: 700,
                    color: MS_ORANGE,
                    width: "100%",
                    borderBottom: `2px solid ${MS_ORANGE}`,
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
                  marginTop: 28,
                  fontSize: 22,
                  color: "#666",
                }}
              >
                No Top 8 yet — add friends on Columns!
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            ...flex({ alignItems: "center", gap: 8 }),
            position: "absolute",
            right: 28,
            bottom: 20,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            width={36}
            height={36}
            style={{ borderRadius: 6, objectFit: "cover" }}
          />
          <div style={{ ...flex(), fontSize: 16, fontWeight: 700, color: "#7c3aed" }}>
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
