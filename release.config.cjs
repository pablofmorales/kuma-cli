/**
 * semantic-release configuration for @blackasteroid/kuma-cli
 *
 * Versioning rules:
 *   feat:               → minor (0.X.0)
 *   fix: / perf:        → patch (0.0.X)
 *   feat!: / BREAKING CHANGE in footer → major (X.0.0)
 *   docs: / chore: / ci: / refactor:   → no release
 */
module.exports = {
  branches: ["main"],

  plugins: [
    // 1. Analyze commits using Conventional Commits
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" },
          { type: "revert", release: "patch" },
          // docs/chore/ci/refactor → no release (omitted = no bump)
        ],
        parserOpts: {
          noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES"],
        },
      },
    ],

    // 2. Generate release notes
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: [
            { type: "feat", section: "🚀 Features" },
            { type: "fix", section: "🐛 Bug Fixes" },
            { type: "perf", section: "⚡ Performance" },
            { type: "revert", section: "⏪ Reverts" },
            { type: "docs", section: "📚 Documentation", hidden: false },
            { type: "chore", section: "🔧 Maintenance", hidden: true },
            { type: "ci", section: "👷 CI", hidden: true },
            { type: "refactor", section: "♻️ Refactoring", hidden: true },
          ],
        },
      },
    ],

    // 3. Update CHANGELOG.md
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],

    // 4. Build before publishing
    [
      "@semantic-release/exec",
      {
        prepareCmd: "npm run build",
      },
    ],

    // 5. Publish to npm
    [
      "@semantic-release/npm",
      {
        npmPublish: true,
        pkgRoot: ".",
      },
    ],

    // 6. Create GitHub Release
    [
      "@semantic-release/github",
      {
        assets: [],
        // Add release notes as PR comment on related PRs
        addReleases: "bottom",
      },
    ],

    // 7. Commit updated package.json + CHANGELOG.md back to main
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "package-lock.json", "CHANGELOG.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};
