const {
  AndroidConfig,
  IOSConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withEntitlementsPlist,
  withXcodeProject,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function withAetherCaptureAndroid(config) {
  return withAndroidManifest(config, (mod) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      mod.modResults,
    );
    mainActivity["intent-filter"] = mainActivity["intent-filter"] || [];

    const hasShareFilter = mainActivity["intent-filter"].some((filter) =>
      filter.action?.some(
        (action) => action.$?.["android:name"] === "android.intent.action.SEND",
      ),
    );
    if (!hasShareFilter) {
      for (const mimeType of ["text/plain", "text/*", ...IMAGE_MIMES]) {
        mainActivity["intent-filter"].push({
          action: [{ $: { "android:name": "android.intent.action.SEND" } }],
          category: [
            { $: { "android:name": "android.intent.category.DEFAULT" } },
          ],
          data: [{ $: { "android:mimeType": mimeType } }],
        });
      }
    }

    mainActivity["meta-data"] = mainActivity["meta-data"] || [];
    if (
      !mainActivity["meta-data"].some(
        (item) => item.$?.["android:name"] === "android.app.shortcuts",
      )
    ) {
      mainActivity["meta-data"].push({
        $: {
          "android:name": "android.app.shortcuts",
          "android:resource": "@xml/aether_shortcuts",
        },
      });
    }
    return mod;
  });
}

const APP_GROUP = "group.com.ferxalbs.aetherreminder.capture";
const EXTENSION_NAME = "AetherShareExtension";
const EXTENSION_BUNDLE_ID = "com.ferxalbs.aetherreminder.capture-share";

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function addSourceIfMissing(project, filepath, groupName, targetUuid) {
  if (project.hasFile(filepath)) return;
  IOSConfig.XcodeUtils.ensureGroupRecursively(project, groupName);
  IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
    filepath,
    groupName,
    project,
    targetUuid,
  });
}

function updateTargetBuildSettings(project, targetUuid, settings) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const configurationList = target
    ? project.pbxXCConfigurationList()[target.buildConfigurationList]
    : undefined;
  if (!target || !configurationList) {
    throw new Error(
      "AetherCapture: Share Extension build configurations are unavailable.",
    );
  }
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const configuration of configurationList.buildConfigurations) {
    const buildConfiguration = configurations[configuration.value];
    if (!buildConfiguration?.buildSettings) {
      throw new Error(
        "AetherCapture: Share Extension build settings are unavailable.",
      );
    }
    Object.assign(buildConfiguration.buildSettings, settings);
  }
}

function withAetherCaptureApple(config) {
  config = withEntitlementsPlist(config, (mod) => {
    const key = "com.apple.security.application-groups";
    const groups = new Set(mod.modResults[key] || []);
    groups.add(APP_GROUP);
    mod.modResults[key] = [...groups];
    return mod;
  });

  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectRoot = mod.modRequest.projectRoot;
    const iosRoot = mod.modRequest.platformProjectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceRoot = path.join(
      projectRoot,
      "targets",
      "aether-share-extension",
    );
    const extensionRoot = path.join(iosRoot, EXTENSION_NAME);
    const appCaptureRoot = path.join(iosRoot, projectName, "AetherCapture");

    for (const filename of [
      "ShareViewController.swift",
      "CaptureInboxWriter.swift",
      "AetherShareExtension-Info.plist",
      "AetherShareExtension.entitlements",
    ]) {
      copyFile(
        path.join(sourceRoot, filename),
        path.join(extensionRoot, filename),
      );
    }
    for (const filename of [
      "CaptureInboxWriter.swift",
      "CaptureAppIntents.swift",
    ]) {
      copyFile(
        path.join(sourceRoot, filename),
        path.join(appCaptureRoot, filename),
      );
    }

    const appTarget = IOSConfig.XcodeUtils.getApplicationNativeTarget({
      project,
      projectName,
    });
    addSourceIfMissing(
      project,
      `${projectName}/AetherCapture/CaptureInboxWriter.swift`,
      `${projectName}/AetherCapture`,
      appTarget.uuid,
    );
    addSourceIfMissing(
      project,
      `${projectName}/AetherCapture/CaptureAppIntents.swift`,
      `${projectName}/AetherCapture`,
      appTarget.uuid,
    );

    let extensionTarget = project.pbxTargetByName(EXTENSION_NAME);
    let extensionTargetUuid;
    if (!extensionTarget) {
      const added = project.addTarget(
        EXTENSION_NAME,
        "app_extension",
        EXTENSION_NAME,
        EXTENSION_BUNDLE_ID,
      );
      extensionTargetUuid = added.uuid;
      project.addBuildPhase(
        [],
        "PBXSourcesBuildPhase",
        "Sources",
        extensionTargetUuid,
      );
      project.addBuildPhase(
        [],
        "PBXFrameworksBuildPhase",
        "Frameworks",
        extensionTargetUuid,
      );
      project.addBuildPhase(
        [],
        "PBXResourcesBuildPhase",
        "Resources",
        extensionTargetUuid,
      );
    } else {
      extensionTargetUuid = project.findTargetKey(EXTENSION_NAME);
    }
    if (!extensionTargetUuid)
      throw new Error(
        "AetherCapture: Share Extension target UUID is unavailable.",
      );

    for (const filename of [
      "ShareViewController.swift",
      "CaptureInboxWriter.swift",
    ]) {
      addSourceIfMissing(
        project,
        `${EXTENSION_NAME}/${filename}`,
        EXTENSION_NAME,
        extensionTargetUuid,
      );
    }
    project.addFramework("libsqlite3.tbd", { target: extensionTargetUuid });

    const settings = {
      APPLICATION_EXTENSION_API_ONLY: "YES",
      CODE_SIGN_ENTITLEMENTS: `"${EXTENSION_NAME}/AetherShareExtension.entitlements"`,
      CURRENT_PROJECT_VERSION: "1",
      GENERATE_INFOPLIST_FILE: "NO",
      INFOPLIST_FILE: `"${EXTENSION_NAME}/AetherShareExtension-Info.plist"`,
      IPHONEOS_DEPLOYMENT_TARGET: "16.0",
      MARKETING_VERSION: "1.0.0",
      PRODUCT_BUNDLE_IDENTIFIER: `"${EXTENSION_BUNDLE_ID}"`,
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: '"1,2"',
    };
    updateTargetBuildSettings(project, extensionTargetUuid, settings);
    return mod;
  });
}

function withAetherCapture(config) {
  return withAetherCaptureApple(withAetherCaptureAndroid(config));
}

module.exports = createRunOncePlugin(
  withAetherCapture,
  "aether-capture",
  "1.0.0",
);
