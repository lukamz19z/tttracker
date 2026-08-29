import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  ClientSecretCredential,
} from "@azure/identity";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export const runtime = "nodejs";

type GraphDrive = {
  id: string;
  name: string;
  webUrl?: string;
};

type GraphDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  folder?: unknown;
};

type ProjectSharePointRow = {
  sharepoint_folder_id?: string | null;
  sharepoint_tender_folder_id?: string | null;
};

type AccessAreaCodeRow = {
  code?: string | null;
};

type SharePointGroupRow = {
  id: string;
};

function requiredEnv(name: string) {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "_",
    )
    .replace(
      /^_+|_+$/g,
      "",
    );
}

async function graphFetch<T>(
  path: string,
): Promise<T> {
  const credential =
    new ClientSecretCredential(
      requiredEnv(
        "AZURE_TENANT_ID",
      ),
      requiredEnv(
        "AZURE_CLIENT_ID",
      ),
      requiredEnv(
        "AZURE_CLIENT_SECRET",
      ),
    );

  const token =
    await credential.getToken(
      "https://graph.microsoft.com/.default",
    );

  if (!token?.token) {
    throw new Error(
      "Could not obtain Microsoft Graph token.",
    );
  }

  const response =
    await fetch(
      `https://graph.microsoft.com/v1.0${path}`,
      {
        headers: {
          Authorization:
            `Bearer ${token.token}`,
          Accept:
            "application/json",
        },
        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Microsoft Graph ${response.status}: ${text}`,
    );
  }

  return (
    await response.json()
  ) as T;
}

async function getAdminContext(
  request: NextRequest,
): Promise<{
  service: SupabaseClient;
}> {
  const authHeader =
    request.headers.get(
      "authorization",
    ) ?? "";

  const token =
    authHeader
      .replace(
        /^Bearer\s+/i,
        "",
      )
      .trim();

  if (!token) {
    throw new Error(
      "Missing authentication token.",
    );
  }

  const supabaseUrl =
    requiredEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
    );

  const anonKey =
    requiredEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );

  const serviceKey =
    requiredEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  const authClient =
    createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        },
        auth: {
          persistSession:
            false,

          autoRefreshToken:
            false,
        },
      },
    );

  const {
    data: { user },
    error: userError,
  } =
    await authClient.auth
      .getUser(token);

  if (
    userError ||
    !user
  ) {
    throw new Error(
      "You must be logged in.",
    );
  }

  /*
   * Use the generic SupabaseClient type instead of `any`.
   *
   * The new access-control tables may not yet exist in your
   * generated Supabase TypeScript definitions, so this service
   * client intentionally isn't bound to stale generated DB types.
   */
  const service:
    SupabaseClient =
    createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession:
            false,

          autoRefreshToken:
            false,
        },
      },
    );

  const {
    data: roleRow,
    error: roleError,
  } =
    await service
      .from("user_roles")
      .select("role")
      .eq(
        "user_id",
        user.id,
      )
      .maybeSingle();

  if (roleError) {
    throw new Error(
      roleError.message,
    );
  }

  if (
    String(
      roleRow?.role ?? "",
    )
      .trim()
      .toLowerCase() !==
    "admin"
  ) {
    throw new Error(
      "Administrator access is required.",
    );
  }

  return {
    service,
  };
}

async function ensureSharePointGroup(
  service: SupabaseClient,
): Promise<string> {
  const {
    data,
    error,
  } =
    await service
      .from(
        "access_groups",
      )
      .upsert(
        {
          code:
            "sharepoint",

          name:
            "SharePoint",

          description:
            "Automatically discovered SharePoint libraries and controlled top-level folders.",

          sort_order:
            1000,

          is_active:
            true,
        },
        {
          onConflict:
            "code",
        },
      )
      .select(
        "id",
      )
      .single();

  if (
    error ||
    !data
  ) {
    throw new Error(
      error?.message ??
        "Could not prepare SharePoint access group.",
    );
  }

  const group =
    data as SharePointGroupRow;

  return String(
    group.id,
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const {
      service,
    } =
      await getAdminContext(
        request,
      );

    const hostname =
      requiredEnv(
        "SHAREPOINT_HOSTNAME",
      );

    const sitePath =
      requiredEnv(
        "SHAREPOINT_SITE_PATH",
      );

    const site =
      await graphFetch<{
        id: string;
      }>(
        `/sites/${hostname}:${sitePath}?$select=id`,
      );

    const drivesResult =
      await graphFetch<{
        value?: GraphDrive[];
      }>(
        `/sites/${encodeURIComponent(
          site.id,
        )}/drives?$select=id,name,webUrl`,
      );

    const sharePointGroupId =
      await ensureSharePointGroup(
        service,
      );

    /*
     * TTTracker project root folders are already associated with
     * project access, so they should not become global role-level
     * SharePoint permission areas.
     */
    const {
      data: projectRows,
      error:
        projectRowsError,
    } =
      await service
        .from("projects")
        .select(`
          sharepoint_folder_id,
          sharepoint_tender_folder_id
        `);

    if (
      projectRowsError
    ) {
      throw new Error(
        projectRowsError.message,
      );
    }

    const projectFolderIds =
      new Set<string>();

    for (
      const row
      of (
        projectRows ??
        []
      ) as ProjectSharePointRow[]
    ) {
      if (
        row.sharepoint_folder_id
      ) {
        projectFolderIds.add(
          String(
            row.sharepoint_folder_id,
          ),
        );
      }

      if (
        row.sharepoint_tender_folder_id
      ) {
        projectFolderIds.add(
          String(
            row.sharepoint_tender_folder_id,
          ),
        );
      }
    }

    let librariesCreated = 0;
    let librariesUpdated = 0;

    let foldersCreated = 0;
    let foldersUpdated = 0;

    const {
      data: existingRows,
      error:
        existingRowsError,
    } =
      await service
        .from(
          "access_areas",
        )
        .select(
          "code",
        );

    if (
      existingRowsError
    ) {
      throw new Error(
        existingRowsError.message,
      );
    }

    const existingCodes =
      new Set<string>(
        (
          (
            existingRows ??
            []
          ) as AccessAreaCodeRow[]
        ).map(
          (
            row,
          ) =>
            String(
              row.code ?? "",
            ),
        ),
      );

    let librarySort = 10;

    for (
      const drive
      of drivesResult.value ?? []
    ) {
      const libraryCode =
        `sp.library.${slug(
          drive.name,
        )}`;

      const libraryExisted =
        existingCodes.has(
          libraryCode,
        );

      const {
        error:
          libraryError,
      } =
        await service
          .from(
            "access_areas",
          )
          .upsert(
            {
              group_id:
                sharePointGroupId,

              category:
                "SharePoint",

              code:
                libraryCode,

              name:
                drive.name,

              description:
                `Access to SharePoint library ${drive.name}.`,

              type:
                "sharepoint",

              permission_level:
                "access",

              sharepoint_library:
                drive.name,

              source:
                "sharepoint_library",

              source_identifier:
                drive.id,

              discovered_at:
                new Date()
                  .toISOString(),

              sort_order:
                librarySort,

              is_active:
                true,
            },
            {
              onConflict:
                "code",
            },
          );

      if (libraryError) {
        throw new Error(
          libraryError.message,
        );
      }

      if (
        libraryExisted
      ) {
        librariesUpdated += 1;
      } else {
        librariesCreated += 1;

        existingCodes.add(
          libraryCode,
        );
      }

      /*
       * Discover non-project top-level folders.
       *
       * We intentionally don't recursively register all nested
       * folders because project delivery structures can contain
       * large numbers of folders and subfolders.
       */
      const children =
        await graphFetch<{
          value?: GraphDriveItem[];
        }>(
          `/drives/${encodeURIComponent(
            drive.id,
          )}/root/children?$select=id,name,webUrl,folder`,
        );

      let folderSort = 100;

      for (
        const item
        of children.value ?? []
      ) {
        if (
          !item.folder ||
          projectFolderIds.has(
            item.id,
          )
        ) {
          continue;
        }

        const folderCode =
          `sp.folder.${slug(
            drive.name,
          )}.${slug(
            item.name,
          )}`;

        const folderExisted =
          existingCodes.has(
            folderCode,
          );

        const {
          error:
            folderError,
        } =
          await service
            .from(
              "access_areas",
            )
            .upsert(
              {
                group_id:
                  sharePointGroupId,

                category:
                  `SharePoint · ${drive.name}`,

                code:
                  folderCode,

                name:
                  `${drive.name} / ${item.name}`,

                description:
                  `Access to SharePoint folder ${item.name} in ${drive.name}.`,

                type:
                  "sharepoint",

                permission_level:
                  "access",

                sharepoint_library:
                  drive.name,

                source:
                  "sharepoint_folder",

                source_identifier:
                  `${drive.id}:${item.id}`,

                discovered_at:
                  new Date()
                    .toISOString(),

                sort_order:
                  folderSort,

                is_active:
                  true,
              },
              {
                onConflict:
                  "code",
              },
            );

        if (
          folderError
        ) {
          throw new Error(
            folderError.message,
          );
        }

        if (
          folderExisted
        ) {
          foldersUpdated += 1;
        } else {
          foldersCreated += 1;

          existingCodes.add(
            folderCode,
          );
        }

        folderSort += 10;
      }

      librarySort += 10;
    }

    return NextResponse.json({
      success: true,

      discovered: {
        libraries:
          drivesResult.value
            ?.length ?? 0,
      },

      created: {
        libraries:
          librariesCreated,

        folders:
          foldersCreated,
      },

      updated: {
        libraries:
          librariesUpdated,

        folders:
          foldersUpdated,
      },
    });
  } catch (error) {
    console.error(
      "SHAREPOINT ACCESS DISCOVERY ERROR:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not sync SharePoint access areas.";

    const status =
      message.includes(
        "logged in",
      )
        ? 401
        : message.includes(
              "Administrator",
            )
          ? 403
          : 500;

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status,
      },
    );
  }
}