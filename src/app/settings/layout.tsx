/** Mini app settings: fill viewport; page manages scroll + footer. */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-full min-h-0 flex flex-col">{children}</div>;
}
