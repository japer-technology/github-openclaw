import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type PackageSection = "dependencies" | "devDependencies";

type RequiredPackagesAsset = {
  schemaVersion: number;
  updatedAt: string;
  mergeStrategy: string;
  required: Record<PackageSection, string[]>;
  requiredVersions: Record<PackageSection, Record<string, string>>;
};

type RootPackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function isBarePackageImport(specifier: string): boolean {
  return !specifier.startsWith("node:") && !specifier.startsWith(".") && !specifier.startsWith("/");
}

function toBarePackage(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }

  const [name] = specifier.split("/");
  return name || specifier;
}

function collectExternalImports(source: string): string[] {
  const imports = source.matchAll(
    /(?:import\s+[^"']*from\s+|import\s*\(|require\(\s*)["']([^"']+)["']/g,
  );
  const external = new Set<string>();

  for (const match of imports) {
    const specifier = match[1];
    if (!isBarePackageImport(specifier)) {
      continue;
    }
    external.add(toBarePackage(specifier));
  }

  return [...external].toSorted();
}

function listTypescriptFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => path.join(directory, entry));
}

function ensureRequiredVersions(asset: RequiredPackagesAsset, packageJson: RootPackageJson): void {
  for (const section of ["dependencies", "devDependencies"] as const) {
    asset.requiredVersions[section] ??= {};
    const rootSection = packageJson[section] ?? {};

    for (const pkg of asset.required[section]) {
      if (!asset.requiredVersions[section][pkg] && rootSection[pkg]) {
        asset.requiredVersions[section][pkg] = rootSection[pkg];
      }
    }
  }
}

function syncRequiredPackages(asset: RequiredPackagesAsset, importedPackages: string[]): void {
  const declared = new Set([...asset.required.dependencies, ...asset.required.devDependencies]);
  const missingFromAsset = importedPackages.filter((pkg) => !declared.has(pkg));

  for (const pkg of missingFromAsset) {
    asset.required.devDependencies.push(pkg);
  }

  asset.required.dependencies = [...new Set(asset.required.dependencies)].toSorted();
  asset.required.devDependencies = [...new Set(asset.required.devDependencies)].toSorted();
}

function syncRootPackageJson(asset: RequiredPackagesAsset, packageJson: RootPackageJson): string[] {
  const added: string[] = [];

  for (const section of ["dependencies", "devDependencies"] as const) {
    packageJson[section] ??= {};

    for (const pkg of asset.required[section]) {
      if (packageJson[section]?.[pkg]) {
        continue;
      }

      const fallbackVersion = asset.requiredVersions[section][pkg];
      if (!fallbackVersion) {
        throw new Error(
          `Missing version for ${pkg} (${section}) in .GITHUB-MODE/assets/github-mode-required-packages.json -> requiredVersions.${section}`,
        );
      }

      packageJson[section][pkg] = fallbackVersion;
      added.push(`${pkg}@${fallbackVersion} -> ${section}`);
    }
  }

  return added;
}

function main(): void {
  const repoRoot = process.cwd();
  const scriptsPath = path.join(repoRoot, ".GITHUB-MODE", "scripts");
  const testsPath = path.join(repoRoot, ".GITHUB-MODE", "test");
  const assetPath = path.join(
    repoRoot,
    ".GITHUB-MODE",
    "assets",
    "github-mode-required-packages.json",
  );
  const packageJsonPath = path.join(repoRoot, "package.json");

  const asset = JSON.parse(readFileSync(assetPath, "utf8")) as RequiredPackagesAsset;
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as RootPackageJson;

  if (asset.mergeStrategy !== "union-with-root-openclaw-package-json") {
    throw new Error(
      `${assetPath}: mergeStrategy must remain union-with-root-openclaw-package-json`,
    );
  }

  const filesToScan = [...listTypescriptFiles(scriptsPath), ...listTypescriptFiles(testsPath)];

  const importedPackages = new Set<string>();
  for (const filePath of filesToScan) {
    const source = readFileSync(filePath, "utf8");
    for (const importedPackage of collectExternalImports(source)) {
      importedPackages.add(importedPackage);
    }
  }

  syncRequiredPackages(asset, [...importedPackages]);
  ensureRequiredVersions(asset, packageJson);
  const addedToPackageJson = syncRootPackageJson(asset, packageJson);

  asset.updatedAt = new Date().toISOString().slice(0, 10);

  writeFileSync(assetPath, `${JSON.stringify(asset, null, 2)}\n`, "utf8");
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  if (addedToPackageJson.length === 0) {
    console.log("✅ GitHub Mode packages are already merged into package.json");
    return;
  }

  console.log("✅ Added missing GitHub Mode packages to package.json:");
  for (const entry of addedToPackageJson) {
    console.log(`- ${entry}`);
  }
}

main();
