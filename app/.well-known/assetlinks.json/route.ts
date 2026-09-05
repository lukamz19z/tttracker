import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    [
      {
        relation: [
          "delegate_permission/common.handle_all_urls",
        ],
        target: {
          namespace: "android_app",
          package_name: "au.com.tttracker.app",
          sha256_cert_fingerprints: [
            "7E:40:02:F9:E0:B6:22:B5:45:46:32:2E:9E:49:04:9E:40:62:7D:D7:05:6E:3A:3A:11:9F:5F:AF:D4:17:8B:98",
          ],
        },
      },
    ],
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}