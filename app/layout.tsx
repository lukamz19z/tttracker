import "./globals.css";
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-100">

        {/* TOP NAV */}
        <div className="h-14 bg-white border-b shadow-sm flex items-center justify-between px-6">
          <h1 className="text-xl font-bold text-slate-800">TTTracker</h1>

          <div className="flex gap-6 items-center text-sm">
            <Link href="/projects" className="hover:text-blue-600">
              Projects
            </Link>

            <Link href="/admin/users" className="hover:text-blue-600">
              Admin
            </Link>

            <button className="bg-slate-900 text-white px-4 py-1 rounded-lg">
              Logout
            </button>
          </div>
        </div>

        {/* PAGE */}
        <div className="p-8">{children}</div>

      </body>
    </html>
  );
}