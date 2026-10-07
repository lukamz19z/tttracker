import "server-only";

export type ConfidentialKmsConfig = {
  region: string;
  keyArn: string;
  readKeyArns: string[];
  roleArn: string;
  environment: "development" | "preview" | "production";
  team: string;
  project: string;
  ownerId: string;
  projectId: string;
  collectionMode: "disabled" | "synthetic";
};
export function confidentialKmsConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConfidentialKmsConfig {
  const value = (name: string) =>
    env[`TTTRACKER_CONFIDENTIAL_${name}`]?.trim() ?? "";
  const environment = value("ENVIRONMENT");
  const region = value("KMS_REGION"),
    keyArn = value("KMS_KEY_ARN"),
    roleArn = value("AWS_ROLE_ARN");
  const keyPattern = /^arn:aws:kms:([a-z0-9-]+):(\d{12}):key\/([a-f0-9-]{36})$/;
  const match = keyArn.match(keyPattern),
    role = roleArn.match(/^arn:aws:iam::(\d{12}):role\/[A-Za-z0-9_+=,.@/-]+$/);
  const mode = value("COLLECTION_MODE") || "disabled";
  const team = value("VERCEL_TEAM_SLUG"),
    project = value("VERCEL_PROJECT_NAME");
  const ownerId = value("VERCEL_OWNER_ID"),
    projectId = value("VERCEL_PROJECT_ID");
  const runtimeEnvironment =
    env.VERCEL_TARGET_ENV ||
    env.VERCEL_ENV ||
    (env.NODE_ENV !== "production" ? "development" : "");
  const readKeyArns = [
    ...new Set([
      keyArn,
      ...(value("KMS_READ_KEY_ARNS") || "").split(",").filter(Boolean),
    ]),
  ];
  if (
    !match ||
    !role ||
    match[1] !== region ||
    match[2] !== role[1] ||
    !["development", "preview", "production"].includes(environment) ||
    environment !== runtimeEnvironment ||
    !["disabled", "synthetic"].includes(mode) ||
    (environment === "production" && mode !== "disabled") ||
    !/^[a-z0-9-]+$/.test(team) ||
    !/^[A-Za-z0-9_-]+$/.test(project) ||
    !/^team_[A-Za-z0-9]+$/.test(ownerId) ||
    !/^prj_[A-Za-z0-9]+$/.test(projectId) ||
    readKeyArns.some((arn) => {
      const m = arn.match(keyPattern);
      return !m || m[1] !== region || m[2] !== match[2];
    })
  )
    throw new Error("CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE");
  return {
    region,
    keyArn,
    readKeyArns,
    roleArn,
    environment: environment as ConfidentialKmsConfig["environment"],
    team,
    project,
    ownerId,
    projectId,
    collectionMode: mode as ConfidentialKmsConfig["collectionMode"],
  };
}
