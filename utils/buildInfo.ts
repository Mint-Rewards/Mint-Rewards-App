/**
 * Which bundle this device is actually running.
 *
 * A tester on the other side of the country is told "I pushed a fix, reopen
 * the app" and has no way to tell whether they reopened it hard enough. The
 * fix either appears or it does not, and when it does not there is nothing to
 * report but its absence.
 *
 * Two versions, deliberately, because they answer different questions:
 *
 *   - the BINARY version says whether they need a new build installed. It is
 *     read from expo-application for the reason versionGate.ts spells out:
 *     after an OTA lands, ENV.appVersion describes the downloaded bundle's
 *     config, not the binary sitting on the phone.
 *   - the UPDATE id says which JS they are running on top of it.
 *
 * Both modules are required lazily. A phone may be running a binary built
 * before one of them was linked in, and a top-level import of a missing native
 * module throws at module evaluation — taking the screen with it. Same guard
 * as UpdateGate.
 */
type UpdatesModule = {
  updateId?: string | null;
  createdAt?: Date | null;
  channel?: string | null;
  isEmbeddedLaunch?: boolean;
};
type ApplicationModule = {
  nativeApplicationVersion?: string | null;
  nativeBuildVersion?: string | null;
};

function load<T>(name: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(name) as T;
  } catch {
    return null;
  }
}

export interface BuildInfo {
  /** Version of the installed binary, e.g. "2.2.1". */
  version: string;
  /** iOS build number / Android versionCode. */
  build: string;
  /** Short id of the OTA update in use, or null on the JS that shipped. */
  updateId: string | null;
  channel: string | null;
  /** True when running the bundle baked into the build, not an update. */
  embedded: boolean;
  publishedAt: string | null;
}

export function readBuildInfo(
  updates: UpdatesModule | null = load<UpdatesModule>("expo-updates"),
  application: ApplicationModule | null = load<ApplicationModule>("expo-application"),
): BuildInfo {
  const version = application?.nativeApplicationVersion ?? "unknown";
  const build = application?.nativeBuildVersion ?? "unknown";

  // isEmbeddedLaunch is the honest signal, and the default when the module is
  // missing. An updateId exists on an embedded launch too — it is the id of
  // the bundle that shipped — so reporting that alone would make "no update
  // has arrived" read as "update applied", which is the one mistake this
  // screen exists to prevent.
  const embedded = !updates || updates.isEmbeddedLaunch !== false;

  return {
    version,
    build,
    updateId: embedded ? null : (updates?.updateId ?? null)?.slice(0, 8) ?? null,
    channel: updates?.channel ?? null,
    embedded,
    publishedAt:
      !embedded && updates?.createdAt ? new Date(updates.createdAt).toISOString() : null,
  };
}

/** One line, for the foot of a settings screen. Safe to read aloud over a call. */
export function buildLabel(info: BuildInfo = readBuildInfo()): string {
  const parts = [`v${info.version} (${info.build})`];
  if (info.channel) parts.push(info.channel);
  parts.push(info.embedded ? "as shipped" : `update ${info.updateId}`);
  return parts.join(" · ");
}
