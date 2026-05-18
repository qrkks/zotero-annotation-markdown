export const releaseAssetName = "zotero-annotation-markdown.xpi";
export const releaseRepository = "qrkks/zotero-annotation-markdown-plugins";
export const updateManifestUrl =
  `https://raw.githubusercontent.com/${releaseRepository}/main/updates.json`;
export const deterministicZipDate = new Date("2026-01-01T00:00:00.000Z");
export const deterministicZipEntryOptions = {
  lastModDate: deterministicZipDate,
  lastAccessDate: deterministicZipDate,
  creationDate: deterministicZipDate,
  extendedTimestamp: false
};

export function createUpdateManifest({ packageJson, manifest, xpiHash }) {
  const zoteroApplication = manifest.applications.zotero;

  return {
    addons: {
      [zoteroApplication.id]: {
        updates: [
          {
            version: packageJson.version,
            update_link:
              `https://github.com/${releaseRepository}/releases/download/v${packageJson.version}/${releaseAssetName}`,
            update_hash: `sha256:${xpiHash}`,
            applications: {
              zotero: {
                strict_min_version: zoteroApplication.strict_min_version,
                strict_max_version: zoteroApplication.strict_max_version
              }
            }
          }
        ]
      }
    }
  };
}
