/** Profile mini app: fill viewport; pages manage their own scroll + footer. */
export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-full min-h-0 flex flex-col">{children}</div>;
}
