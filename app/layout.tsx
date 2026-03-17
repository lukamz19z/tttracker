import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-100">

        {/* TOP BAR */}
        <div className="h-14 bg-white border-b shadow-sm flex items-center justify-between px-6">
          <h1 className="text-xl font-bold text-slate-800">
            TTTracker
          </h1>

          <button className="bg-slate-900 text-white px-4 py-1 rounded-lg">
            Logout
          </button>
        </div>

        {/* PAGE CONTENT — NO GAP */}
        {children}

      </body>
    </html>
  );
}