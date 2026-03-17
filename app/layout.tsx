
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-100">

        {/* GLOBAL TOPBAR */}
        <div className="h-14 bg-white border-b flex items-center justify-between px-6">
          <h1 className="text-xl font-bold">TTTracker</h1>

          <div className="flex gap-6 items-center">
            <Link href="/projects" className="text-slate-600 hover:text-black">
              Projects
            </Link>

            <Link href="/admin/users" className="text-slate-600 hover:text-black">
              Admin
            </Link>

            <button className="bg-slate-900 text-white px-4 py-1 rounded">
              Logout
            </button>
          </div>
        </div>

        {/* PAGE CONTENT */}
        <div className="p-8">{children}</div>

      </body>
    </html>
  );
}