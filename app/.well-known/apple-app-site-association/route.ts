import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: "23J547T9QG.au.com.tttracker.app",
            components: [
              {
                "/": "/project/*/tower/*/dockets/*/review",
                comment: "Open Daily Docket BC review links in TTTracker",
              },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}